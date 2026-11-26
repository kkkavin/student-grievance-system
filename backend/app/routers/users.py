"""
FastAPI Users Router.
Provides user queries, registration, and authenticated password changes.
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.db.session import get_db_session
    from backend.app.db.models import User
    from backend.app.core.security import verify_password, hash_password
    from backend.app.routers.dependencies import get_current_user
except ImportError:
    from app.db.session import get_db_session
    from app.db.models import User
    from app.core.security import verify_password, hash_password
    from app.routers.dependencies import get_current_user

router = APIRouter()


@router.get("/{reg_no}")
async def get_user_by_reg_no(reg_no: str, db: AsyncSession = Depends(get_db_session)):
    stmt = select(User).where(User.reg_no == reg_no.upper().strip())
    res = await db.execute(stmt)
    user = res.scalars().first()
    if not user:
        return JSONResponse(status_code=404, content={"error": "User not found"})
    return user.to_dict()


@router.post("/")
async def create_or_upsert_user(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    reg_no = str(body.get("regNo") or body.get("reg_no") or "").strip().upper()
    name = str(body.get("name") or "").strip()
    email = str(body.get("email") or "").strip().lower()

    if not reg_no or not name:
        return JSONResponse(status_code=400, content={"error": "regNo and name are required"})

    stmt = select(User).where(User.reg_no == reg_no)
    res = await db.execute(stmt)
    user = res.scalars().first()

    if not user:
        user = User(
            id=f"user-{reg_no.lower()}",
            reg_no=reg_no,
            name=name,
            email=email or f"{reg_no.lower()}@campus.edu",
            role=str(body.get("role") or "student").lower(),
            phone=str(body.get("phone") or ""),
            gender=str(body.get("gender") or "Male"),
            student_type=str(body.get("studentType") or body.get("student_type") or "hosteller"),
            hostel_block=body.get("hostelBlock") or body.get("hostel_block"),
            room_no=body.get("roomNo") or body.get("room_no"),
        )
        db.add(user)
    else:
        user.name = name
        if email:
            user.email = email

    await db.commit()
    await db.refresh(user)
    return user.to_dict()


@router.put("/change-password")
async def change_password(
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    curr_pass = str(body.get("currentPassword") or "").strip()
    new_pass = str(body.get("newPassword") or "").strip()

    if not curr_pass or not new_pass:
        return JSONResponse(status_code=400, content={"error": "Current and new password are required."})

    stmt = select(User).where(User.id == user.get("id"))
    res = await db.execute(stmt)
    db_user = res.scalars().first()
    if not db_user:
        return JSONResponse(status_code=404, content={"error": "User record not found."})

    if not verify_password(curr_pass, db_user.password_hash or ""):
        return JSONResponse(status_code=401, content={"error": "Incorrect current password."})

    db_user.password_hash = hash_password(new_pass)
    await db.commit()
    return {"success": True, "message": "Password updated successfully."}
