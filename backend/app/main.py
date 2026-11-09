"""
FastAPI Application Entry Point for Production AI Decoupled Architecture.
FastAPI + Pydantic v2 + SQLAlchemy 2.0 Async + PostgreSQL 16 (pgvector) / SQLite Fallback.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from backend.app.core.config import settings
    from backend.app.db.session import init_db
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
    from app.core.config import settings
    from app.db.session import init_db
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
        content={"success": False, "error": "Validation error", "details": exc.errors()},
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "error": str(exc)},
    )


# Register Routers
app.include_router(health.router)
app.include_router(auth.router)

# Dual-mounted complaints/grievances router
app.include_router(complaints.router, prefix="/api/complaints", tags=["Complaints"])
app.include_router(complaints.router, prefix="/api/grievances", tags=["Grievances (Legacy Alias)"])

# Auxiliary service routers
app.include_router(departments.router)
app.include_router(analytics.router)
app.include_router(ai.router)
app.include_router(notifications.router)
app.include_router(audit.router)
app.include_router(users.router)
app.include_router(graph.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=getattr(settings, "port", 8000), reload=True)
