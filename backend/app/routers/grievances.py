"""
FastAPI Grievances & Core Triage Router.
Standardized domain router for campus grievance management.
Mounted at /api/v1/grievances (primary) and aliased to /api/grievances and /api/complaints.
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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, and_, delete
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.db.session import get_db_session
    from backend.app.db.models import (
        Grievance,
        GrievanceUpvote,
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
        compute_embedding,
        compute_cosine_similarity,
        find_semantic_duplicate,
    )
    from backend.app.services.email_service import send_status_update_email
    from backend.app.services.webhook_service import dispatch_webhook_alert
    from backend.app.routers.dependencies import (
        get_current_user,
        get_current_user_optional,
        require_super_admin,
        enforce_grievance_rlac,
        enforce_complaint_rlac,
    )
except ImportError:
    from app.db.session import get_db_session
    from app.db.models import (
        Grievance,
        GrievanceUpvote,
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
        compute_embedding,
        compute_cosine_similarity,
        find_semantic_duplicate,
    )
    from app.services.email_service import send_status_update_email
    from app.services.webhook_service import dispatch_webhook_alert
    from app.routers.dependencies import (
        get_current_user,
        get_current_user_optional,
        require_super_admin,
        enforce_grievance_rlac,
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
async def list_grievances(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    departmentId: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    regNo: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(Grievance).order_by(Grievance.created_at.desc())

    # RLAC Scoping
    if user:
        role = str(user.get("role", "")).upper()
        if role == "STUDENT":
            user_reg = user.get("regNo") or user.get("reg_no")
            if user_reg:
                stmt = stmt.where(Grievance.student_reg_no == user_reg)
        elif role == "DEPARTMENT_ADMIN":
            user_dept = user.get("departmentId") or user.get("department_id")
            if user_dept:
                stmt = stmt.where(Grievance.assigned_department_id == user_dept)

    # Query filters
    if status:
        stmt = stmt.where(Grievance.status == status)
    if category:
        stmt = stmt.where(Grievance.category == category)
    target_dept = departmentId or department
    if target_dept:
        stmt = stmt.where(Grievance.assigned_department_id == target_dept)
    if regNo:
        stmt = stmt.where(Grievance.student_reg_no == regNo.upper().strip())
    if priority:
        stmt = stmt.where(Grievance.priority == priority.lower())

    res = await db.execute(stmt)
    grievances = res.scalars().all()
    return [g.to_dict() for g in grievances]


@router.get("/triage")
async def get_triage_queue(
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(Grievance).where(Grievance.status != "Resolved").order_by(Grievance.created_at.desc())
    if user:
        role = str(user.get("role", "")).upper()
        if role == "DEPARTMENT_ADMIN":
            dept = user.get("departmentId") or user.get("department_id")
            if dept:
                stmt = stmt.where(Grievance.assigned_department_id == dept)

    res = await db.execute(stmt)
    grievances = res.scalars().all()
    triage_items = []
    duplicate_count = 0

    for g in grievances:
        is_dup = bool(g.master_case_id or g.status == "SUSPECTED_DUPLICATE")
        if is_dup:
            duplicate_count += 1
        triage_items.append({
            "grievance": g.to_dict(),
            "matchCandidates": [],
            "recommendedAction": "MERGE" if is_dup else "AUTO_ROUTE",
            "clusterSize": 1,
        })

    return {
        "queue": triage_items,
        "totalUnresolved": len(grievances),
        "duplicateSuspectsCount": duplicate_count,
    }


@router.get("/{id}")
async def get_grievance_by_id(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(Grievance).where(Grievance.id == id)
    res = await db.execute(stmt)
    grievance = res.scalars().first()

    if not grievance:
        raise HTTPException(status_code=404, detail={"success": False, "error": "Grievance not found"})

    enforce_grievance_rlac(grievance, user)
    return grievance.to_dict()


@router.post("", status_code=201)
async def create_grievance(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    raw_desc = str(body.get("description") or "").strip()
    title = str(body.get("title") or (raw_desc[:60] if raw_desc else "Grievance")).strip()
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

    explicit_priority = body.get("priority") or body.get("urgency")
    priority = (explicit_priority or classification["priority"]).upper()

    # Generate 384-dimensional vector embedding
    hostel_block = body.get("hostelBlock") or body.get("hostel_block")
    room_no = body.get("roomNo") or body.get("room_no")
    location_tag = body.get("locationTag") or body.get("location_tag")
    if not location_tag:
        if hostel_block:
            location_tag = f"{hostel_block}{' - ' + room_no if room_no else ''}"
        else:
            location_tag = "Campus Facilities"

    embedding = compute_embedding(raw_desc)

    # Atomic deduplication and persistence under lock
    new_ticket_meta = {
        "category": cat,
        "hostel_block": hostel_block,
        "hostelBlock": hostel_block,
        "room_no": room_no,
        "roomNo": room_no,
        "location_tag": location_tag,
        "locationTag": location_tag,
        "description": raw_desc,
    }
    async with get_dedup_lock():
        matched_parent = await find_semantic_duplicate(
            raw_desc, dept_id, db, threshold=0.80, new_ticket_meta=new_ticket_meta
        )

        # Unique high-entropy ticket numbering matching regex ^GRV-\d{4}-[A-Z0-9]+-\d{6}$
        rand_hex = f"{random.randint(0x1000, 0xFFFF):04X}"
        rand_digits = f"{random.randint(100000, 999999):06d}"
        ticket_no = f"GRV-{datetime.now().year}-{rand_hex}-{rand_digits}"
        grievance_id = f"tkt-{ticket_no.lower()}"

        if matched_parent:
            sim_score = getattr(matched_parent, "_similarity_score", 0.90)
            if sim_score >= 0.92:
                grievance_status = "MERGED_AUTOMATIC"
                dup_of_id = matched_parent.id
                intercepted_by_dedup = True
                merged_at_val = datetime.now(timezone.utc)
                # Increment parent duplicate count
                matched_parent.duplicate_count = (matched_parent.duplicate_count or 0) + 1
                db.add(matched_parent)
            elif sim_score >= 0.80:
                grievance_status = "SUSPECTED_DUPLICATE"
                dup_of_id = matched_parent.id
                intercepted_by_dedup = True
                merged_at_val = None
            else:
                grievance_status = body.get("status") or "PRIMARY"
                dup_of_id = None
                intercepted_by_dedup = False
                merged_at_val = None
                matched_parent = None
        else:
            grievance_status = body.get("status") or "PRIMARY"
            dup_of_id = None
            intercepted_by_dedup = False
            sim_score = None
            merged_at_val = None

        recipient_email = body.get("studentEmail") or body.get("student_email") or "student@campus.edu"

        grievance = Grievance(
            id=grievance_id,
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
            status=grievance_status,
            is_spam=False,
            assigned_department_id=dept_id,
            duplicate_of_id=dup_of_id,
            master_case_id=dup_of_id,
            duplicate_count=0,
            intercepted_by_dedup=intercepted_by_dedup,
            location_tag=location_tag,
            embedding=embedding,
            similarity_score=sim_score,
            merged_at=merged_at_val,
        )
        db.add(grievance)

        # Notification outbox record
        notif = Notification(
            id=f"eml_{random.randint(100000, 999999)}",
            recipient=recipient_email,
            subject=f"Grievance Registered - Ticket #{ticket_no}",
            body=f"Dear {grievance.student_name},\n\nYour grievance (#{ticket_no}) has been recorded.",
            type="confirmation",
        )
        db.add(notif)
        await db.commit()
        await db.refresh(grievance)
        if matched_parent:
            await db.refresh(matched_parent)

    # Enqueue BackgroundTasks
    background_tasks.add_task(
        send_status_update_email,
        grievance.id,
        recipient_email,
        None,
        grievance_status,
        f"Grievance recorded with ticket #{ticket_no}",
    )

    is_critical = (
        (priority or "").upper() == "CRITICAL"
        or (body.get("priority") or "").upper() == "CRITICAL"
    )
    if is_critical:
        background_tasks.add_task(dispatch_webhook_alert, "grievance.critical", grievance.to_dict())

    if matched_parent and (matched_parent.duplicate_count or 0) >= 3:
        background_tasks.add_task(dispatch_webhook_alert, "grievance.duplicate_cluster", matched_parent.to_dict())

    return grievance.to_dict()


@router.put("/{id}")
async def update_grievance(
    id: str,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    stmt = select(Grievance).where(Grievance.id == id)
    res = await db.execute(stmt)
    grievance = res.scalars().first()
    if not grievance:
        return JSONResponse(status_code=404, content={"success": False, "error": "Grievance not found"})

    enforce_grievance_rlac(grievance, user)

    if "status" in body:
        grievance.status = body["status"]
    if "priority" in body:
        grievance.priority = body["priority"]
    if "departmentId" in body or "department_id" in body:
        grievance.assigned_department_id = body.get("departmentId") or body.get("department_id")
    if "adminNotes" in body or "admin_notes" in body:
        grievance.admin_notes = body.get("adminNotes") or body.get("admin_notes")

    await db.commit()
    await db.refresh(grievance)
    return {"success": True, "id": grievance.id, "grievance": grievance.to_dict()}


@router.patch("/{id}/status")
async def patch_grievance_status(
    id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    new_status = body.get("status")
    admin_notes = body.get("adminNotes") or body.get("admin_notes")
    new_priority = body.get("priority") or body.get("urgency")

    if not new_status and not new_priority and not admin_notes:
        return JSONResponse(status_code=400, content={"success": False, "error": "status, priority, or admin_notes is required."})

    stmt = select(Grievance).where(Grievance.id == id)
    res = await db.execute(stmt)
    grievance = res.scalars().first()
    if not grievance:
        return JSONResponse(status_code=404, content={"success": False, "error": "Grievance not found"})

    enforce_grievance_rlac(grievance, user)

    old_status = grievance.status
    if new_status:
        grievance.status = new_status
        if new_status.lower() in ("resolved", "closed"):
            grievance.resolved_at = datetime.now(timezone.utc)
    if new_priority:
        grievance.priority = new_priority
    if admin_notes:
        grievance.admin_notes = admin_notes

    await db.commit()
    await db.refresh(grievance)

    # Enqueue BackgroundTasks
    background_tasks.add_task(
        send_status_update_email,
        grievance.id,
        grievance.student_email,
        old_status,
        grievance.status,
        admin_notes,
    )

    is_critical = (
        (grievance.priority or "").upper() == "CRITICAL"
        or (new_priority or "").upper() == "CRITICAL"
        or (new_status or "").upper() == "CRITICAL"
    )
    if is_critical:
        background_tasks.add_task(dispatch_webhook_alert, "grievance.critical", grievance.to_dict())

    return {"success": True, "id": grievance.id, "grievance": grievance.to_dict()}


@router.post("/{id}/resolve")
@router.post("/{id}/resolve-cascade")
@router.put("/{id}/resolve")
async def resolve_grievance_cascade(
    id: str,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json() if request.method in ("PUT", "POST") else {}
    stmt = select(Grievance).where(Grievance.id == id)
    res = await db.execute(stmt)
    grievance = res.scalars().first()
    if not grievance:
        return JSONResponse(status_code=404, content={"success": False, "error": "Grievance not found"})

    enforce_grievance_rlac(grievance, user)

    note = (
        body.get("resolutionNote")
        or body.get("adminNotes")
        or body.get("resolutionNotes")
        or "Issue verified and resolved."
    )
    now_utc = datetime.now(timezone.utc)

    grievance.status = "resolved"
    grievance.resolved_at = now_utc
    grievance.admin_notes = note

    # Cascading resolution: resolve all child tickets
    child_stmt = select(Grievance).where(Grievance.master_case_id == id)
    child_res = await db.execute(child_stmt)
    children = child_res.scalars().all()
    child_ids = []

    for ch in children:
        ch.status = "resolved"
        ch.resolved_at = now_utc
        ch.admin_notes = f"Resolved via parent ticket #{id}: {note}"
        child_ids.append(ch.id)

    # Fan out notifications to master and all child ticket reporters
    all_tickets = [grievance] + list(children)
    for tkt in all_tickets:
        if tkt.student_email:
            notif = Notification(
                id=f"eml_{random.randint(100000, 999999)}_{tkt.id[:8]}",
                recipient=tkt.student_email,
                subject=f"Grievance Resolved - Ticket #{tkt.ticket_no}",
                body=f"Your grievance #{tkt.ticket_no} has been resolved: {note}",
                type="resolution",
            )
            db.add(notif)

    await db.commit()

    return {
        "success": True,
        "parentId": id,
        "parentTicketId": grievance.ticket_no,
        "resolvedCount": 1 + len(child_ids),
        "childIds": child_ids,
        "notificationsSent": 1 + len(child_ids),
        "timestamp": now_utc.isoformat(),
    }


@router.post("/{id}/upvote")
async def upvote_grievance(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    g_stmt = select(Grievance).where(Grievance.id == id)
    g_res = await db.execute(g_stmt)
    grievance = g_res.scalars().first()
    if not grievance:
        raise HTTPException(status_code=404, detail="Grievance not found")

    user_id = user.get("id")
    uv_stmt = select(GrievanceUpvote).where(
        GrievanceUpvote.complaint_id == id,
        GrievanceUpvote.user_id == user_id,
    )
    uv_res = await db.execute(uv_stmt)
    existing = uv_res.scalars().first()

    if not existing:
        upvote = GrievanceUpvote(
            id=f"upv-{int(time.time() * 1000)}-{random.randint(100, 999)}",
            complaint_id=id,
            user_id=user_id,
        )
        db.add(upvote)
        await db.commit()

    count_stmt = select(GrievanceUpvote).where(GrievanceUpvote.complaint_id == id)
    count_res = await db.execute(count_stmt)
    total_upvotes = len(count_res.scalars().all())

    return {"success": True, "upvoted": True, "upvoteCount": total_upvotes}


@router.delete("/{id}/upvote")
async def remove_upvote_grievance(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    user_id = user.get("id")
    del_stmt = delete(GrievanceUpvote).where(
        GrievanceUpvote.complaint_id == id,
        GrievanceUpvote.user_id == user_id,
    )
    await db.execute(del_stmt)
    await db.commit()

    count_stmt = select(GrievanceUpvote).where(GrievanceUpvote.complaint_id == id)
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
    stmt = select(Grievance).where(Grievance.id == id)
    res = await db.execute(stmt)
    grievance = res.scalars().first()
    if not grievance:
        raise HTTPException(status_code=404, detail="Grievance not found")

    enforce_grievance_rlac(grievance, user)
    grievance.public_master_notes = body.get("publicMasterNotes") or body.get("masterNotes")
    await db.commit()
    return {"success": True, "id": id, "publicMasterNotes": grievance.public_master_notes}


@router.post("/merge")
async def merge_grievances(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    master_id = body.get("masterId") or body.get("primaryId")
    child_id = body.get("childId") or (body.get("duplicateIds", [None])[0] if body.get("duplicateIds") else None)

    if not master_id or not child_id:
        return JSONResponse(status_code=400, content={"error": "masterId and childId are required"})

    stmt_m = select(Grievance).where(Grievance.id == master_id)
    res_m = await db.execute(stmt_m)
    master = res_m.scalars().first()

    stmt_c = select(Grievance).where(Grievance.id == child_id)
    res_c = await db.execute(stmt_c)
    child = res_c.scalars().first()

    if not master or not child:
        return JSONResponse(status_code=404, content={"error": "Master or child ticket not found"})

    child.status = "MERGED_AUTOMATIC"
    child.master_case_id = master.id

    await db.commit()
    return {"success": True, "masterId": master.id, "childId": child.id, "status": "MERGED_AUTOMATIC"}


@router.post("/detach")
async def detach_grievance(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    child_id = body.get("childId") or body.get("complaintId")
    if not child_id:
        return JSONResponse(status_code=400, content={"error": "childId is required"})

    stmt = select(Grievance).where(Grievance.id == child_id)
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
async def reassign_grievance(
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

    stmt = select(Grievance).where(Grievance.id == id)
    res = await db.execute(stmt)
    grievance = res.scalars().first()
    if not grievance:
        return JSONResponse(status_code=404, content={"success": False, "error": "Grievance not found."})

    prev_dept = grievance.assigned_department_id
    grievance.assigned_department_id = target_dept

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
        "grievance": grievance.to_dict(),
    }


@router.post("/{id}/request-reassign")
async def request_reassign(
    id: str,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    stmt = select(Grievance).where(Grievance.id == id)
    res = await db.execute(stmt)
    grievance = res.scalars().first()
    if not grievance:
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
async def escalate_grievance(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(Grievance).where(Grievance.id == id)
    res = await db.execute(stmt)
    grievance = res.scalars().first()
    if not grievance:
        raise HTTPException(status_code=404, detail="Grievance not found")

    grievance.status = "Escalated"
    await db.commit()
    return {"success": True, "id": id, "status": "Escalated"}


# Backward-compatibility handler aliases
list_complaints = list_grievances
get_complaint_by_id = get_grievance_by_id
create_complaint = create_grievance
update_complaint = update_grievance
resolve_complaint_cascade = resolve_grievance_cascade
upvote_complaint = upvote_grievance
remove_upvote = remove_upvote_grievance
merge_complaints = merge_grievances
detach_complaint = detach_grievance
reassign_complaint = reassign_grievance
escalate_complaint = escalate_grievance
