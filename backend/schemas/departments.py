from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class CategoryRoutingRule(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    category: str
    subcategory: Optional[str] = None
    department_id: str = Field(alias="departmentId")
    priority_override: Optional[str] = Field(default=None, alias="priorityOverride")
    location_tag_pattern: Optional[str] = Field(default=None, alias="locationTagPattern")
    priority_order: int = Field(default=10, alias="priorityOrder")
    is_active: bool = Field(default=True, alias="isActive")
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")


class CategoryRoutingRuleCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    category: str
    subcategory: Optional[str] = None
    department_id: str = Field(alias="departmentId")
    priority_override: Optional[str] = Field(default=None, alias="priorityOverride")
    location_tag_pattern: Optional[str] = Field(default=None, alias="locationTagPattern")
    priority_order: Optional[int] = Field(default=10, alias="priorityOrder")
    is_active: Optional[bool] = Field(default=True, alias="isActive")


class Department(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    name: str
    code: str
    categories: List[str] = Field(default_factory=list)
    sla_hours: int = Field(alias="slaHours")
    head_email: str = Field(alias="headEmail")
    contact_phone: Optional[str] = Field(default=None, alias="contactPhone")
    description: Optional[str] = None
    location: Optional[str] = None
    is_active: bool = Field(default=True, alias="isActive")
    routing_rules: Optional[List[CategoryRoutingRule]] = Field(default=None, alias="routingRules")
    created_at: Optional[str] = Field(default=None, alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")


class DepartmentCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[str] = None
    name: str
    code: str
    categories: List[str] = Field(default_factory=list)
    sla_hours: int = Field(default=48, alias="slaHours")
    head_email: str = Field(alias="headEmail")
    contact_phone: Optional[str] = Field(default=None, alias="contactPhone")
    description: Optional[str] = None
    location: Optional[str] = None


class AssignDepartmentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    user_id: str = Field(alias="userId")
    department_id: Optional[str] = Field(default=None, alias="departmentId")


class AuditLogEntry(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    entity_type: str = Field(alias="entityType")
    entity_id: str = Field(alias="entityId")
    action: str
    actor_id: str = Field(alias="actorId")
    actor_email: str = Field(alias="actorEmail")
    actor_role: str = Field(alias="actorRole")
    previous_state: Optional[Dict[str, Any]] = Field(default=None, alias="previousState")
    new_state: Optional[Dict[str, Any]] = Field(default=None, alias="newState")
    created_at: str = Field(alias="createdAt")
