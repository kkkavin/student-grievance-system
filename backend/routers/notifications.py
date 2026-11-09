"""
FastAPI Notifications Router.
Provides outbox queries and simulated/live notification dispatch with 100% parity.
"""

from datetime import datetime, timezone
import random
import string
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.session import get_db_session
from backend.db.models import Notification

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
        return JSONResponse(
            status_code=400,
            content={"error": "Recipient and notification type are required"},
        )

    if ntype == "confirmation":
        subject = f"Grievance Registered - Ticket #{ticket_no}"
        msg_body = (
            f"Dear {student_name},\n\n"
            f"We got your complaint (Ticket: #{ticket_no}, Category: {category}).\n\n"
            f"Once the problem been taken care of we will notify you. Thank you.\n\n"
            f"College Grievance Redressal Cell."
        )
    elif ntype == "resolution":
        subject = f"Grievance Resolved - Ticket #{ticket_no}"
        note = f"Admin Note: {custom_msg}\n\n" if custom_msg else ""
        msg_body = (
            f"Dear {student_name},\n\n"
            f"This is to notify you that your complaint (Ticket: #{ticket_no}, Category: {category}) "
            f"has been taken care of and marked as Done.\n\n"
            f"{note}"
            f"Thanks for notifying the College management about the issue.\n\n"
            f"Warm regards,\nCollege Grievance & Hostel Welfare Team."
        )
    else:
        subject = body.get("subject") or "Notice from College Grievance Cell"
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
        "email": {
            "id": notif.id,
            "to": notif.recipient,
            "subject": notif.subject,
            "body": notif.body,
            "type": notif.type,
            "timestamp": notif.created_at.isoformat() if notif.created_at else datetime.now(timezone.utc).isoformat(),
        },
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

    outbox = [
        {
            "id": n.id,
            "to": n.recipient,
            "subject": n.subject,
            "body": n.body,
            "type": n.type,
            "timestamp": n.created_at.isoformat() if n.created_at else datetime.now(timezone.utc).isoformat(),
        }
        for n in notifications
    ]
    return {"outbox": outbox}
