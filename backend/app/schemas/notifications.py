"""Notification outbox schemas."""
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class NotificationSendRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    to: Optional[str] = None
    recipient: Optional[str] = None
    type: Optional[str] = "notice"
    ticket_no: Optional[str] = Field(default=None, alias="ticketNo")
    student_name: Optional[str] = Field(default=None, alias="studentName")
    category: Optional[str] = None
    subject: Optional[str] = None
    custom_message: Optional[str] = Field(default=None, alias="customMessage")
    body: Optional[str] = None


class NotificationItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    to: Optional[str] = None
    recipient: Optional[str] = None
    subject: str
    body: str
    type: str
    timestamp: Optional[str] = None
