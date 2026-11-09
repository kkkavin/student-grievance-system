from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class IncidentMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    location_tag: Optional[str] = Field(default=None, alias="locationTag")
    hostel_block: Optional[str] = Field(default=None, alias="hostelBlock")
    floor_number: Optional[int] = Field(default=None, alias="floorNumber")
    room_number: Optional[str] = Field(default=None, alias="roomNumber")
    bus_route_number: Optional[str] = Field(default=None, alias="busRouteNumber")
    lab_name: Optional[str] = Field(default=None, alias="labName")
    equipment_id: Optional[str] = Field(default=None, alias="equipmentId")


class Grievance(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    ticket_id: Optional[str] = Field(default=None, alias="ticketId")
    reg_no: Optional[str] = Field(default=None, alias="regNo")
    student_name: Optional[str] = Field(default=None, alias="studentName")
    student_type: Optional[str] = Field(default=None, alias="studentType")
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    department: Optional[str] = None
    category: str
    sub_category: Optional[str] = Field(default=None, alias="subCategory")
    title: str
    description: str
    priority: str
    status: str
    is_urgent: bool = Field(default=False, alias="isUrgent")
    is_spam: bool = Field(default=False, alias="isSpam")
    is_anonymous: bool = Field(default=False, alias="isAnonymous")
    anonymous_token: Optional[str] = Field(default=None, alias="anonymousToken")
    confidence_score: Optional[float] = Field(default=None, alias="confidenceScore")
    suggested_department: Optional[str] = Field(default=None, alias="suggestedDepartment")
    routing_reason: Optional[str] = Field(default=None, alias="routingReason")
    routing_flow: Optional[str] = Field(default=None, alias="routingFlow")
    resolution_details: Optional[str] = Field(default=None, alias="resolutionDetails")
    resolved_at: Optional[str] = Field(default=None, alias="resolvedAt")
    assigned_staff_id: Optional[str] = Field(default=None, alias="assignedStaffId")
    sla_deadline: Optional[str] = Field(default=None, alias="slaDeadline")
    is_sla_breached: bool = Field(default=False, alias="isSlaBreached")
    sla_breached: Optional[bool] = Field(default=None, alias="slaBreached")
    duplicate_of_id: Optional[str] = Field(default=None, alias="duplicateOfId")
    duplicate_cluster_id: Optional[str] = Field(default=None, alias="duplicateClusterId")
    incident_metadata: Optional[IncidentMetadata] = Field(default=None, alias="incidentMetadata")
    created_at: str = Field(alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")
    embedding: Optional[List[float]] = None


class GrievanceCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    title: str
    description: str
    category: Optional[str] = None
    sub_category: Optional[str] = Field(default=None, alias="subCategory")
    reg_no: Optional[str] = Field(default=None, alias="regNo")
    student_name: Optional[str] = Field(default=None, alias="studentName")
    student_type: Optional[str] = Field(default="Hosteller", alias="studentType")
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    priority: Optional[str] = None
    is_urgent: Optional[bool] = Field(default=False, alias="isUrgent")
    is_anonymous: Optional[bool] = Field(default=False, alias="isAnonymous")
    incident_metadata: Optional[IncidentMetadata] = Field(default=None, alias="incidentMetadata")


class ReassignRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    target_department_id: Optional[str] = Field(default=None, alias="targetDepartmentId")
    department: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


class ResolveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    resolution_notes: Optional[str] = Field(default=None, alias="resolutionNotes")
    resolution_details: Optional[str] = Field(default=None, alias="resolutionDetails")
    resolved_by: Optional[str] = Field(default=None, alias="resolvedBy")
    status: Optional[str] = "Resolved"


class ResolveResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    success: bool = True
    parent_id: str = Field(alias="parentId")
    parent_ticket_id: str = Field(alias="parentTicketId")
    resolved_count: int = Field(alias="resolvedCount")
    child_ids: List[str] = Field(default_factory=list, alias="childIds")
    notifications_sent: int = Field(default=0, alias="notificationsSent")
    timestamp: str


class MergeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    primary_id: str = Field(alias="primaryId")
    duplicate_ids: List[str] = Field(alias="duplicateIds")


class DetachRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    complaint_id: str = Field(alias="complaintId")


class EscalateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    reason: Optional[str] = None


class MatchCandidate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    complaint_id: str = Field(alias="complaintId")
    ticket_id: str = Field(alias="ticketId")
    title: str
    similarity_score: float = Field(alias="similarityScore")
    status: str
    created_at: str = Field(alias="createdAt")
    department: str
    match_type: str = Field(alias="matchType")


class DeduplicationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    is_duplicate: bool = Field(alias="isDuplicate")
    auto_merged: bool = Field(alias="autoMerged")
    confidence: float
    cluster_id: Optional[str] = Field(default=None, alias="clusterId")
    primary_id: Optional[str] = Field(default=None, alias="primaryId")
    parent_ticket_id: Optional[str] = Field(default=None, alias="parentTicketId")
    match_candidates: List[MatchCandidate] = Field(default_factory=list, alias="matchCandidates")


class TriageGrievance(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    grievance: Grievance
    match_candidates: List[MatchCandidate] = Field(default_factory=list, alias="matchCandidates")
    recommended_action: str = Field(alias="recommendedAction")
    cluster_size: int = Field(default=1, alias="clusterSize")


class TriageQueueResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    queue: List[TriageGrievance]
    total_unresolved: int = Field(alias="totalUnresolved")
    duplicate_suspects_count: int = Field(alias="duplicateSuspectsCount")
