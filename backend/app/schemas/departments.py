"""Department and routing rule schemas."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class DepartmentCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[str] = None
    name: str
    code: str
    contact_email: str = Field(alias="contactEmail")
    is_active: Optional[bool] = Field(default=True, alias="isActive")


class DepartmentUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: Optional[str] = None
    code: Optional[str] = None
    contact_email: Optional[str] = Field(default=None, alias="contactEmail")
    is_active: Optional[bool] = Field(default=None, alias="isActive")


class CategoryRoutingRuleCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[str] = None
    category: str
    department_id: str = Field(alias="departmentId")
    priority_override: Optional[str] = Field(default=None, alias="priorityOverride")
    location_tag_pattern: Optional[str] = Field(default=None, alias="locationTagPattern")
    priority_order: Optional[int] = Field(default=0, alias="priorityOrder")
    is_active: Optional[bool] = Field(default=True, alias="isActive")


class CategoryRoutingRuleUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    category: Optional[str] = None
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    priority_override: Optional[str] = Field(default=None, alias="priorityOverride")
    location_tag_pattern: Optional[str] = Field(default=None, alias="locationTagPattern")
    priority_order: Optional[int] = Field(default=None, alias="priorityOrder")
    is_active: Optional[bool] = Field(default=None, alias="isActive")


class AssignDepartmentRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    user_id: str = Field(alias="userId")
    department_id: Optional[str] = Field(default=None, alias="departmentId")
