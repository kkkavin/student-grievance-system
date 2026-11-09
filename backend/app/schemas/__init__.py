"""Pydantic v2 schemas for campus grievance system."""
from app.schemas.common import APIResponse, ErrorResponse
from app.schemas.auth import (
    JWTPayload,
    UserProfile,
    LoginRequest,
    AdminLoginRequest,
    LoginResponse,
    RegisterRequest,
    SendOTPRequest,
    VerifyOTPRequest,
)
from app.schemas.complaints import (
    ComplaintCreate,
    ComplaintUpdate,
    ResolveRequest,
    ResolveResponse,
    UpvoteResponse,
    MasterNotesUpdateRequest,
    MergeRequest,
    DetachRequest,
    ReassignRequest,
    RequestReassignRequest,
)
from app.schemas.departments import (
    DepartmentCreate,
    DepartmentUpdate,
    CategoryRoutingRuleCreate,
    CategoryRoutingRuleUpdate,
    AssignDepartmentRequest,
)
from app.schemas.analytics import (
    HostelBlockRollup,
    TransportRouteRollup,
    CalendarMultipliers,
    ZoneRiskForecast,
    RiskForecastResponse,
)
from app.schemas.ai import (
    ClassifyComplaintRequest,
    ClassifyComplaintResponse,
    MLModelInfoResponse,
)
from app.schemas.notifications import (
    NotificationSendRequest,
    NotificationItem,
)
from app.schemas.users import (
    ChangePasswordRequest,
    UserUpsertRequest,
)

__all__ = [
    "APIResponse",
    "ErrorResponse",
    "JWTPayload",
    "UserProfile",
    "LoginRequest",
    "AdminLoginRequest",
    "LoginResponse",
    "RegisterRequest",
    "SendOTPRequest",
    "VerifyOTPRequest",
    "ComplaintCreate",
    "ComplaintUpdate",
    "ResolveRequest",
    "ResolveResponse",
    "UpvoteResponse",
    "MasterNotesUpdateRequest",
    "MergeRequest",
    "DetachRequest",
    "ReassignRequest",
    "RequestReassignRequest",
    "DepartmentCreate",
    "DepartmentUpdate",
    "CategoryRoutingRuleCreate",
    "CategoryRoutingRuleUpdate",
    "AssignDepartmentRequest",
    "HostelBlockRollup",
    "TransportRouteRollup",
    "CalendarMultipliers",
    "ZoneRiskForecast",
    "RiskForecastResponse",
    "ClassifyComplaintRequest",
    "ClassifyComplaintResponse",
    "MLModelInfoResponse",
    "NotificationSendRequest",
    "NotificationItem",
    "ChangePasswordRequest",
    "UserUpsertRequest",
]
