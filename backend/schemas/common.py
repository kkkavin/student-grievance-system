from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    model_config = ConfigDict(populate_by_name=True)
    success: bool = True
    message: Optional[str] = None
    data: Optional[T] = None
    error: Optional[str] = None


class ErrorResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    success: bool = False
    error: str
