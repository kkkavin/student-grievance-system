from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class NotificationSendRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    to: str
    subject: str
    body: Optional[str] = None
    html: Optional[str] = None
    recipient: Optional[str] = None
    type: Optional[str] = None
    complaint_id: Optional[str] = Field(default=None, alias="complaintId")


class NotificationItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    user_id: Optional[str] = Field(default=None, alias="userId")
    recipient: str
    subject: str
    body: str
    type: str
    complaint_id: Optional[str] = Field(default=None, alias="complaintId")
    status: str
    created_at: str = Field(alias="createdAt")
