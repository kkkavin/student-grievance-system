"""Pydantic schemas for Outbound Webhook management and delivery telemetry."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


class WebhookConfigCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    name: str = Field(..., description="Descriptive identifier for the webhook endpoint")
    target_url: str = Field(..., alias="targetUrl", description="Destination HTTP/HTTPS endpoint")
    platform: str = Field(default="custom", description="Target platform: 'slack', 'discord', or 'custom'")
    secret_header: Optional[str] = Field(default=None, alias="secretHeader", description="Optional authentication header value")
    trigger_on_critical: bool = Field(default=True, alias="triggerOnCritical", description="Trigger webhook on CRITICAL grievances")
    trigger_on_duplicate_cluster: bool = Field(default=True, alias="triggerOnDuplicateCluster", description="Trigger on duplicate clusters >= 3")
    is_active: bool = Field(default=True, alias="isActive", description="Whether webhook is actively receiving events")

    @field_validator("target_url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v or not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("target_url must be a valid HTTP or HTTPS URL")
        return v


class WebhookConfigUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    name: Optional[str] = None
    target_url: Optional[str] = Field(default=None, alias="targetUrl")
    platform: Optional[str] = None
    secret_header: Optional[str] = Field(default=None, alias="secretHeader")
    trigger_on_critical: Optional[bool] = Field(default=None, alias="triggerOnCritical")
    trigger_on_duplicate_cluster: Optional[bool] = Field(default=None, alias="triggerOnDuplicateCluster")
    is_active: Optional[bool] = Field(default=None, alias="isActive")

    @field_validator("target_url")
    @classmethod
    def validate_url(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("target_url must be a valid HTTP or HTTPS URL")
        return v


class WebhookConfigResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    name: str
    target_url: str = Field(alias="targetUrl")
    platform: str = "custom"
    secret_header: Optional[str] = Field(default=None, alias="secretHeader")
    trigger_on_critical: bool = Field(alias="triggerOnCritical")
    trigger_on_duplicate_cluster: bool = Field(alias="triggerOnDuplicateCluster")
    is_active: bool = Field(alias="isActive")
    created_at: str = Field(alias="createdAt")


class WebhookPayloadSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    event: str
    grievance_id: Optional[str] = Field(default=None, alias="grievanceId")
    ticket_no: Optional[str] = Field(default=None, alias="ticketNo")
    category: Optional[str] = None
    department: Optional[str] = None
    urgency: Optional[str] = None
    intent_summary: Optional[str] = Field(default=None, alias="intentSummary")
    actionable_steps: List[str] = Field(default_factory=list, alias="actionableSteps")
    duplicate_count: Optional[int] = Field(default=0, alias="duplicateCount")
    timestamp: Optional[str] = None


class WebhookDeliveryLogResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    id: str
    webhook_id: str = Field(alias="webhookId")
    grievance_id: Optional[str] = Field(default=None, alias="grievanceId")
    event_type: str = Field(alias="eventType")
    status_code: Optional[int] = Field(default=None, alias="statusCode")
    payload_json: Dict[str, Any] = Field(alias="payloadJson")
    response_body: Optional[str] = Field(default=None, alias="responseBody")
    delivered_at: str = Field(alias="deliveredAt")


class WebhookTestResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)

    success: bool
    status_code: Optional[int] = Field(default=None, alias="statusCode")
    delivery_log: Optional[WebhookDeliveryLogResponse] = Field(default=None, alias="deliveryLog")
    message: str = "Webhook test dispatched"
