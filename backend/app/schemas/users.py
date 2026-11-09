"""User management and profile schemas."""
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    current_password: str = Field(alias="currentPassword")
    new_password: str = Field(alias="newPassword")


class UserUpsertRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    reg_no: str = Field(alias="regNo")
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = "Male"
    student_type: Optional[str] = Field(default="hosteller", alias="studentType")
    hostel_block: Optional[str] = Field(default=None, alias="hostelBlock")
    room_no: Optional[str] = Field(default=None, alias="roomNo")
