"""Common API response wrappers."""
from typing import Generic, Optional, TypeVar
from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    model_config = ConfigDict(populate_by_name=True)
    success: bool = True
    data: Optional[T] = None
    message: Optional[str] = None


class ErrorResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    success: bool = False
    error: str
    code: Optional[str] = None
    role: Optional[str] = None
