"""
Database Package: Connection session management, ORM models, initialization, and seeder.
"""
try:
    from backend.app.db.session import (
        Base,
        engine,
        AsyncSessionLocal,
        get_db,
        get_db_session,
        init_db,
        get_database_url,
        DATABASE_URL,
    )
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
    )
except ImportError:
    from app.db.session import (
        Base,
        engine,
        AsyncSessionLocal,
        get_db,
        get_db_session,
        init_db,
        get_database_url,
        DATABASE_URL,
    )
    from app.db.models import (
        Department,
        User,
        Complaint,
        ComplaintUpvote,
        CategoryRoutingRule,
        AuditLog,
        Notification,
        OtpSession,
        OtpCode,
    )

__all__ = [
    "Base",
    "engine",
    "AsyncSessionLocal",
    "get_db",
    "get_db_session",
    "init_db",
    "get_database_url",
    "DATABASE_URL",
    "Department",
    "User",
    "Complaint",
    "ComplaintUpvote",
    "CategoryRoutingRule",
    "AuditLog",
    "Notification",
    "OtpSession",
    "OtpCode",
]
