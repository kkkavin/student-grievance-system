"""Authentication and user session schemas."""
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class JWTPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    email: str
    role: str
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    name: Optional[str] = None
    reg_no: Optional[str] = Field(default=None, alias="regNo")
    permissions: List[str] = Field(default_factory=list)
    iat: Optional[int] = None
    exp: Optional[int] = None
    iss: Optional[str] = "student-grievance-system"


class UserProfile(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    name: str
    email: str
    role: str
    reg_no: str = Field(alias="regNo")
    department_id: Optional[str] = Field(default=None, alias="departmentId")
    phone: Optional[str] = None
    gender: Optional[str] = "Male"
    student_type: Optional[str] = Field(default="hosteller", alias="studentType")
    hostel_block: Optional[str] = Field(default=None, alias="hostelBlock")
    room_no: Optional[str] = Field(default=None, alias="roomNo")
    permissions: List[str] = Field(default_factory=list)
    created_at: Optional[str] = Field(default=None, alias="createdAt")


class LoginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    identifier: Optional[str] = None
    reg_no: Optional[str] = Field(default=None, alias="regNo")
    email: Optional[str] = None
    password: str
    portal: Optional[str] = None


class AdminLoginRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    identifier: Optional[str] = None
    reg_no: Optional[str] = Field(default=None, alias="regNo")
    email: Optional[str] = None
    password: str


class LoginResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    success: bool = True
    token: str
    user: UserProfile
    role: str
    redirect_url: str = Field(alias="redirectUrl")


class RegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str
    email: str
    password: str
    reg_no: str = Field(alias="regNo")
    department: Optional[str] = None
    gender: Optional[str] = "Male"
    student_type: Optional[str] = Field(default="hosteller", alias="studentType")
    phone: Optional[str] = None
    hostel_block: Optional[str] = Field(default=None, alias="hostelBlock")
    room_no: Optional[str] = Field(default=None, alias="roomNo")


class SendOTPRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    email: str
    name: Optional[str] = None
    reg_no: Optional[str] = Field(default=None, alias="regNo")
    type: Optional[str] = "signup"


class VerifyOTPRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    email: str
    otp: str
