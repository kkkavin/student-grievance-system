"""AI Classifier request and response schemas."""
from typing import Any, Dict, List, Literal, Optional
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, computed_field


class TriageRequest(BaseModel):
    """Payload schema for AI grievance triage."""
    model_config = ConfigDict(populate_by_name=True)

    text: str
    category: Optional[str] = None
    student_type: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("student_type", "studentType"),
    )
    location_tag: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("location_tag", "locationTag"),
    )


class TriageResult(BaseModel):
    """Strict Pydantic v2 schema for AI LLM triage and local fallback."""
    model_config = ConfigDict(populate_by_name=True)

    is_valid_grievance: bool = Field(
        validation_alias=AliasChoices("is_valid_grievance", "isValidGrievance")
    )
    rejection_reason: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("rejection_reason", "rejectionReason"),
    )
    category: str
    department_id: str = Field(
        validation_alias=AliasChoices("department_id", "departmentId")
    )
    urgency: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    confidence: float
    intent_summary: str = Field(
        validation_alias=AliasChoices("intent_summary", "intentSummary")
    )
    actionable_steps: List[str] = Field(
        validation_alias=AliasChoices("actionable_steps", "actionableSteps")
    )

    @computed_field
    @property
    def isValidGrievance(self) -> bool:
        return self.is_valid_grievance

    @computed_field
    @property
    def rejectionReason(self) -> Optional[str]:
        return self.rejection_reason

    @computed_field
    @property
    def departmentId(self) -> str:
        return self.department_id

    @computed_field
    @property
    def intentSummary(self) -> str:
        return self.intent_summary

    @computed_field
    @property
    def actionableSteps(self) -> List[str]:
        return self.actionable_steps


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
    model_name: str = Field(alias="modelName")
    version: str
    architecture: str
    categories_count: int = Field(alias="categoriesCount")
    latency_profile: str = Field(alias="latencyProfile")
    status: str
