"""Grievance and complaint domain schemas."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class GrievanceCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: Optional[str] = None
    description: str
    category: Optional[str] = None
    reg_no: Optional[str] = Field(default=None, alias="regNo")
    student_name: Optional[str] = Field(default=None, alias="studentName")
    student_email: Optional[str] = Field(default=None, alias="studentEmail")
    student_phone: Optional[str] = Field(default=None, alias="studentPhone")
    student_type: Optional[str] = Field(default="hosteller", alias="studentType")
    hostel_block: Optional[str] = Field(default=None, alias="hostelBlock")
    room_no: Optional[str] = Field(default=None, alias="roomNo")
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    priority: Optional[str] = "medium"


class GrievanceUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    status: Optional[str] = None
    priority: Optional[str] = None
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    admin_notes: Optional[str] = Field(default=None, alias="adminNotes")


class GrievanceStatusPatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    status: str
    admin_notes: Optional[str] = Field(default=None, alias="adminNotes")


class GrievanceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    ticket_no: str = Field(alias="ticketNo")
    student_reg_no: str = Field(alias="studentRegNo")
    student_name: str = Field(alias="studentName")
    student_email: str = Field(alias="studentEmail")
    student_phone: Optional[str] = Field(default=None, alias="studentPhone")
    student_type: str = Field(alias="studentType")
    category: str
    description: str
    status: str
    priority: str
    is_spam: bool = Field(default=False, alias="isSpam")
    spam_reason: Optional[str] = Field(default=None, alias="spamReason")
    hostel_block: Optional[str] = Field(default=None, alias="hostelBlock")
    room_no: Optional[str] = Field(default=None, alias="roomNo")
    assigned_department_id: Optional[str] = Field(default=None, alias="assignedDepartmentId")
    master_case_id: Optional[str] = Field(default=None, alias="masterCaseId")
    duplicate_of_id: Optional[str] = Field(default=None, alias="duplicateOfId")
    duplicate_count: int = Field(default=0, alias="duplicateCount")
    intercepted_by_dedup: bool = Field(default=False, alias="interceptedByDedup")
    created_at: str = Field(alias="createdAt")
    resolved_at: Optional[str] = Field(default=None, alias="resolvedAt")
    upvote_count: int = Field(default=0, alias="upvoteCount")


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


class MatchCandidate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    ticket_id: str = Field(alias="ticketId")
    ticket_no: str = Field(alias="ticketNo")
    category: str
    description: str
    similarity: float
    status: str
    created_at: str = Field(alias="createdAt")


class DeduplicationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    is_duplicate: bool = Field(alias="isDuplicate")
    similarity_score: float = Field(alias="similarityScore")
    match_type: Optional[str] = Field(default=None, alias="matchType")
    parent_ticket_id: Optional[str] = Field(default=None, alias="parentTicketId")
    candidates: List[MatchCandidate] = Field(default_factory=list)


class TriageGrievance(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    ticket_no: str = Field(alias="ticketNo")
    description: str
    category: str
    status: str
    priority: str
    similarity_score: Optional[float] = Field(default=None, alias="similarityScore")
    suggested_action: str = Field(alias="suggestedAction")
    created_at: str = Field(alias="createdAt")


class TriageQueueResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    total_in_queue: int = Field(alias="totalInQueue")
    items: List[TriageGrievance]


# Backward compatibility aliases
ComplaintCreate = GrievanceCreate
ComplaintUpdate = GrievanceUpdate
Grievance = GrievanceResponse
