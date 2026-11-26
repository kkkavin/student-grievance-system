"""
Database Connection, Session Factory, and Dual-Driver Engine Manager.
Provides seamless execution with PostgreSQL 16 + pgvector, with automatic
transparent fallback to SQLite (backend.sqlite) when the PostgreSQL daemon
is offline, guaranteeing that tests, development servers, and CLI utilities
never crash due to database unavailability.
"""

import asyncio
import logging
import os
from pathlib import Path
import socket
from typing import AsyncGenerator, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger("app.db.session")


# ---------------------------------------------------------------------------
# Declarative Base & Vector Compiles
# ---------------------------------------------------------------------------
class Base(AsyncAttrs, DeclarativeBase):
    """Declarative Base class for all ORM models."""
    pass


@compiles(Vector, "sqlite")
def compile_vector_sqlite(type_, compiler, **kw):
    """Compiles pgvector Vector columns to TEXT in SQLite environments."""
    return "TEXT"


@compiles(Vector, "postgresql")
def compile_vector_postgresql(type_, compiler, **kw):
    """Compiles pgvector Vector columns to TEXT if pgvector extension is not present."""
    if not getattr(compiler.dialect, "has_pgvector", False):
        return "TEXT"
    return f"vector({type_.dim})" if type_.dim else "vector"


from sqlalchemy.schema import CreateIndex


@compiles(CreateIndex, "postgresql")
def compile_create_index_postgresql(create_index_element, compiler, **kw):
    """Safely suppresses HNSW vector index generation when pgvector is unavailable."""
    idx = create_index_element.element
    if idx.name == "idx_complaints_embedding_hnsw" and not getattr(compiler.dialect, "has_pgvector", False):
        return "-- Skip HNSW index because pgvector extension is not installed"
    return compiler.visit_create_index(create_index_element, **kw)


# ---------------------------------------------------------------------------
# Connection String Resolution & Socket Probing
# ---------------------------------------------------------------------------
def _resolve_project_root() -> Path:
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / "package.json").exists() and (parent / "backend").is_dir():
            return parent
    return Path.cwd()


def get_default_sqlite_url() -> str:
    root = _resolve_project_root()
    sqlite_path = (root / "backend.sqlite").resolve()
    return f"sqlite+aiosqlite:///{sqlite_path.as_posix()}"


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if not url:
        try:
            from backend.app.core.config import get_settings
            url = get_settings().database_url
        except ImportError:
            try:
                from app.core.config import get_settings
                url = get_settings().database_url
            except ImportError:
                url = "postgresql+asyncpg://postgres:postgres@localhost:5432/campus_grievance_db"

    # Normalize PostgreSQL URL scheme to asyncpg
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    return url


def is_postgres_listening(url: str, timeout: float = 0.15) -> bool:
    """Performs a non-blocking TCP socket probe to verify DB host and port."""
    try:
        parsed = make_url(url)
        if "postgresql" not in parsed.drivername:
            return True
        host = parsed.host or "127.0.0.1"
        port = parsed.port or 5432
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False
    except Exception as exc:
        logger.debug(f"Socket probe exception on {url}: {exc}")
        return False


# ---------------------------------------------------------------------------
# Dual-Driver Engine Manager
# ---------------------------------------------------------------------------
class DatabaseEngineManager:
    """
    Manages the lifecycle of AsyncEngine with dynamic dual-driver failover:
    Primary: PostgreSQL 16 + pgvector (asyncpg)
    Fallback: SQLite (backend.sqlite via aiosqlite)
    """

    def __init__(self):
        self._engine: Optional[AsyncEngine] = None
        self._session_factory: Optional[async_sessionmaker[AsyncSession]] = None
        self._is_fallback_active: bool = False
        self._active_url: Optional[str] = None

    def _configure_sqlite_pragmas(self, engine: AsyncEngine) -> None:
        @event.listens_for(engine.sync_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

    def get_engine(self) -> AsyncEngine:
        if self._engine is not None:
            return self._engine

        target_url = get_database_url()
        echo = os.getenv("SQL_ECHO", "false").lower() in ("true", "1")
        fallback_url = os.getenv("SQLITE_FALLBACK_URL") or get_default_sqlite_url()

        if "sqlite" in target_url.lower():
            logger.info(f"[DB] Initializing primary SQLite async engine: {target_url}")
            self._engine = create_async_engine(target_url, echo=echo)
            self._configure_sqlite_pragmas(self._engine)
            self._is_fallback_active = True
            self._active_url = target_url
        else:
            # Target is PostgreSQL - perform fast probe
            if is_postgres_listening(target_url, timeout=0.15):
                logger.info(f"[DB] PostgreSQL detected on target port. Initializing asyncpg engine.")
                self._engine = create_async_engine(
                    target_url,
                    echo=echo,
                    pool_size=int(os.getenv("DB_POOL_SIZE", "20")),
                    max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
                    pool_pre_ping=True,
                    pool_recycle=3600,
                )
                self._is_fallback_active = False
                self._active_url = target_url
            else:
                logger.warning(
                    f"[DB] PostgreSQL server unreachable for URL '{target_url}'. "
                    f"Activating transparent SQLite fallback: {fallback_url}"
                )
                self._engine = create_async_engine(fallback_url, echo=echo)
                self._configure_sqlite_pragmas(self._engine)
                self._is_fallback_active = True
                self._active_url = fallback_url

        self._session_factory = async_sessionmaker(
            bind=self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
        return self._engine

    def switch_to_sqlite(self) -> AsyncEngine:
        """Forces immediate switch to SQLite engine."""
        fallback_url = os.getenv("SQLITE_FALLBACK_URL") or get_default_sqlite_url()
        logger.warning(f"[DB] Switching active engine to SQLite fallback: {fallback_url}")
        echo = os.getenv("SQL_ECHO", "false").lower() in ("true", "1")
        self._engine = create_async_engine(fallback_url, echo=echo)
        self._configure_sqlite_pragmas(self._engine)
        self._is_fallback_active = True
        self._active_url = fallback_url
        self._session_factory = async_sessionmaker(
            bind=self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )
        return self._engine

    def get_session_factory(self) -> async_sessionmaker[AsyncSession]:
        if self._session_factory is None:
            self.get_engine()
        assert self._session_factory is not None
        return self._session_factory

    @property
    def is_fallback(self) -> bool:
        return self._is_fallback_active

    @property
    def active_url(self) -> str:
        if self._active_url is None:
            self.get_engine()
        return self._active_url or ""


# Singleton Manager
_manager = DatabaseEngineManager()


def get_engine() -> AsyncEngine:
    return _manager.get_engine()


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return _manager.get_session_factory()


# Direct module engine & session factory handles
class _LazyEngineProxy:
    """Proxy object so 'from backend.db.session import engine' acts dynamically."""
    def __getattr__(self, name):
        return getattr(_manager.get_engine(), name)


class _LazySessionFactoryProxy:
    """Proxy object so 'from backend.db.session import AsyncSessionLocal' acts dynamically."""
    def __call__(self, *args, **kwargs):
        return _manager.get_session_factory()(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(_manager.get_session_factory(), name)


engine = _LazyEngineProxy()
AsyncSessionLocal = _LazySessionFactoryProxy()
DATABASE_URL = get_database_url()


# ---------------------------------------------------------------------------
# Database Schema Initialization Helper
# ---------------------------------------------------------------------------
async def init_db() -> None:
    """
    Initializes database tables.
    If on PostgreSQL, ensures pgvector extension exists.
    If PostgreSQL fails, switches immediately to SQLite fallback and creates tables.
    """
    active_engine = _manager.get_engine()
    try:
        async with active_engine.begin() as conn:
            if active_engine.dialect.name == "postgresql":
                try:
                    await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                except Exception as ext_err:
                    logger.warning(f"Could not enable pgvector: {ext_err}")
            await conn.run_sync(Base.metadata.create_all)
        logger.info(f"Database schema initialized successfully on {active_engine.dialect.name}.")
    except Exception as exc:
        if active_engine.dialect.name != "sqlite":
            logger.warning(
                f"Failed to connect to PostgreSQL during schema init ({exc}). "
                f"Falling back to SQLite (backend.sqlite)..."
            )
            fallback_engine = _manager.switch_to_sqlite()
            async with fallback_engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database schema initialized successfully on fallback SQLite.")
        else:
            raise


# ---------------------------------------------------------------------------
# FastAPI Dependency
# ---------------------------------------------------------------------------
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an AsyncSession with automatic transaction cleanup."""
    session_factory = _manager.get_session_factory()
    async with session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


get_db_session = get_db

__all__ = [
    "Base",
    "engine",
    "AsyncSessionLocal",
    "get_engine",
    "get_session_factory",
    "get_db",
    "get_db_session",
    "init_db",
    "get_database_url",
    "DATABASE_URL",
    "DatabaseEngineManager",
]
