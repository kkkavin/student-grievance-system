"""
FastAPI Notifications Router.
Outbox queue and notification dispatcher.
"""

from datetime import datetime, timezone
import random
import string
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.db.session import get_db_session
    from backend.app.db.models import Notification
except ImportError:
    from app.db.session import get_db_session
    from app.db.models import Notification

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.post("/send")
async def send_notification(request: Request, db: AsyncSession = Depends(get_db_session)):
    body = await request.json()
    to = body.get("to") or body.get("recipient")
    ntype = body.get("type") or "notice"
    ticket_no = body.get("ticketNo") or "NEW"
    student_name = body.get("studentName") or "Student"
    category = body.get("category") or "General"
    custom_msg = body.get("customMessage") or body.get("body")

    if not to or not ntype:
        return JSONResponse(status_code=400, content={"error": "Recipient and notification type are required"})

    if ntype == "confirmation":
        subject = f"Grievance Registered - Ticket #{ticket_no}"
        msg_body = f"Dear {student_name},\n\nWe received your grievance (Ticket: #{ticket_no}, Category: {category}). You will be updated upon resolution."
    elif ntype == "resolution":
        subject = f"Grievance Resolved - Ticket #{ticket_no}"
        note = f"Admin Note: {custom_msg}\n\n" if custom_msg else ""
        msg_body = f"Dear {student_name},\n\nYour grievance (Ticket: #{ticket_no}, Category: {category}) has been resolved.\n\n{note}Thank you."
    else:
        subject = body.get("subject") or "Notice from Campus Grievance Cell"
        msg_body = custom_msg or "Update regarding your grievance submission."

    eml_id = "eml_" + "".join(random.choices(string.ascii_lowercase + string.digits, k=7))
    notif = Notification(
        id=eml_id,
        recipient=to,
        subject=subject,
        body=msg_body,
        type=ntype,
    )
    db.add(notif)
    await db.commit()
    await db.refresh(notif)

    return {
        "success": True,
        "message": f"Notification queued successfully for {to}",
        "email": notif.to_dict(),
    }


@router.get("/outbox")
async def get_outbox(
    email: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = select(Notification).order_by(Notification.created_at.desc())
    if email:
        stmt = stmt.where(Notification.recipient == email.lower())
    res = await db.execute(stmt)
    notifications = res.scalars().all()
    return {"outbox": [n.to_dict() for n in notifications]}
