"""
Database package: Base, engine, session factory, dependency, and all 7 ORM models.
"""

from backend.db.base import (
    Base,
    engine,
    AsyncSessionLocal,
    get_db,
    get_database_url,
    DATABASE_URL,
)
from backend.db.models import (
    Department,
    User,
    Complaint,
    CategoryRoutingRule,
    AuditLog,
    Notification,
    OtpCode,
)

__all__ = [
    "Base",
    "engine",
    "AsyncSessionLocal",
    "get_db",
    "get_database_url",
    "DATABASE_URL",
    "Department",
    "User",
    "Complaint",
    "CategoryRoutingRule",
    "AuditLog",
    "Notification",
    "OtpCode",
]
