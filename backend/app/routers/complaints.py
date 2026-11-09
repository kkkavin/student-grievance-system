"""
FastAPI Grievances & Core Triage Router.
Dual-mounted at /api/complaints and /api/grievances.
Supports:
- 3-Stage AI classification & campus validation
- 384-d vector embeddings & deduplication auto-merge
- Single-click cascading resolution
- Peer upvotes and public master notes
- Strict row-level access control (RLAC)
"""

import asyncio
from datetime import datetime, timezone
import math
import random
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.db.session import get_db_session
    from backend.app.db.models import (
        Complaint,
        ComplaintUpvote,
        Department,
        CategoryRoutingRule,
        AuditLog,
        Notification,
    )
    from backend.app.ml.classifier import (
        classify_complaint,
        CATEGORY_DEPARTMENT_MAP_10,
        CATEGORY_DEPARTMENT_MAP_5,
    )
    from backend.app.ml.deduplication import (
        generate_embedding_vector,
        run_two_stage_deduplication,
        evaluate_deduplication,
    )
    from backend.app.routers.dependencies import (
        get_current_user,
        get_current_user_optional,
        require_super_admin,
        enforce_complaint_rlac,
    )
except ImportError:
    from app.db.session import get_db_session
    from app.db.models import (
        Complaint,
        ComplaintUpvote,
        Department,
        CategoryRoutingRule,
        AuditLog,
        Notification,
    )
    from app.ml.classifier import (
        classify_complaint,
        CATEGORY_DEPARTMENT_MAP_10,
        CATEGORY_DEPARTMENT_MAP_5,
    )
    from app.ml.deduplication import (
        generate_embedding_vector,
        run_two_stage_deduplication,
        evaluate_deduplication,
    )
    from app.routers.dependencies import (
        get_current_user,
        get_current_user_optional,
        require_super_admin,
        enforce_complaint_rlac,
    )

router = APIRouter()

# Concurrency lock for atomic burst deduplication
_dedup_locks: Dict[Any, asyncio.Lock] = {}

def get_dedup_lock() -> asyncio.Lock:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.get_event_loop()
    if loop not in _dedup_locks:
        _dedup_locks[loop] = asyncio.Lock()
    return _dedup_locks[loop]


@router.get("")
async def list_complaints(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    departmentId: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    regNo: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(Complaint).order_by(Complaint.created_at.desc())

    # RLAC Scoping
    if user:
        role = str(user.get("role", "")).upper()
        if role == "STUDENT":
            user_reg = user.get("regNo") or user.get("reg_no")
            if user_reg:
                stmt = stmt.where(Complaint.student_reg_no == user_reg)
        elif role == "DEPARTMENT_ADMIN":
            user_dept = user.get("departmentId") or user.get("department_id")
            if user_dept:
                stmt = stmt.where(Complaint.assigned_department_id == user_dept)

    # Query filters
    if status:
        stmt = stmt.where(Complaint.status == status)
    if category:
        stmt = stmt.where(Complaint.category == category)
    target_dept = departmentId or department
    if target_dept:
        stmt = stmt.where(Complaint.assigned_department_id == target_dept)
    if regNo:
        stmt = stmt.where(Complaint.student_reg_no == regNo.upper().strip())
    if priority:
        stmt = stmt.where(Complaint.priority == priority.lower())

    res = await db.execute(stmt)
    complaints = res.scalars().all()
    return [c.to_dict() for c in complaints]


@router.get("/triage")
async def get_triage_queue(
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(Complaint).where(Complaint.status != "Resolved").order_by(Complaint.created_at.desc())
    if user:
        role = str(user.get("role", "")).upper()
        if role == "DEPARTMENT_ADMIN":
            dept = user.get("departmentId") or user.get("department_id")
            if dept:
                stmt = stmt.where(Complaint.assigned_department_id == dept)

    res = await db.execute(stmt)
    complaints = res.scalars().all()
    triage_items = []
    duplicate_count = 0

    for c in complaints:
        is_dup = bool(c.master_case_id or c.status == "SUSPECTED_DUPLICATE")
        if is_dup:
            duplicate_count += 1
        triage_items.append({
            "grievance": c.to_dict(),
            "matchCandidates": [],
            "recommendedAction": "MERGE" if is_dup else "AUTO_ROUTE",
            "clusterSize": 1,
        })

    return {
        "queue": triage_items,
        "totalUnresolved": len(complaints),
        "duplicateSuspectsCount": duplicate_count,
    }


@router.get("/{id}")
async def get_complaint_by_id(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(Complaint).where(Complaint.id == id)
    res = await db.execute(stmt)
    complaint = res.scalars().first()

    if not complaint:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Grievance not found"})

    enforce_complaint_rlac(complaint, user)
    return complaint.to_dict()


@router.post("", status_code=201)
async def create_complaint(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    raw_desc = str(body.get("description") or "").strip()
    title = str(body.get("title") or (raw_desc[:60] if raw_desc else "Complaint")).strip()
    student_type = body.get("studentType") or body.get("student_type")

    # ML Gatekeeper: accept ragging/harassment without location tag; reject off-campus
    classification = classify_complaint(
        raw_desc,
        student_type,
        {
            "category": body.get("category"),
            "hostelBlock": body.get("hostelBlock") or body.get("hostel_block"),
            "locationTag": body.get("locationTag") or body.get("location_tag"),
        },
    )

    if not classification["isValidComplaint"]:
        rejection_reason = classification["rejectionReason"]
        msg = (
            "Off-campus venue or non-campus ecosystem grievance"
            if rejection_reason == "OFF_CAMPUS_DOMAIN"
            else (rejection_reason or "Invalid grievance")
        )
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": f"Complaint rejected: {msg}",
                "rejectionReason": rejection_reason,
                "isValidComplaint": False,
            },
        )

    cat = classification["category"] or body.get("category") or "Others"
    dept_id = body.get("departmentId") or body.get("department_id")
    if not dept_id:
        rule_stmt = select(CategoryRoutingRule).where(CategoryRoutingRule.category == cat)
        rule_res = await db.execute(rule_stmt)
        rule = rule_res.scalars().first()
        if rule and rule.department_id:
            dept_id = rule.department_id
        else:
            cand_depts = [
                CATEGORY_DEPARTMENT_MAP_10.get(cat),
                CATEGORY_DEPARTMENT_MAP_5.get(cat),
                classification.get("departmentId"),
                "dept-hostel",
                "dept-infra",
                "dept-transport",
                "dept-it",
            ]
            for cand_d in cand_depts:
                if cand_d:
                    d_row = await db.get(Department, cand_d)
                    if d_row:
                        dept_id = cand_d
                        break
            if not dept_id:
                first_dept = await db.scalar(select(Department).where(Department.is_active == True))
                if first_dept:
                    dept_id = first_dept.id
    priority = classification["priority"]

    # Generate 384-dimensional vector embedding
    hostel_block = body.get("hostelBlock") or body.get("hostel_block")
    room_no = body.get("roomNo") or body.get("room_no")
    location_tag = body.get("locationTag") or body.get("location_tag")
    if not location_tag:
        if hostel_block:
            location_tag = f"{hostel_block}{' - ' + room_no if room_no else ''}"
        else:
            location_tag = "Campus Facilities"

    embedding = generate_embedding_vector(raw_desc, [cat, hostel_block or "", room_no or "", location_tag])

    # Atomic deduplication and persistence under lock
    async with get_dedup_lock():
        # Check candidate complaints in same category within active window.
        # Exclude child/merged and resolved tickets to prevent candidate pool starvation.
        # Order by created_at DESC to evaluate the most recent primary complaints first.
        cand_stmt = (
            select(Complaint)
            .where(
                and_(
                    Complaint.category == cat,
                    Complaint.master_case_id.is_(None),
                    Complaint.status.not_in(["MERGED_AUTOMATIC", "merged", "Resolved", "resolved"]),
                )
            )
            .order_by(Complaint.created_at.desc())
            .limit(100)
        )
        cand_res = await db.execute(cand_stmt)
        candidates = [c.to_dict() for c in cand_res.scalars().all()]

        dedup = run_two_stage_deduplication(
            {
                "category": cat,
                "description": raw_desc,
                "hostel_block": hostel_block,
                "room_no": room_no,
                "student_type": (student_type or "hosteller").lower(),
                "location_tag": location_tag,
                "embedding": embedding,
            },
            candidates,
        )

        # Unique high-entropy ticket numbering matching regex ^GRV-\d{4}-[A-Z0-9]+-\d{6}$
        rand_hex = f"{random.randint(0x1000, 0xFFFF):04X}"
        rand_digits = f"{random.randint(100000, 999999):06d}"
        ticket_no = f"GRV-{datetime.now().year}-{rand_hex}-{rand_digits}"
        complaint_id = f"tkt-{ticket_no.lower()}"

        if dedup["action"] == "AUTO_MERGE":
            complaint_status = "MERGED_AUTOMATIC"
            dup_of_id = dedup["masterCaseId"]
            sim_score = dedup["similarityScore"]
            merged_at_val = datetime.now(timezone.utc)
        elif dedup["action"] == "SUSPECTED_DUPLICATE":
            complaint_status = "SUSPECTED_DUPLICATE"
            dup_of_id = dedup["masterCaseId"]
            sim_score = dedup["similarityScore"]
            merged_at_val = None
        else:
            complaint_status = body.get("status") or "PRIMARY"
            dup_of_id = None
            sim_score = None
            merged_at_val = None

        recipient_email = body.get("studentEmail") or body.get("student_email") or "student@campus.edu"

        complaint = Complaint(
            id=complaint_id,
            ticket_no=ticket_no,
            student_reg_no=body.get("studentRegNo") or body.get("regNo") or body.get("reg_no") or "STU-GEN",
            student_name=body.get("studentName") or body.get("student_name") or "Student",
            student_email=recipient_email,
            student_phone=body.get("studentPhone") or body.get("phone"),
            student_type=(student_type or "hosteller").lower(),
            hostel_block=hostel_block,
            room_no=room_no,
            category=cat,
            description=raw_desc,
            priority=priority,
            status=complaint_status,
            is_spam=False,
            assigned_department_id=dept_id,
            master_case_id=dup_of_id,
            location_tag=location_tag,
            embedding=embedding,
            similarity_score=sim_score,
            merged_at=merged_at_val,
        )
        db.add(complaint)

        # Notification outbox
        notif = Notification(
            id=f"eml_{random.randint(100000, 999999)}",
            recipient=recipient_email,
            subject=f"Grievance Registered - Ticket #{ticket_no}",
            body=f"Dear {complaint.student_name},\n\nYour grievance (#{ticket_no}) has been recorded.",
            type="confirmation",
        )
        db.add(notif)
        await db.commit()
        await db.refresh(complaint)

    return complaint.to_dict()


@router.put("/{id}")
async def update_complaint(
    id: str,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    stmt = select(Complaint).where(Complaint.id == id)
    res = await db.execute(stmt)
    complaint = res.scalars().first()
    if not complaint:
        return JSONResponse(status_code=404, content={"success": False, "error": "Grievance not found"})

    enforce_complaint_rlac(complaint, user)

    if "status" in body:
        complaint.status = body["status"]
    if "priority" in body:
        complaint.priority = body["priority"]
    if "departmentId" in body or "department_id" in body:
        complaint.assigned_department_id = body.get("departmentId") or body.get("department_id")
    if "adminNotes" in body or "admin_notes" in body:
        complaint.admin_notes = body.get("adminNotes") or body.get("admin_notes")

    await db.commit()
    await db.refresh(complaint)
    return {"success": True, "id": complaint.id, "grievance": complaint.to_dict()}


@router.post("/{id}/resolve")
@router.post("/{id}/resolve-cascade")
@router.put("/{id}/resolve")
async def resolve_complaint_cascade(
    id: str,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json() if request.method in ("PUT", "POST") else {}
    stmt = select(Complaint).where(Complaint.id == id)
    res = await db.execute(stmt)
    complaint = res.scalars().first()
    if not complaint:
        return JSONResponse(status_code=404, content={"success": False, "error": "Grievance not found"})

    enforce_complaint_rlac(complaint, user)

    note = body.get("resolutionNote") or body.get("adminNotes") or body.get("resolutionNotes") or "Issue verified and resolved."
    now_utc = datetime.now(timezone.utc)

    complaint.status = "resolved"
    complaint.resolved_at = now_utc
    complaint.admin_notes = note

    # Cascading resolution: resolve all child tickets
    child_stmt = select(Complaint).where(Complaint.master_case_id == id)
    child_res = await db.execute(child_stmt)
    children = child_res.scalars().all()
    child_ids = []

    for ch in children:
        ch.status = "resolved"
        ch.resolved_at = now_utc
        ch.admin_notes = f"Resolved via parent ticket #{id}: {note}"
        child_ids.append(ch.id)

    # Fan out notifications to master and all child ticket reporters
    all_tickets = [complaint] + list(children)
    for tkt in all_tickets:
        if tkt.student_email:
            notif = Notification(
                id=f"eml_{random.randint(100000, 999999)}_{tkt.id[:8]}",
                recipient=tkt.student_email,
                subject=f"Grievance Resolved - Ticket #{tkt.ticket_no}",
                body=f"Your complaint #{tkt.ticket_no} has been resolved: {note}",
                type="resolution",
            )
            db.add(notif)

    await db.commit()

    return {
        "success": True,
        "parentId": id,
        "parentTicketId": complaint.ticket_no,
        "resolvedCount": 1 + len(child_ids),
        "childIds": child_ids,
        "notificationsSent": 1 + len(child_ids),
        "timestamp": now_utc.isoformat(),
    }


@router.post("/{id}/upvote")
async def upvote_complaint(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    c_stmt = select(Complaint).where(Complaint.id == id)
    c_res = await db.execute(c_stmt)
    complaint = c_res.scalars().first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    user_id = user.get("id")
    uv_stmt = select(ComplaintUpvote).where(
        ComplaintUpvote.complaint_id == id,
        ComplaintUpvote.user_id == user_id,
    )
    uv_res = await db.execute(uv_stmt)
    existing = uv_res.scalars().first()

    if not existing:
        upvote = ComplaintUpvote(
            id=f"upv-{int(time.time() * 1000)}-{random.randint(100, 999)}",
            complaint_id=id,
            user_id=user_id,
        )
        db.add(upvote)
        await db.commit()

    count_stmt = select(ComplaintUpvote).where(ComplaintUpvote.complaint_id == id)
    count_res = await db.execute(count_stmt)
    total_upvotes = len(count_res.scalars().all())

    return {"success": True, "upvoted": True, "upvoteCount": total_upvotes}


@router.delete("/{id}/upvote")
async def remove_upvote(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    user_id = user.get("id")
    del_stmt = delete(ComplaintUpvote).where(
        ComplaintUpvote.complaint_id == id,
        ComplaintUpvote.user_id == user_id,
    )
    await db.execute(del_stmt)
    await db.commit()

    count_stmt = select(ComplaintUpvote).where(ComplaintUpvote.complaint_id == id)
    count_res = await db.execute(count_stmt)
    total_upvotes = len(count_res.scalars().all())

    return {"success": True, "upvoted": False, "upvoteCount": total_upvotes}


@router.put("/{id}/master-notes")
async def update_master_notes(
    id: str,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    stmt = select(Complaint).where(Complaint.id == id)
    res = await db.execute(stmt)
    complaint = res.scalars().first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    enforce_complaint_rlac(complaint, user)
    complaint.public_master_notes = body.get("publicMasterNotes") or body.get("masterNotes")
    await db.commit()
    return {"success": True, "id": id, "publicMasterNotes": complaint.public_master_notes}


@router.post("/merge")
async def merge_complaints(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    master_id = body.get("masterId") or body.get("primaryId")
    child_id = body.get("childId") or (body.get("duplicateIds", [None])[0] if body.get("duplicateIds") else None)

    if not master_id or not child_id:
        return JSONResponse(status_code=400, content={"error": "masterId and childId are required"})

    stmt_m = select(Complaint).where(Complaint.id == master_id)
    res_m = await db.execute(stmt_m)
    master = res_m.scalars().first()

    stmt_c = select(Complaint).where(Complaint.id == child_id)
    res_c = await db.execute(stmt_c)
    child = res_c.scalars().first()

    if not master or not child:
        return JSONResponse(status_code=404, content={"error": "Master or child ticket not found"})

    child.status = "MERGED_AUTOMATIC"
    child.master_case_id = master.id

    await db.commit()
    return {"success": True, "masterId": master.id, "childId": child.id, "status": "MERGED_AUTOMATIC"}


@router.post("/detach")
async def detach_complaint(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    child_id = body.get("childId") or body.get("complaintId")
    if not child_id:
        return JSONResponse(status_code=400, content={"error": "childId is required"})

    stmt = select(Complaint).where(Complaint.id == child_id)
    res = await db.execute(stmt)
    child = res.scalars().first()
    if not child:
        return JSONResponse(status_code=404, content={"error": "Ticket not found"})

    child.status = "PRIMARY"
    child.master_case_id = None
    await db.commit()

    return {"success": True, "detachedTicketId": child.id, "newStatus": "PRIMARY"}


@router.post("/{id}/reassign")
@router.patch("/{id}/reassign")
async def reassign_complaint(
    id: str,
    request: Request,
    user: Dict[str, Any] = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    target_dept = body.get("departmentId") or body.get("department_id") or body.get("targetDepartmentId")
    reason = body.get("reason") or "Manual re-assignment by Super Admin"

    if not target_dept:
        return JSONResponse(status_code=400, content={"success": False, "error": "departmentId is required."})

    stmt = select(Complaint).where(Complaint.id == id)
    res = await db.execute(stmt)
    complaint = res.scalars().first()
    if not complaint:
        return JSONResponse(status_code=404, content={"success": False, "error": "Grievance not found."})

    prev_dept = complaint.assigned_department_id
    complaint.assigned_department_id = target_dept

    import json
    audit = AuditLog(
        id=f"audit-{int(time.time() * 1000)}",
        entity_type="grievance",
        entity_id=id,
        action="REASSIGN_GRIEVANCE",
        actor_id=user.get("id", "super-admin"),
        actor_email=user.get("email", "admin@campus.edu"),
        actor_role=user.get("role", "SUPER_ADMIN"),
        previous_state=json.dumps({"departmentId": prev_dept}),
        new_state=json.dumps({"departmentId": target_dept, "reason": reason}),
    )
    db.add(audit)
    await db.commit()

    return {
        "success": True,
        "message": f"Grievance {id} successfully reassigned to {target_dept}",
        "grievance": complaint.to_dict(),
    }


@router.post("/{id}/request-reassign")
async def request_reassign(
    id: str,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    stmt = select(Complaint).where(Complaint.id == id)
    res = await db.execute(stmt)
    complaint = res.scalars().first()
    if not complaint:
        return JSONResponse(status_code=404, content={"success": False, "error": "Grievance not found."})

    suggested = body.get("suggestedDepartmentId") or body.get("suggestedDepartment")
    reason = body.get("reason") or "Department staff flagged for reassignment"

    return {
        "success": True,
        "message": f"Reassignment requested for ticket {id}",
        "ticketId": id,
        "suggestedDepartment": suggested,
        "reason": reason,
    }


@router.post("/{id}/escalate")
async def escalate_complaint(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(Complaint).where(Complaint.id == id)
    res = await db.execute(stmt)
    complaint = res.scalars().first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    complaint.status = "Escalated"
    await db.commit()
    return {"success": True, "id": id, "status": "Escalated"}
