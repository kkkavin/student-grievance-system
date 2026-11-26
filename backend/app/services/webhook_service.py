"""
Outbound Webhook Notification & Alerting Service.
Asynchronously dispatches formatted webhook payloads (Slack, Discord, Custom)
for critical tickets (urgency == "CRITICAL" or new_status == "CRITICAL")
and duplicate clusters (duplicate_count >= 3) via httpx.AsyncClient with
fault-tolerant error handling, delivery logging in database, and console fallback.
"""

from datetime import datetime, timezone
import logging
import secrets
from typing import Any, Dict, List, Optional
import httpx

try:
    from backend.app.db.session import _manager
    from backend.app.db.models import WebhookConfig, WebhookDeliveryLog
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
except ImportError:
    from app.db.session import _manager
    from app.db.models import WebhookConfig, WebhookDeliveryLog
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("app.services.webhook_service")


def format_platform_payload(platform: str, base_payload: Dict[str, Any]) -> Dict[str, Any]:
    """Formats payload specifically for Slack, Discord, or Custom webhook receivers."""
    urgency = base_payload.get("urgency", "MEDIUM")
    ticket_no = base_payload.get("ticket_no") or base_payload.get("grievance_id", "")
    category = base_payload.get("category", "General")
    intent_summary = base_payload.get("intent_summary", "")
    department = base_payload.get("department", "")

    platform_lower = (platform or "custom").lower()
    payload = dict(base_payload)

    if platform_lower == "slack":
        payload["text"] = (
            f"🚨 *[{urgency}] Grievance #{ticket_no}* ({category})\n"
            f">{intent_summary}\n"
            f"*Department:* {department}"
        )
    elif platform_lower == "discord":
        payload["content"] = (
            f"🚨 **[{urgency}] Grievance #{ticket_no}** ({category})\n"
            f"> {intent_summary}\n"
            f"**Department:** {department}"
        )

    return payload


async def deliver_single_webhook(
    webhook: Any,
    event_type: str,
    payload: Dict[str, Any],
    session: Optional[AsyncSession] = None,
    timeout: float = 3.5,
) -> WebhookDeliveryLog:
    """
    Delivers a single webhook payload via httpx.AsyncClient, logs the attempt,
    persists WebhookDeliveryLog to database if session provided, and returns the log object.
    Safely catches network/DNS/timeout exceptions without raising.
    """
    formatted_payload = format_platform_payload(webhook.platform, payload)
    headers = {"Content-Type": "application/json"}
    if getattr(webhook, "secret_header", None):
        headers["X-Webhook-Secret"] = webhook.secret_header

    status_code: Optional[int] = None
    response_body: Optional[str] = None

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(webhook.target_url, json=formatted_payload, headers=headers)
            status_code = resp.status_code
            response_body = resp.text[:1000] if resp.text else ""
            logger.info(
                f"[WEBHOOK SERVICE] Dispatched to {webhook.name} ({webhook.target_url}) -> HTTP {status_code}"
            )
    except Exception as req_err:
        logger.warning(
            f"[WEBHOOK SERVICE] Failed delivering to {webhook.target_url} ({type(req_err).__name__}: {req_err})"
        )
        response_body = f"Delivery Error ({type(req_err).__name__}): {str(req_err)}"[:1000]

    delivery_log = WebhookDeliveryLog(
        id=f"whlog_{secrets.token_hex(8)}",
        webhook_id=webhook.id,
        grievance_id=payload.get("grievance_id"),
        event_type=event_type,
        status_code=status_code,
        payload_json=formatted_payload,
        response_body=response_body,
        delivered_at=datetime.now(timezone.utc),
    )

    if session:
        try:
            session.add(delivery_log)
            await session.commit()
            await session.refresh(delivery_log)
        except Exception as db_err:
            logger.error(f"[WEBHOOK SERVICE] Failed committing WebhookDeliveryLog: {db_err}")

    return delivery_log


async def dispatch_webhook_alert(
    event_type: str,
    grievance_data: Dict[str, Any],
    session: Optional[AsyncSession] = None,
) -> Dict[str, Any]:
    """
    Asynchronously dispatches webhook alert for critical tickets or duplicate cluster spikes.
    Queries active WebhookConfigs, formats payloads, dispatches, and saves delivery logs.
    """
    ticket_id = grievance_data.get("id") or "UNKNOWN"
    ticket_no = grievance_data.get("ticket_no") or grievance_data.get("ticketNo") or ticket_id
    category = grievance_data.get("category") or "General"
    department = (
        grievance_data.get("assigned_department_id")
        or grievance_data.get("departmentId")
        or grievance_data.get("department_id")
        or "dept-general"
    )
    urgency = (
        grievance_data.get("priority")
        or grievance_data.get("urgency")
        or "MEDIUM"
    ).upper()
    duplicate_count = grievance_data.get("duplicate_count", 0) or grievance_data.get("duplicateCount", 0)
    raw_desc = grievance_data.get("description", "")
    intent_summary = grievance_data.get("intent_summary") or (raw_desc[:120] if raw_desc else "Campus Grievance Alert")
    actionable_steps = grievance_data.get("actionable_steps") or []

    payload = {
        "event": event_type,
        "grievance_id": ticket_id,
        "ticket_no": ticket_no,
        "category": category,
        "department": department,
        "urgency": urgency,
        "intent_summary": intent_summary,
        "actionable_steps": actionable_steps,
        "duplicate_count": duplicate_count,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    deliveries: List[Dict[str, Any]] = []

    async def _process_dispatch(db_sess: AsyncSession):
        stmt = select(WebhookConfig).where(WebhookConfig.is_active == True)
        if event_type == "grievance.critical":
            stmt = stmt.where(WebhookConfig.trigger_on_critical == True)
        elif event_type == "grievance.duplicate_cluster":
            stmt = stmt.where(WebhookConfig.trigger_on_duplicate_cluster == True)

        res = await db_sess.execute(stmt)
        configs = res.scalars().all()

        for wh in configs:
            try:
                delivery_log = await deliver_single_webhook(
                    webhook=wh,
                    event_type=event_type,
                    payload=payload,
                    session=db_sess,
                    timeout=3.5,
                )
                deliveries.append(delivery_log.to_dict())
            except Exception as del_err:
                logger.warning(f"[WEBHOOK SERVICE] Delivery iteration error for {wh.id}: {del_err}")

    # 1. Query registered webhooks from database
    try:
        if session:
            await _process_dispatch(session)
        else:
            session_factory = _manager.get_session_factory()
            async with session_factory() as sess:
                await _process_dispatch(sess)
    except Exception as query_err:
        logger.debug(f"[WEBHOOK SERVICE] WebhookConfig query skipped or error: {query_err}")

    # 2. Console fallback logger
    logger.info(
        f"[WEBHOOK ALERT DISPATCH] Event: {event_type} | Ticket: #{ticket_no} | "
        f"Category: {category} | Urgency: {urgency} | DupCount: {duplicate_count} | Deliveries: {len(deliveries)}"
    )

    return {
        "success": True,
        "event_type": event_type,
        "grievance_id": ticket_id,
        "payload": payload,
        "deliveries": deliveries,
    }
