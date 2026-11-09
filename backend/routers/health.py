from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "student-grievance-fastapi",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "2026.1.0",
    }
