"""
FastAPI Authentication & RBAC Router.
Provides 100% parity with legacy server.ts auth endpoints.
Enforces RFC 7519 HS256 JWT, STUDENT account rejection on admin portal, and universal dev OTP 123456.
"""

from datetime import datetime, timezone, timedelta
import hashlib
import hmac
import logging
import os
import random
import secrets
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("app.routers.auth")

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
        RequestOTPRequest,
        RequestOTPResponse,
        VerifyOTPRequest,
        VerifyOTPResponse,
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
        RequestOTPRequest,
        RequestOTPResponse,
        VerifyOTPRequest,
        VerifyOTPResponse,
    )
    from app.routers.dependencies import get_current_user

router = APIRouter()

# In-memory OTP fallback store
_otp_store: Dict[str, Dict[str, Any]] = {}


def hash_otp(otp: str, salt: Optional[str] = None) -> tuple[str, str]:
    """Computes salted SHA-256 hash for OTP storage."""
    if not salt:
        salt = secrets.token_hex(16)
    otp_hash = hashlib.sha256(f"{salt}:{otp}".encode("utf-8")).hexdigest()
    return f"{salt}${otp_hash}", salt


def verify_otp_hash(otp: str, stored_hash: Optional[str], stored_code: Optional[str] = None) -> bool:
    """Verifies an OTP against a stored salted hash and fallback code."""
    if stored_hash and "$" in stored_hash:
        salt, expected = stored_hash.split("$", 1)
        computed = hashlib.sha256(f"{salt}:{otp}".encode("utf-8")).hexdigest()
        if hmac.compare_digest(computed, expected):
            return True
    if stored_code and hmac.compare_digest(otp, stored_code):
        return True
    return False


def send_otp_email_task(recipient_email: str, otp_code: str):
    """Background task dispatching OTP email with console fallback."""
    smtp_user = getattr(settings, "gmail_user", None) or os.getenv("SMTP_USER")
    smtp_pass = getattr(settings, "gmail_app_password", None) or os.getenv("SMTP_PASSWORD")
    smtp_host = getattr(settings, "smtp_host", "smtp.gmail.com")
    smtp_port = int(getattr(settings, "smtp_port", 587))

    if not smtp_user or not smtp_pass:
        logger.info(f"[CONSOLE OTP FALLBACK] Recipient: {recipient_email} | OTP: {otp_code} | TTL: 5 min")
        return

    try:
        import smtplib
        from email.mime.text import MIMEText
        msg = MIMEText(f"Your verification code is: {otp_code} (Valid for 5 minutes).")
        msg["Subject"] = "Campus Grievance System Verification Code"
        msg["From"] = smtp_user
        msg["To"] = recipient_email
        with smtplib.SMTP(smtp_host, smtp_port, timeout=5.0) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, [recipient_email], msg.as_string())
    except Exception as exc:
        logger.warning(f"SMTP send failed ({exc}). Falling back to console.")
        logger.info(f"[CONSOLE OTP FALLBACK] Recipient: {recipient_email} | OTP: {otp_code}")



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


@router.post("/request-otp")
@router.post("/send-otp")
async def send_otp(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db_session),
):
    body = await request.json()
    email = str(body.get("email") or "").strip().lower()
    if not email:
        return JSONResponse(status_code=400, content={"error": "Email address is required"})

    # Cryptographically secure 6-digit OTP
    otp = str(secrets.randbelow(900000) + 100000)
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=5)
    otp_hash_val, _ = hash_otp(otp)

    session_id = f"otp-{int(time.time() * 1000)}"

    # Store in database with salted hash and TTL
    otp_session = OtpSession(
        id=session_id,
        email=email,
        otp_code=otp,
        otp_hash=otp_hash_val,
        created_at=now,
        expires_at=expires,
        is_used=False,
        attempts=0,
    )
    db.add(otp_session)

    # Store in memory cache for rapid validation
    _otp_store[email] = {
        "otp": otp,
        "otp_hash": otp_hash_val,
        "expiresAt": int(expires.timestamp() * 1000),
        "attempts": 0,
    }

    # Outbox notification record
    notif = Notification(
        id=f"eml_otp_{int(time.time() * 1000)}",
        recipient=email,
        subject="Campus Grievance Redressal Portal Verification Code",
        body=f"Your verification code is: {otp}. Valid for 5 minutes.",
        type="otp",
    )
    db.add(notif)
    await db.commit()

    # Enqueue background email transmission task (with console fallback)
    background_tasks.add_task(send_otp_email_task, email, otp)

    # Return clean security payload with ZERO OTP leak
    return {
        "success": True,
        "message": f"Verification code sent to {email}",
        "session_id": session_id,
        "sessionId": session_id,
        "expires_in": 300,
        "expiresIn": 300,
    }


@router.post("/verify-otp")
async def verify_otp(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    email = str(body.get("email") or "").strip().lower()
    otp = str(body.get("otp") or "").strip()

    if not email or not otp:
        return JSONResponse(status_code=400, content={"error": "Email and OTP are required"})

    now_utc = datetime.now(timezone.utc)
    dev_otp = getattr(settings, "universal_dev_otp", "123456")
    is_dev_bypass = (otp == "123456" or otp == dev_otp)

    # Look up active DB session
    stmt = (
        select(OtpSession)
        .where(OtpSession.email == email, OtpSession.is_used == False)
        .order_by(OtpSession.created_at.desc())
    )
    res = await db.execute(stmt)
    db_session_rec = res.scalars().first()

    matched = False

    if is_dev_bypass:
        matched = True
        if db_session_rec:
            db_session_rec.is_used = True
            await db.commit()
    else:
        if not db_session_rec:
            # Check in-memory fallback
            rec = _otp_store.get(email)
            if rec and int(time.time() * 1000) <= rec.get("expiresAt", 0):
                if rec.get("attempts", 0) >= 5:
                    return JSONResponse(
                        status_code=400,
                        content={"error": "Maximum verification attempts exceeded. Please request a new OTP."},
                    )
                if verify_otp_hash(otp, rec.get("otp_hash"), rec.get("otp")):
                    matched = True
                    _otp_store.pop(email, None)
                else:
                    rec["attempts"] = rec.get("attempts", 0) + 1
                    return JSONResponse(
                        status_code=400,
                        content={"error": f"Invalid OTP. {5 - rec['attempts']} attempts remaining."},
                    )
            else:
                return JSONResponse(
                    status_code=400, content={"error": "No active OTP found. Please request a new one."}
                )
        else:
            # Check attempt limits
            if db_session_rec.attempts >= 5:
                return JSONResponse(
                    status_code=400,
                    content={"error": "Maximum verification attempts exceeded. Please request a new OTP."},
                )

            # Check expiration
            expires_at = db_session_rec.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)

            if expires_at < now_utc:
                return JSONResponse(status_code=400, content={"error": "OTP has expired. Please request a new one."})

            # Cryptographic hash verification
            if verify_otp_hash(otp, db_session_rec.otp_hash, db_session_rec.otp_code):
                matched = True
                db_session_rec.is_used = True
                await db.commit()
            else:
                db_session_rec.attempts += 1
                await db.commit()
                remaining = max(0, 5 - db_session_rec.attempts)
                return JSONResponse(
                    status_code=400,
                    content={"error": f"Invalid OTP. {remaining} attempts remaining."},
                )

    if not matched:
        return JSONResponse(status_code=400, content={"error": "Invalid OTP. Please check the code and try again."})

    # Successful verification - check if user exists
    user_stmt = select(User).where(User.email == email)
    user_res = await db.execute(user_stmt)
    existing_user = user_res.scalars().first()

    if existing_user:
        canonical_role = normalize_canonical_role(existing_user.role)
        permissions = get_permissions_for_role(canonical_role)
        now_ts = int(time.time())
        token_payload = {
            "id": existing_user.id,
            "email": existing_user.email,
            "role": canonical_role,
            "departmentId": existing_user.department_id,
            "department_id": existing_user.department_id,
            "name": existing_user.name,
            "regNo": existing_user.reg_no,
            "reg_no": existing_user.reg_no,
            "permissions": permissions,
            "iat": now_ts,
            "exp": now_ts + settings.jwt_expiration_seconds,
            "iss": "student-grievance-system",
        }
        token = sign_token(token_payload)
        return {
            "success": True,
            "message": "OTP verified successfully",
            "access_token": token,
            "token": token,
            "token_type": "bearer",
            "tokenType": "bearer",
            "user": existing_user.to_dict(),
        }

    # Pre-registration verification flow (user not yet registered in DB)
    return {
        "success": True,
        "message": "OTP verified successfully",
        "access_token": None,
        "token": None,
        "token_type": "bearer",
        "tokenType": "bearer",
        "user": None,
    }


@router.get("/me")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    return {"success": True, "user": user}
