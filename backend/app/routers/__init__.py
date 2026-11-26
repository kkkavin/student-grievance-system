"""FastAPI routers package."""
try:
    from backend.app.routers import (
        health,
        auth,
        grievances,
        departments,
        analytics,
        ai,
        notifications,
        audit,
        users,
        graph,
    )
    complaints = grievances
except ImportError:
    from app.routers import (
        health,
        auth,
        grievances,
        departments,
        analytics,
        ai,
        notifications,
        audit,
        users,
        graph,
    )
    complaints = grievances

__all__ = [
    "health",
    "auth",
    "grievances",
    "complaints",
    "departments",
    "analytics",
    "ai",
    "notifications",
    "audit",
    "users",
    "graph",
]
