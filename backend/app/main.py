"""
FastAPI Application Entry Point for Production AI Decoupled Architecture.
FastAPI + Pydantic v2 + SQLAlchemy 2.0 Async + PostgreSQL 16 (pgvector) / SQLite Fallback.
Provides canonical /api/v1/* primary endpoints with hidden /api/* backward-compatible aliases.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from backend.app.core.config import settings
    from backend.app.db.session import init_db
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
    from app.core.config import settings
    from app.db.session import init_db
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


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown lifecycle manager."""
    await init_db()
    yield


app = FastAPI(
    title="Campus Grievance Redressal System API",
    description="Production-grade AI & REST backend with pgvector similarity search, OOD gatekeeper, and cascading resolution",
    version="2.0.0-2026",
    lifespan=lifespan,
)

# CORS Configuration for Next.js App Router
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception Handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    content = exc.detail if isinstance(exc.detail, dict) else {"success": False, "error": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"success": False, "error": "Validation error", "details": jsonable_encoder(exc.errors())},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "error": str(exc)},
    )


# ---------------------------------------------------------------------------
# Primary v1 API Mounts (Published in OpenAPI)
# ---------------------------------------------------------------------------
app.include_router(grievances.router, prefix="/api/v1/grievances", tags=["Grievances"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["AI & Machine Learning"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])
app.include_router(departments.router)
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(audit.router, prefix="/api/v1/admin", tags=["Audit & Admin"])

# Webhooks router (VisAI Labs GTM Suite: Outbound Webhooks)
try:
    from backend.app.routers import webhooks
    app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["Webhooks"])
    app.include_router(webhooks.router, prefix="/api/webhooks", include_in_schema=False)
except ImportError:
    try:
        from app.routers import webhooks
        app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["Webhooks"])
        app.include_router(webhooks.router, prefix="/api/webhooks", include_in_schema=False)
    except ImportError:
        pass

# Health & Knowledge Graph routers
app.include_router(health.router)
app.include_router(graph.router)

# ---------------------------------------------------------------------------
# Hidden Backward-Compatible Legacy Aliases (include_in_schema=False)
# ---------------------------------------------------------------------------
app.include_router(grievances.router, prefix="/api/grievances", include_in_schema=False)
app.include_router(grievances.router, prefix="/api/complaints", include_in_schema=False)
app.include_router(auth.router, prefix="/api/auth", include_in_schema=False)
app.include_router(ai.router, prefix="/api/ai", include_in_schema=False)
app.include_router(ai.router, include_in_schema=False)
app.include_router(analytics.router, prefix="/api/analytics", include_in_schema=False)
app.include_router(notifications.router, prefix="/api/notifications", include_in_schema=False)
app.include_router(users.router, prefix="/api/users", include_in_schema=False)
app.include_router(audit.router, prefix="/api/admin", include_in_schema=False)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=getattr(settings, "port", 8000), reload=True)
