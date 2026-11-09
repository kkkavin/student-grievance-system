"""
Application Settings & Environment Configuration for FastAPI Backend.
Uses Pydantic v2 Settings with strict typing, default fallbacks, and cached access.
"""

from functools import lru_cache
from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Core Application & Network
    environment: str = Field(default="development", alias="ENVIRONMENT")
    port: int = Field(default=8000, alias="PORT")
    fastapi_url: str = Field(default="http://localhost:8000", alias="FASTAPI_URL")
    next_public_api_url: str = Field(
        default="http://localhost:3000/api", alias="NEXT_PUBLIC_API_URL"
    )

    # Database Persistence (PostgreSQL 16 + pgvector)
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/campus_grievance_db",
        alias="DATABASE_URL",
    )
    sync_database_url_override: Optional[str] = Field(
        default=None,
        alias="SYNC_DATABASE_URL",
    )
    sqlite_fallback_url: str = Field(
        default="sqlite+aiosqlite:///./backend.sqlite",
        alias="SQLITE_FALLBACK_URL",
    )

    # Cryptographic Authentication & RBAC (RFC 7519 HS256)
    jwt_secret: str = Field(
        default="grievance-system-jwt-secret-key-prod-2026",
        alias="JWT_SECRET",
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expiration_seconds: int = Field(
        default=86400, alias="JWT_EXPIRATION_SECONDS"
    )

    # Universal Development OTP
    universal_dev_otp: str = Field(default="123456", alias="UNIVERSAL_DEV_OTP")

    # Optional External Integrations
    gemini_api_key: Optional[str] = Field(default=None, alias="GEMINI_API_KEY")
    gmail_user: Optional[str] = Field(default=None, alias="GMAIL_USER")
    gmail_app_password: Optional[str] = Field(default=None, alias="GMAIL_APP_PASSWORD")

    @property
    def sync_database_url(self) -> str:
        """Translates async database URL to sync driver for Alembic migrations, or honors SYNC_DATABASE_URL."""
        if self.sync_database_url_override:
            return self.sync_database_url_override
        url = self.database_url
        if url.startswith("postgresql+asyncpg://"):
            return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://", 1)
        elif url.startswith("sqlite+aiosqlite:///"):
            return url.replace("sqlite+aiosqlite:///", "sqlite:///", 1)
        return url

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.database_url.lower()


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
