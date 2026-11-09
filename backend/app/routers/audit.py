"""FastAPI Audit Logs Router."""
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.db.session import get_db_session
    from backend.app.db.models import AuditLog
    from backend.app.routers.dependencies import require_super_admin
except ImportError:
    from app.db.session import get_db_session
    from app.db.models import AuditLog
    from app.routers.dependencies import require_super_admin

router = APIRouter(prefix="/api/admin", tags=["Audit Logs"])


@router.get("/audit-logs")
async def get_audit_logs(
    entityType: Optional[str] = Query(None),
    limit: int = Query(100),
    user: Dict[str, Any] = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if entityType:
        stmt = stmt.where(AuditLog.entity_type == entityType)
    res = await db.execute(stmt)
    logs = res.scalars().all()
    return {"success": True, "logs": [l.to_dict() for l in logs]}
