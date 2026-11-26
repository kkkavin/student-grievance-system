"""
Event-Driven Email Notification Service.
Dispatches transactional status update emails to students via SMTP with
graceful console/logger fallback when SMTP credentials are unset or unreachable.
Records outgoing notifications to the persistent database outbox.
"""

from datetime import datetime, timezone
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Optional
import uuid

try:
    from backend.app.core.config import get_settings
    from backend.app.db.session import _manager
    from backend.app.db.models import Notification
except ImportError:
    from app.core.config import get_settings
    from app.db.session import _manager
    from app.db.models import Notification

logger = logging.getLogger("app.services.email_service")


async def send_status_update_email(
    grievance_id: str,
    student_email: str,
    old_status: Optional[str] = None,
    new_status: str = "RECEIVED",
    notes: Optional[str] = None,
    db: Optional[Any] = None,
) -> bool:
    """
    Sends a status update notification email for a grievance.
    Persists a Notification record in the database outbox.
    Falls back gracefully to logger/console when SMTP credentials are unset or unreachable.
    """
    if not student_email:
        logger.warning(f"[EMAIL SERVICE] Skipped email dispatch: student_email is empty for grievance {grievance_id}")
        return False

    subject = f"Grievance Status Update: #{grievance_id} [{new_status}]"
    body = (
        f"Dear Student,\n\n"
        f"Your campus grievance (Ticket #{grievance_id}) status has been updated:\n"
        f"  Previous Status: {old_status or 'NEW / SUBMITTED'}\n"
        f"  Current Status:  {new_status}\n"
        f"  Admin Notes:     {notes or 'Your grievance is being processed by the assigned department.'}\n\n"
        f"Timestamp: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
        f"Campus Grievance Redressal Administration"
    )

    # 1. Record notification in database outbox
    try:
        now = datetime.now(timezone.utc)
        notif = Notification(
            id=f"notif-eml-{uuid.uuid4().hex[:12]}",
            recipient=student_email,
            subject=subject,
            body=body,
            type="status_update",
            timestamp=now,
            created_at=now,
        )
        if db is not None:
            db.add(notif)
        elif getattr(_manager, "_session_factory", None) is not None:
            session_factory = _manager.get_session_factory()
            async with session_factory() as session:
                session.add(notif)
                await session.commit()
    except Exception as exc:
        logger.debug(f"[EMAIL SERVICE] Database outbox record skipped: {exc}")

    # 2. Check SMTP credentials and dispatch
    settings = get_settings()
    gmail_user = getattr(settings, "gmail_user", None)
    gmail_pass = getattr(settings, "gmail_app_password", None)

    if gmail_user and gmail_pass:
        try:
            msg = MIMEMultipart()
            msg["From"] = gmail_user
            msg["To"] = student_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))

            with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=5.0) as server:
                server.login(gmail_user, gmail_pass)
                server.send_message(msg)

            logger.info(f"[EMAIL SERVICE] Live SMTP notification sent to {student_email} for #{grievance_id}")
            return True
        except Exception as smtp_err:
            logger.warning(
                f"[EMAIL SERVICE] Live SMTP dispatch to {student_email} failed ({smtp_err}). "
                f"Falling back to logger console notification."
            )

    # 3. Graceful fallback logger
    logger.info(
        f"[EMAIL CONSOLE NOTIFICATION] To: {student_email} | Grievance: {grievance_id} | "
        f"Status: {old_status or 'NEW'} -> {new_status} | Notes: {notes}"
    )
    return True
