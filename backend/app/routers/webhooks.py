"""
FastAPI Outbound Webhooks Router (Milestone 4: VisAI Labs GTM Suite).
Provides dynamic webhook registration, inspection, updates, deletion,
and live test alert dispatching with delivery logging.
"""

from datetime import datetime, timezone
import logging
import secrets
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, delete, desc
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.db.session import get_db_session
    from backend.app.db.models import WebhookConfig, WebhookDeliveryLog
    from backend.app.schemas.webhooks import (
        WebhookConfigCreate,
        WebhookConfigUpdate,
        WebhookConfigResponse,
        WebhookDeliveryLogResponse,
    )
    from backend.app.services.webhook_service import deliver_single_webhook
    from backend.app.routers.dependencies import get_current_user_optional
except ImportError:
    from app.db.session import get_db_session
    from app.db.models import WebhookConfig, WebhookDeliveryLog
    from app.schemas.webhooks import (
        WebhookConfigCreate,
        WebhookConfigUpdate,
        WebhookConfigResponse,
        WebhookDeliveryLogResponse,
    )
    from app.services.webhook_service import deliver_single_webhook
    from app.routers.dependencies import get_current_user_optional

logger = logging.getLogger("app.routers.webhooks")

router = APIRouter()


@router.get("", response_model=List[WebhookConfigResponse])
@router.get("/", response_model=List[WebhookConfigResponse], include_in_schema=False)
async def list_webhooks(
    isActive: Optional[bool] = Query(None, alias="isActive"),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db_session),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """List registered outbound webhook configurations."""
    stmt = select(WebhookConfig).order_by(desc(WebhookConfig.created_at))
    active_filter = isActive if isActive is not None else is_active
    if active_filter is not None:
        stmt = stmt.where(WebhookConfig.is_active == active_filter)

    res = await db.execute(stmt)
    configs = res.scalars().all()
    return [wh.to_dict() for wh in configs]


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_webhook(
    body: WebhookConfigCreate,
    db: AsyncSession = Depends(get_db_session),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Register a new outbound webhook configuration."""
    wh_id = f"whk_{secrets.token_hex(8)}"
    new_wh = WebhookConfig(
        id=wh_id,
        name=body.name,
        target_url=body.target_url,
        platform=body.platform or "custom",
        secret_header=body.secret_header,
        trigger_on_critical=body.trigger_on_critical,
        trigger_on_duplicate_cluster=body.trigger_on_duplicate_cluster,
        is_active=body.is_active,
        created_at=datetime.now(timezone.utc),
    )
    db.add(new_wh)
    await db.commit()
    await db.refresh(new_wh)
    return new_wh.to_dict()


@router.get("/{webhook_id}")
async def get_webhook(
    webhook_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Get single webhook configuration by ID."""
    stmt = select(WebhookConfig).where(WebhookConfig.id == webhook_id)
    res = await db.execute(stmt)
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook config {webhook_id} not found",
        )
    return wh.to_dict()


@router.patch("/{webhook_id}")
async def update_webhook(
    webhook_id: str,
    body: WebhookConfigUpdate,
    db: AsyncSession = Depends(get_db_session),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Update fields on an existing webhook configuration."""
    stmt = select(WebhookConfig).where(WebhookConfig.id == webhook_id)
    res = await db.execute(stmt)
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook config {webhook_id} not found",
        )

    if body.name is not None:
        wh.name = body.name
    if body.target_url is not None:
        wh.target_url = body.target_url
    if body.platform is not None:
        wh.platform = body.platform
    if body.secret_header is not None:
        wh.secret_header = body.secret_header
    if body.trigger_on_critical is not None:
        wh.trigger_on_critical = body.trigger_on_critical
    if body.trigger_on_duplicate_cluster is not None:
        wh.trigger_on_duplicate_cluster = body.trigger_on_duplicate_cluster
    if body.is_active is not None:
        wh.is_active = body.is_active

    await db.commit()
    await db.refresh(wh)
    return wh.to_dict()


@router.delete("/{webhook_id}")
async def delete_webhook(
    webhook_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Delete a webhook configuration and all associated delivery logs."""
    stmt = select(WebhookConfig).where(WebhookConfig.id == webhook_id)
    res = await db.execute(stmt)
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook config {webhook_id} not found",
        )

    await db.delete(wh)
    await db.commit()
    return {"success": True, "message": f"Webhook config {webhook_id} deleted"}


@router.post("/{webhook_id}/test", status_code=status.HTTP_200_OK)
async def test_webhook_dispatch(
    webhook_id: str,
    db: AsyncSession = Depends(get_db_session),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """
    Dispatches a sample CRITICAL test alert to the registered webhook target,
    persists a WebhookDeliveryLog, and returns the delivery log details.
    """
    stmt = select(WebhookConfig).where(WebhookConfig.id == webhook_id)
    res = await db.execute(stmt)
    wh = res.scalar_one_or_none()
    if not wh:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Webhook config {webhook_id} not found",
        )

    sample_payload = {
        "event": "test.alert",
        "grievance_id": f"grv_test_{secrets.token_hex(4)}",
        "ticket_no": "TEST-101",
        "category": "Electrical & AC",
        "department": "dept-infra",
        "urgency": "CRITICAL",
        "intent_summary": "Smoke and severe sparking reported from 2nd floor transformer box",
        "actionable_steps": [
            "Dispatch emergency electricians immediately",
            "Isolate sub-station power feed",
            "Evacuate adjacent laboratory space",
        ],
        "duplicate_count": 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    delivery_log = await deliver_single_webhook(
        webhook=wh,
        event_type="test.alert",
        payload=sample_payload,
        session=db,
        timeout=4.0,
    )

    return delivery_log.to_dict()


@router.get("/{webhook_id}/deliveries")
async def list_webhook_deliveries(
    webhook_id: str,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Retrieve delivery logs for a given webhook."""
    stmt = (
        select(WebhookDeliveryLog)
        .where(WebhookDeliveryLog.webhook_id == webhook_id)
        .order_by(desc(WebhookDeliveryLog.delivered_at))
        .limit(limit)
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()
    return [log.to_dict() for log in logs]
