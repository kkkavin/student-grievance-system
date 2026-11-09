"""
FastAPI AI & Machine Learning Classification Router.
Sub-50ms inference, campus gatekeeper, OOD veto, and model info.
"""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

try:
    from backend.app.ml.classifier import classify_complaint
except ImportError:
    from app.ml.classifier import classify_complaint

router = APIRouter(prefix="/api/ai", tags=["AI & Machine Learning"])


@router.post("/classify-complaint")
async def classify_complaint_endpoint(request: Request):
    body = await request.json()
    text = body.get("text")
    if not text or not isinstance(text, str):
        return JSONResponse(status_code=400, content={"error": "Complaint text is required"})

    category = body.get("category")
    student_type = body.get("studentType") or body.get("student_type")

    res = classify_complaint(text.strip(), student_type, {"category": category} if category else None)

    reason = (
        "Legitimate student grievance pattern verified by ML classifier"
        if res["isValidComplaint"]
        else (
            "Off-campus venue or non-campus domain grievance"
            if res["rejectionReason"] == "OFF_CAMPUS_DOMAIN"
            else f"Grievance rejected: {res['rejectionReason']}"
        )
    )

    return {
        "isValidComplaint": res["isValidComplaint"],
        "isCampusRelevant": res["isCampusRelevant"],
        "isComplaintIntent": res["isComplaintIntent"],
        "rejectionReason": res["rejectionReason"],
        "isSpam": not res["isValidComplaint"],
        "reason": reason,
        "confidence": res["confidence"],
        "suggestedCategory": res["category"] or (category or "Others"),
        "suggestedIcon": res["icon"],
        "departmentId": res["departmentId"],
        "priority": res["priority"],
        "isUrgent": res["isUrgent"],
    }


@router.get("/ml-model-info")
async def get_ml_model_info():
    return {
        "modelName": "Campus-Gatekeeper-ML/v2.0",
        "version": "2.0.0-2026",
        "architecture": "3-Stage Hybrid (Rule Regex + Intent Gate + Weighted N-Gram Scorer)",
        "categoriesCount": 14,
        "latencyProfile": "<5ms (In-Memory Python AST)",
        "status": "OPERATIONAL",
    }
