"""
Re-export bridge for backend.db.models -> backend.app.db.models.
Maintains 100% backward compatibility for existing tests and routes.
"""
from backend.app.db.models import (
    Department,
    User,
    Complaint,
    ComplaintUpvote,
    CategoryRoutingRule,
    AuditLog,
    Notification,
    OtpSession,
    OtpCode,
    _parse_iso_datetime,
)

__all__ = [
    "Department",
    "User",
    "Complaint",
    "ComplaintUpvote",
    "CategoryRoutingRule",
    "AuditLog",
    "Notification",
    "OtpSession",
    "OtpCode",
    "_parse_iso_datetime",
]
