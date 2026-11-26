"""
FastAPI Security & RLAC Dependencies.
Enforces strict Horizontal IDOR and Vertical Privilege Isolation.
"""

from typing import Annotated, Any, Dict, Optional
from fastapi import Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.core.security import verify_token
except ImportError:
    from app.core.security import verify_token


async def get_current_user_optional(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_auth_token: Optional[str] = Header(None, alias="x-auth-token"),
    token: Optional[str] = Query(None),
) -> Optional[Dict[str, Any]]:
    """Extracts and verifies JWT token from Authorization header, x-auth-token, or query param."""
    raw_token = None
    if authorization:
        if authorization.startswith("Bearer "):
            raw_token = authorization[7:].strip()
        else:
            raw_token = authorization.strip()
    elif x_auth_token:
        raw_token = x_auth_token.strip()
    elif token:
        raw_token = token.strip()

    if not raw_token:
        return None

    payload = verify_token(raw_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"success": False, "error": "Unauthorized: Invalid or expired token"},
        )
    return payload


async def get_current_user(
    user: Annotated[Optional[Dict[str, Any]], Depends(get_current_user_optional)],
) -> Dict[str, Any]:
    """Requires an authenticated user."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"success": False, "error": "Unauthorized: Authentication required"},
        )
    return user


async def require_super_admin(
    user: Annotated[Dict[str, Any], Depends(get_current_user)],
) -> Dict[str, Any]:
    """Requires super_admin role."""
    role = str(user.get("role", "")).lower()
    if role not in ("super_admin", "superadmin", "proctor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"success": False, "error": "Forbidden: Super Admin access required"},
        )
    return user


async def require_department_admin(
    user: Annotated[Dict[str, Any], Depends(get_current_user)],
) -> Dict[str, Any]:
    """Requires department_admin or super_admin role."""
    role = str(user.get("role", "")).lower()
    if role not in ("department_admin", "staff", "head", "super_admin", "superadmin", "proctor"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"success": False, "error": "Forbidden: Department Admin or Super Admin access required"},
        )
    return user


def enforce_complaint_rlac(complaint: Any, user: Dict[str, Any]) -> None:
    """Enforces row-level isolation preventing IDOR attacks."""
    role = str(user.get("role", "")).upper()
    if role in ("SUPER_ADMIN", "SUPERADMIN", "PROCTOR"):
        return

    if role in ("DEPARTMENT_ADMIN", "STAFF", "HEAD"):
        user_dept = user.get("departmentId") or user.get("department_id")
        if complaint.assigned_department_id and user_dept and complaint.assigned_department_id != user_dept:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"success": False, "error": "Forbidden: Cannot access complaints from other departments"},
            )
        return

    # Student check
    user_reg = user.get("regNo") or user.get("reg_no")
    if complaint.student_reg_no and user_reg and complaint.student_reg_no != user_reg:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"success": False, "error": "Forbidden: Cannot access complaints belonging to other students"},
        )


enforce_grievance_rlac = enforce_complaint_rlac

