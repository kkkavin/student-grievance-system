"""
FastAPI Authentication & RBAC Router.
Provides 100% parity with legacy server.ts auth endpoints.
Enforces RFC 7519 HS256 JWT, STUDENT account rejection on admin portal, and universal dev OTP 123456.
"""

from datetime import datetime, timezone, timedelta
import random
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.core.config import settings
    from backend.app.core.security import sign_token, verify_token, hash_password, verify_password
    from backend.app.db.session import get_db_session
    from backend.app.db.models import User, OtpSession, Notification
    from backend.app.schemas.auth import (
        LoginRequest,
        AdminLoginRequest,
        RegisterRequest,
        SendOTPRequest,
        VerifyOTPRequest,
    )
    from backend.app.routers.dependencies import get_current_user
except ImportError:
    from app.core.config import settings
    from app.core.security import sign_token, verify_token, hash_password, verify_password
    from app.db.session import get_db_session
    from app.db.models import User, OtpSession, Notification
    from app.schemas.auth import (
        LoginRequest,
        AdminLoginRequest,
        RegisterRequest,
        SendOTPRequest,
        VerifyOTPRequest,
    )
    from app.routers.dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# In-memory OTP fallback store
_otp_store: Dict[str, Dict[str, Any]] = {}


def normalize_canonical_role(role: Optional[str]) -> str:
    r = (role or "").strip().upper()
    if r in ("SUPER_ADMIN", "SUPERADMIN", "PROCTOR"):
        return "SUPER_ADMIN"
    if r in ("DEPARTMENT_ADMIN", "STAFF", "HEAD"):
        return "DEPARTMENT_ADMIN"
    return "STUDENT"


def get_permissions_for_role(role: str) -> list[str]:
    role_norm = role.upper()
    if role_norm == "SUPER_ADMIN":
        return ["read:all", "write:all", "delete:all", "admin:all"]
    elif role_norm == "DEPARTMENT_ADMIN":
        return ["read:department", "write:department", "resolve:department"]
    return ["read:own", "write:own"]


async def _handle_admin_login(body: Dict[str, Any], db: AsyncSession):
    raw_id = body.get("identifier") or body.get("regNo") or body.get("reg_no") or body.get("email") or ""
    identifier = str(raw_id).strip()
    password = str(body.get("password") or "").strip()

    if not identifier or not password:
        return JSONResponse(
            status_code=400,
            content={"success": False, "error": "Register Number / Email and Password are required."},
        )

    # Lookup user by reg_no or email
    stmt = select(User).where(or_(User.reg_no == identifier, User.email == identifier.lower()))
    result = await db.execute(stmt)
    user = result.scalars().first()

    if not user:
        return JSONResponse(
            status_code=401,
            content={"success": False, "error": "Invalid credentials: User not found."},
        )

    role_upper = (user.role or "").strip().upper()
    if role_upper == "STUDENT":
        return JSONResponse(
            status_code=403,
            content={
                "success": False,
                "error": "Access denied: STUDENT accounts are not permitted to access administrative portal.",
                "role": "STUDENT",
            },
        )

    # Check password or universal dev OTP 123456
    is_dev_otp = (password == getattr(settings, "universal_dev_otp", "123456") or password == "123456")
    stored_hash = user.password_hash or ""
    if not is_dev_otp and not verify_password(password, stored_hash):
        return JSONResponse(
            status_code=401,
            content={"success": False, "error": "Invalid credentials: Incorrect password."},
        )

    canonical_role = normalize_canonical_role(user.role)
    permissions = get_permissions_for_role(canonical_role)
    dept_id = user.department_id

    token = sign_token({
        "id": user.id,
        "email": user.email,
        "role": canonical_role,
        "department_id": dept_id,
        "departmentId": dept_id,
        "name": user.name,
        "reg_no": user.reg_no,
        "regNo": user.reg_no,
        "permissions": permissions,
    })

    redirect_url = "/admin/dashboard" if canonical_role == "SUPER_ADMIN" else "/admin/department/dashboard"

    user_dict = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "regNo": user.reg_no,
        "reg_no": user.reg_no,
        "role": canonical_role,
        "departmentId": dept_id,
        "department_id": dept_id,
        "phone": user.phone,
        "permissions": permissions,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }

    return {
        "success": True,
        "token": token,
        "user": user_dict,
        "role": canonical_role,
        "redirectUrl": redirect_url,
    }


@router.post("/admin/login")
async def admin_login(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    return await _handle_admin_login(body, db)


@router.post("/admin-login")
async def admin_login_alias(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    return await _handle_admin_login(body, db)


@router.post("/login")
async def general_login(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    if body.get("portal") == "admin":
        return await _handle_admin_login(body, db)

    raw_id = body.get("identifier") or body.get("regNo") or body.get("reg_no") or body.get("email") or ""
    identifier = str(raw_id).strip()
    password = str(body.get("password") or "").strip()

    if not identifier or not password:
        return JSONResponse(
            status_code=400,
            content={"error": "Register Number / Email and Password are required."},
        )

    stmt = select(User).where(or_(User.reg_no == identifier, User.email == identifier.lower()))
    result = await db.execute(stmt)
    user = result.scalars().first()

    is_dev_otp = (password == getattr(settings, "universal_dev_otp", "123456") or password == "123456")
    if not user or (not is_dev_otp and not verify_password(password, user.password_hash or "")):
        return JSONResponse(
            status_code=401,
            content={"error": "Invalid credentials: Incorrect registration number or password."},
        )

    canonical_role = normalize_canonical_role(user.role)
    permissions = get_permissions_for_role(canonical_role)
    dept_id = user.department_id

    token = sign_token({
        "id": user.id,
        "email": user.email,
        "role": canonical_role,
        "department_id": dept_id,
        "departmentId": dept_id,
        "name": user.name,
        "reg_no": user.reg_no,
        "regNo": user.reg_no,
        "permissions": permissions,
    })

    redirect_url = "/admin/dashboard" if canonical_role == "SUPER_ADMIN" else ("/admin/department/dashboard" if canonical_role == "DEPARTMENT_ADMIN" else "/student/dashboard")

    user_dict = {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "regNo": user.reg_no,
        "reg_no": user.reg_no,
        "role": canonical_role,
        "departmentId": dept_id,
        "department_id": dept_id,
        "phone": user.phone,
        "permissions": permissions,
        "createdAt": user.created_at.isoformat() if user.created_at else None,
    }

    return {
        "success": True,
        "token": token,
        "user": user_dict,
        "role": canonical_role,
        "redirectUrl": redirect_url,
    }


@router.post("/register", status_code=201)
async def register_student(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    reg_no = str(body.get("regNo") or body.get("reg_no") or "").strip().upper()
    name = str(body.get("name") or "").strip()
    email = str(body.get("email") or "").strip().lower()
    password = str(body.get("password") or "").strip()

    if not reg_no or not name or not email or not password:
        return JSONResponse(
            status_code=400,
            content={"error": "Register Number, Name, Email, and Password are required."},
        )

    # Check reg_no duplicate
    stmt = select(User).where(User.reg_no == reg_no)
    res = await db.execute(stmt)
    if res.scalars().first():
        return JSONResponse(
            status_code=409,
            content={"error": f'An account with Register Number "{reg_no}" already exists. Please sign in instead.'},
        )

    # Check email duplicate
    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    if res.scalars().first():
        return JSONResponse(
            status_code=409,
            content={"error": f'An account with email "{email}" already exists. Please sign in instead.'},
        )

    new_user = User(
        id=f"user-{reg_no.lower()}-{int(time.time())}",
        reg_no=reg_no,
        name=name,
        email=email,
        role="student",
        password_hash=hash_password(password),
        phone=str(body.get("phone") or ""),
        gender=str(body.get("gender") or "Male"),
        student_type=str(body.get("studentType") or body.get("student_type") or "hosteller"),
        hostel_block=body.get("hostelBlock") or body.get("hostel_block"),
        room_no=body.get("roomNo") or body.get("room_no"),
        is_email_verified=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return {"success": True, "user": new_user.to_dict()}


@router.post("/send-otp")
async def send_otp(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    email = str(body.get("email") or "").strip().lower()
    if not email:
        return JSONResponse(status_code=400, content={"error": "Email address is required"})

    otp = str(random.randint(100000, 999999))
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=5)

    # Store in database
    otp_session = OtpSession(
        id=f"otp-{int(time.time() * 1000)}",
        email=email,
        otp_code=otp,
        expires_at=expires,
        is_used=False,
    )
    db.add(otp_session)

    # Store in memory cache
    _otp_store[email] = {"otp": otp, "expiresAt": int(expires.timestamp() * 1000)}

    # Outbox notification
    notif = Notification(
        id=f"eml_otp_{int(time.time() * 1000)}",
        recipient=email,
        subject="AI Student Grievance Portal Verification Code",
        body=f"Your 6-digit verification code is: {otp}. Valid for 5 minutes.",
        type="otp",
    )
    db.add(notif)
    await db.commit()

    return {
        "success": True,
        "message": f"Verification code sent to {email}",
        "otp": otp,
        "otpCode": otp,
        "expiresIn": 300,
    }


@router.post("/verify-otp")
async def verify_otp(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    email = str(body.get("email") or "").strip().lower()
    otp = str(body.get("otp") or "").strip()

    if not email or not otp:
        return JSONResponse(status_code=400, content={"error": "Email and OTP are required"})

    # Universal Dev OTP bypass for rapid development & demo authentication
    dev_otp = getattr(settings, "universal_dev_otp", "123456")
    if otp == "123456" or otp == dev_otp:
        return {"success": True, "message": "OTP verified successfully (Dev Bypass)"}

    # Verify against memory cache
    rec = _otp_store.get(email)
    if rec and int(time.time() * 1000) <= rec["expiresAt"] and rec["otp"] == otp:
        _otp_store.pop(email, None)
        return {"success": True, "message": "OTP verified successfully"}

    # Verify against DB
    stmt = (
        select(OtpSession)
        .where(OtpSession.email == email, OtpSession.is_used == False)
        .order_by(OtpSession.created_at.desc())
    )
    res = await db.execute(stmt)
    db_session_rec = res.scalars().first()

    if not db_session_rec:
        return JSONResponse(status_code=400, content={"error": "No active OTP found. Please request a new one."})

    now_utc = datetime.now(timezone.utc)
    expires_at = db_session_rec.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now_utc:
        return JSONResponse(status_code=400, content={"error": "OTP has expired. Please request a new one."})

    if db_session_rec.otp_code != otp:
        return JSONResponse(status_code=400, content={"error": "Invalid OTP. Please check the code and try again."})

    db_session_rec.is_used = True
    await db.commit()
    return {"success": True, "message": "OTP verified successfully"}


@router.get("/me")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    return {"success": True, "user": user}
