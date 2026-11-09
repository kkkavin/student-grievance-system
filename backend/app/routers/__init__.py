"""FastAPI routers package."""
try:
    from backend.app.routers import (
        health,
        auth,
        complaints,
        departments,
        analytics,
        ai,
        notifications,
        audit,
        users,
        graph,
    )
except ImportError:
    from app.routers import (
        health,
        auth,
        complaints,
        departments,
        analytics,
        ai,
        notifications,
        audit,
        users,
        graph,
    )

__all__ = [
    "health",
    "auth",
    "complaints",
    "departments",
    "analytics",
    "ai",
    "notifications",
    "audit",
    "users",
    "graph",
]
