"""
FastAPI Dependencies for Authentication, Database Sessions, and Row-Level Access Control (RLAC).
"""

from typing import Annotated, Any, Dict, Optional
from fastapi import Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import get_db_session
from backend.utils.jwt import verify_token


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
