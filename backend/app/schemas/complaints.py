"""Complaint and grievance domain schemas."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ComplaintCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: Optional[str] = None
    description: str
    category: Optional[str] = None
    reg_no: Optional[str] = Field(default=None, alias="regNo")
    student_name: Optional[str] = Field(default=None, alias="studentName")
    student_email: Optional[str] = Field(default=None, alias="studentEmail")
    student_type: Optional[str] = Field(default="hosteller", alias="studentType")
    hostel_block: Optional[str] = Field(default=None, alias="hostelBlock")
    room_no: Optional[str] = Field(default=None, alias="roomNo")
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    priority: Optional[str] = "medium"


class ComplaintUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    status: Optional[str] = None
    priority: Optional[str] = None
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    admin_notes: Optional[str] = Field(default=None, alias="adminNotes")


class ResolveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    resolution_note: Optional[str] = Field(default=None, alias="resolutionNote")
    admin_notes: Optional[str] = Field(default=None, alias="adminNotes")


class ResolveResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    success: bool = True
    parent_id: str = Field(alias="parentId")
    parent_ticket_id: str = Field(alias="parentTicketId")
    resolved_count: int = Field(alias="resolvedCount")
    child_ids: List[str] = Field(default_factory=list, alias="childIds")
    notifications_sent: int = Field(default=0, alias="notificationsSent")
    timestamp: str


class UpvoteResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    success: bool = True
    upvoted: bool
    upvote_count: int = Field(alias="upvoteCount")


class MasterNotesUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    public_master_notes: str = Field(alias="publicMasterNotes")


class MergeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    master_id: str = Field(alias="masterId")
    child_id: Optional[str] = Field(default=None, alias="childId")
    duplicate_ids: Optional[List[str]] = Field(default=None, alias="duplicateIds")


class DetachRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    child_id: Optional[str] = Field(default=None, alias="childId")
    complaint_id: Optional[str] = Field(default=None, alias="complaintId")


class ReassignRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    target_department_id: Optional[str] = Field(default=None, alias="targetDepartmentId")
    reason: Optional[str] = "Manual reassignment by Super Admin"


class RequestReassignRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    suggested_department_id: Optional[str] = Field(default=None, alias="suggestedDepartmentId")
    suggested_department: Optional[str] = Field(default=None, alias="suggestedDepartment")
    reason: Optional[str] = None
