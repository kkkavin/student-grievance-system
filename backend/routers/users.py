"""
FastAPI Users Router.
Provides user queries and registration by registration number.
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import get_db_session
from backend.db.models import User
from backend.routers.dependencies import get_current_user

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("/{reg_no}")
async def get_user_by_reg_no(reg_no: str, db: AsyncSession = Depends(get_db_session)):
    stmt = select(User).where(User.reg_no == reg_no.upper().strip())
    res = await db.execute(stmt)
    user = res.scalars().first()
    if not user:
        return JSONResponse(status_code=404, content={"error": "User not found"})
    return user.to_dict()


@router.post("")
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
        )
        db.add(user)
    else:
        user.name = name
        if email:
            user.email = email

    await db.commit()
    await db.refresh(user)
    return user.to_dict()
