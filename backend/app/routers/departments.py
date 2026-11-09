"""
FastAPI Departments & Administrative Routing Rules Router.
Provides 100% parity with server.ts endpoints for department configuration and routing rules.
"""

from datetime import datetime, timezone
import json
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.db.session import get_db_session
    from backend.app.db.models import Department, CategoryRoutingRule, AuditLog, User
    from backend.app.routers.dependencies import require_super_admin
except ImportError:
    from app.db.session import get_db_session
    from app.db.models import Department, CategoryRoutingRule, AuditLog, User
    from app.routers.dependencies import require_super_admin

router = APIRouter(tags=["Departments"])


@router.get("/api/departments")
async def get_departments(db: AsyncSession = Depends(get_db_session)):
    stmt = select(Department).where(Department.is_active == True)
    result = await db.execute(stmt)
    departments = result.scalars().all()
    return [dept.to_dict() for dept in departments]


@router.get("/api/admin/departments")
async def get_admin_departments(
    onlyActive: bool = Query(False),
    user: Dict[str, Any] = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(Department)
    if onlyActive:
        stmt = stmt.where(Department.is_active == True)
    result = await db.execute(stmt)
    departments = result.scalars().all()
    return {"success": True, "departments": [dept.to_dict() for dept in departments]}


@router.post("/api/admin/departments")
async def create_department(
    request: Request,
    user: Dict[str, Any] = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    name = str(body.get("name") or "").strip()
    code = str(body.get("code") or "").strip()
    contact_email = str(body.get("contactEmail") or body.get("headEmail") or body.get("contact_email") or "").strip()

    if not name or not code or not contact_email:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "name, code, and contactEmail are required."},
        )

    stmt = select(Department).where(Department.code == code)
    res = await db.execute(stmt)
    if res.scalars().first():
        return JSONResponse(
            status_code=409,
            content={"success": False, "error": f"Department code {code} already exists."},
        )

    dept_id = str(body.get("id") or f"dept-{code.lower()}")
    dept = Department(
        id=dept_id,
        name=name,
        code=code,
        contact_email=contact_email,
        is_active=bool(body.get("isActive", True)),
    )
    db.add(dept)

    audit = AuditLog(
        id=f"audit-{int(time.time() * 1000)}",
        entity_type="department",
        entity_id=dept.id,
        action="CREATE_DEPARTMENT",
        actor_id=user.get("id", "super-admin"),
        actor_email=user.get("email", "admin@campus.edu"),
        actor_role=user.get("role", "SUPER_ADMIN"),
        new_state=json.dumps(dept.to_dict()),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(dept)

    return {"success": True, "department": dept.to_dict()}


@router.put("/api/admin/departments/{dept_id}")
async def update_department(
    dept_id: str,
    request: Request,
    user: Dict[str, Any] = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    stmt = select(Department).where(Department.id == dept_id)
    res = await db.execute(stmt)
    dept = res.scalars().first()
    if not dept:
        return JSONResponse(status_code=404, content={"success": False, "error": "Department not found"})

    prev_state = dept.to_dict()
    if "name" in body:
        dept.name = body["name"]
    if "code" in body:
        dept.code = body["code"]
    if "headEmail" in body or "contactEmail" in body or "contact_email" in body:
        dept.contact_email = body.get("headEmail") or body.get("contactEmail") or body.get("contact_email")
    if "isActive" in body:
        dept.is_active = bool(body["isActive"])

    audit = AuditLog(
        id=f"audit-{int(time.time() * 1000)}",
        entity_type="department",
        entity_id=dept.id,
        action="UPDATE_DEPARTMENT",
        actor_id=user.get("id", "super-admin"),
        actor_email=user.get("email", "admin@campus.edu"),
        actor_role=user.get("role", "SUPER_ADMIN"),
        previous_state=json.dumps(prev_state),
        new_state=json.dumps(dept.to_dict()),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(dept)

    return {"success": True, "department": dept.to_dict()}


@router.get("/api/admin/routing-rules")
async def get_routing_rules(
    user: Dict[str, Any] = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(CategoryRoutingRule).order_by(CategoryRoutingRule.priority_order.asc())
    res = await db.execute(stmt)
    rules = res.scalars().all()
    return {"success": True, "rules": [r.to_dict() for r in rules]}


@router.post("/api/admin/routing-rules")
async def create_routing_rule(
    request: Request,
    user: Dict[str, Any] = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    category = body.get("category")
    dept_id = body.get("departmentId") or body.get("department_id")

    if not category or not dept_id:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "category and departmentId are required."},
        )

    rule_id = str(body.get("id") or f"rule-{int(time.time() * 1000)}")
    rule = CategoryRoutingRule(
        id=rule_id,
        category=category,
        department_id=dept_id,
        priority_override=body.get("priorityOverride") or body.get("priority_override"),
        location_tag_pattern=body.get("locationTagPattern") or body.get("location_tag_pattern"),
        priority_order=int(body.get("priorityOrder") or body.get("priority_order") or 0),
        is_active=bool(body.get("isActive", True)),
    )
    db.add(rule)

    audit = AuditLog(
        id=f"audit-{int(time.time() * 1000)}",
        entity_type="routing_rule",
        entity_id=rule.id,
        action="CREATE_ROUTING_RULE",
        actor_id=user.get("id", "super-admin"),
        actor_email=user.get("email", "admin@campus.edu"),
        actor_role=user.get("role", "SUPER_ADMIN"),
        new_state=json.dumps(rule.to_dict()),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(rule)

    return {"success": True, "rule": rule.to_dict()}


@router.put("/api/admin/routing-rules/{rule_id}")
async def update_routing_rule(
    rule_id: str,
    request: Request,
    user: Dict[str, Any] = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    stmt = select(CategoryRoutingRule).where(CategoryRoutingRule.id == rule_id)
    res = await db.execute(stmt)
    rule = res.scalars().first()
    if not rule:
        return JSONResponse(status_code=404, content={"success": False, "error": "Routing rule not found"})

    prev_state = rule.to_dict()
    if "category" in body:
        rule.category = body["category"]
    if "departmentId" in body or "department_id" in body:
        rule.department_id = body.get("departmentId") or body.get("department_id")
    if "priorityOverride" in body or "priority_override" in body:
        rule.priority_override = body.get("priorityOverride") or body.get("priority_override")
    if "locationTagPattern" in body or "location_tag_pattern" in body:
        rule.location_tag_pattern = body.get("locationTagPattern") or body.get("location_tag_pattern")
    if "priorityOrder" in body or "priority_order" in body:
        rule.priority_order = int(body.get("priorityOrder") or body.get("priority_order"))
    if "isActive" in body:
        rule.is_active = bool(body["isActive"])

    audit = AuditLog(
        id=f"audit-{int(time.time() * 1000)}",
        entity_type="routing_rule",
        entity_id=rule.id,
        action="UPDATE_ROUTING_RULE",
        actor_id=user.get("id", "super-admin"),
        actor_email=user.get("email", "admin@campus.edu"),
        actor_role=user.get("role", "SUPER_ADMIN"),
        previous_state=json.dumps(prev_state),
        new_state=json.dumps(rule.to_dict()),
    )
    db.add(audit)
    await db.commit()
    await db.refresh(rule)

    return {"success": True, "rule": rule.to_dict()}


@router.delete("/api/admin/routing-rules/{rule_id}")
async def delete_routing_rule(
    rule_id: str,
    user: Dict[str, Any] = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(CategoryRoutingRule).where(CategoryRoutingRule.id == rule_id)
    res = await db.execute(stmt)
    rule = res.scalars().first()
    if not rule:
        return JSONResponse(status_code=404, content={"success": False, "error": "Routing rule not found"})

    await db.delete(rule)
    audit = AuditLog(
        id=f"audit-{int(time.time() * 1000)}",
        entity_type="routing_rule",
        entity_id=rule_id,
        action="DELETE_ROUTING_RULE",
        actor_id=user.get("id", "super-admin"),
        actor_email=user.get("email", "admin@campus.edu"),
        actor_role=user.get("role", "SUPER_ADMIN"),
    )
    db.add(audit)
    await db.commit()

    return {"success": True, "message": "Routing rule deleted successfully"}


@router.post("/api/admin/users/assign-department")
async def assign_user_department(
    request: Request,
    user: Dict[str, Any] = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    user_id = body.get("userId") or body.get("user_id")
    dept_id = body.get("departmentId") or body.get("department_id")

    if not user_id:
        return JSONResponse(status_code=400, content={"success": False, "error": "userId is required"})

    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    target_user = res.scalars().first()
    if not target_user:
        return JSONResponse(status_code=404, content={"success": False, "error": "User not found"})

    prev_dept = target_user.department_id
    target_user.department_id = dept_id
    audit = AuditLog(
        id=f"audit-{int(time.time() * 1000)}",
        entity_type="user",
        entity_id=user_id,
        action="ASSIGN_DEPARTMENT",
        actor_id=user.get("id", "super-admin"),
        actor_email=user.get("email", "admin@campus.edu"),
        actor_role=user.get("role", "SUPER_ADMIN"),
        previous_state=json.dumps({"departmentId": prev_dept}),
        new_state=json.dumps({"departmentId": dept_id}),
    )
    db.add(audit)
    await db.commit()

    return {
        "success": True,
        "message": f"Assigned user {user_id} to department {dept_id}",
        "userId": user_id,
        "departmentId": dept_id,
    }
