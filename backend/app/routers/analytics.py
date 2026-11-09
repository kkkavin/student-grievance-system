"""
FastAPI Analytics Router.
Serves multidimensional rollups and campus risk forecasts with 100% contract parity.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.db.session import get_db_session
    from backend.app.db.models import Complaint
    from backend.app.services.analytics import get_campus_trend_analytics
    from backend.app.services.forecasting import compute_risk_forecast
except ImportError:
    from app.db.session import get_db_session
    from app.db.models import Complaint
    from app.services.analytics import get_campus_trend_analytics
    from app.services.forecasting import compute_risk_forecast

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


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
