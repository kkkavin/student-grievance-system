from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ClassifyComplaintRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    text: str
    category: Optional[str] = None
    student_type: Optional[str] = Field(default=None, alias="studentType")


class ClassifyComplaintResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    is_valid_complaint: bool = Field(alias="isValidComplaint")
    is_campus_relevant: bool = Field(alias="isCampusRelevant")
    is_complaint_intent: bool = Field(alias="isComplaintIntent")
    rejection_reason: Optional[str] = Field(default=None, alias="rejectionReason")
    is_spam: bool = Field(alias="isSpam")
    reason: str
    confidence: float
    suggested_category: str = Field(alias="suggestedCategory")
    suggested_icon: Optional[str] = Field(default=None, alias="suggestedIcon")
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    priority: str
    is_urgent: bool = Field(alias="isUrgent")


class MLModelInfoResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str
    version: str
    architecture: str
    categories_count: int = Field(alias="categoriesCount")
    latency_profile: str = Field(alias="latencyProfile")
    status: str
