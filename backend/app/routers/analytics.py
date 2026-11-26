"""
FastAPI Analytics Router.
Serves multidimensional rollups and campus risk forecasts with 100% contract parity.
"""

from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.db.session import get_db_session
    from backend.app.db.models import Complaint, Department, AuditLog, WebhookDeliveryLog
    from backend.app.schemas.analytics import AutomationSlaResponse
    from backend.app.services.analytics import get_campus_trend_analytics, compute_automation_sla_metrics
    from backend.app.services.forecasting import compute_risk_forecast
    from backend.app.routers.dependencies import get_current_user_optional
except ImportError:
    from app.db.session import get_db_session
    from app.db.models import Complaint, Department, AuditLog, WebhookDeliveryLog
    from app.schemas.analytics import AutomationSlaResponse
    from app.services.analytics import get_campus_trend_analytics, compute_automation_sla_metrics
    from app.services.forecasting import compute_risk_forecast
    from app.routers.dependencies import get_current_user_optional

router = APIRouter()


@router.get("/automation-sla", response_model=AutomationSlaResponse)
async def get_automation_sla_analytics(
    db: AsyncSession = Depends(get_db_session),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """
    Returns VisAI Labs GTM Suite SLA & Automation telemetry:
    - Department resolution hours vs target SLAs and compliance rates
    - Autonomous Groq triage rate and accuracy
    - Semantic deduplication interception volume and staff hours saved
    - Outbound webhook 24h delivery telemetry
    """
    # 1. Fetch Grievances
    grv_stmt = select(Complaint)
    grv_res = await db.execute(grv_stmt)
    grievances = grv_res.scalars().all()

    # 2. Fetch Departments
    departments = []
    try:
        dept_stmt = select(Department).where(Department.is_active == True)
        dept_res = await db.execute(dept_stmt)
        departments = dept_res.scalars().all()
    except Exception:
        pass

    # 3. Fetch Audit Logs for Reassignments
    audit_logs = []
    try:
        audit_stmt = select(AuditLog).where(
            AuditLog.action.in_(["REASSIGN_DEPARTMENT", "MANUAL_REASSIGN", "REASSIGN_GRIEVANCE"])
        )
        audit_res = await db.execute(audit_stmt)
        audit_logs = audit_res.scalars().all()
    except Exception:
        pass

    # 4. Fetch Webhook Delivery Logs
    webhook_logs = []
    try:
        wh_stmt = select(WebhookDeliveryLog)
        wh_res = await db.execute(wh_stmt)
        webhook_logs = wh_res.scalars().all()
    except Exception:
        pass

    # 5. Compute metrics
    metrics = compute_automation_sla_metrics(grievances, departments, audit_logs, webhook_logs)
    return metrics


@router.get("/trends")
async def get_trend_analytics(db: AsyncSession = Depends(get_db_session)):
    stmt = select(Complaint)
    res = await db.execute(stmt)
    complaints = res.scalars().all()
    dicts = [c.to_dict() for c in complaints]
    return get_campus_trend_analytics(dicts)


@router.get("/risk-forecast")
async def get_risk_forecast(db: AsyncSession = Depends(get_db_session)):
    stmt = select(Complaint)
    res = await db.execute(stmt)
    complaints = res.scalars().all()
    dicts = [c.to_dict() for c in complaints]
    return compute_risk_forecast(dicts)


@router.get("/predictive")
async def get_predictive_summary(db: AsyncSession = Depends(get_db_session)):
    stmt = select(Complaint)
    res = await db.execute(stmt)
    complaints = res.scalars().all()
    dicts = [c.to_dict() for c in complaints]
    trends = get_campus_trend_analytics(dicts)
    forecast = compute_risk_forecast(dicts)
    return {
        "success": True,
        "trends": trends,
        "forecast": forecast,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
