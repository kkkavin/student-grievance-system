"""FastAPI Health Check Router."""
from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/api/v1/health")
@router.get("/api/health")
@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "student-grievance-fastapi",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "2.0.0-2026",
    }
