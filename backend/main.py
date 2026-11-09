"""
FastAPI Application Entry Point.
Production-grade 2026 AI Tech Stack:
FastAPI + Pydantic v2 + SQLAlchemy 2.0 Async + PostgreSQL 16 (pgvector) with SQLite fallback.
Exports app from backend.app.main with dual-mounting of /api/complaints and /api/grievances.
"""

from backend.app.main import app

if __name__ == "__main__":
    import uvicorn
    from backend.app.core.config import settings
    uvicorn.run("backend.main:app", host="0.0.0.0", port=getattr(settings, "port", 8000), reload=True)
