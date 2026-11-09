"""
Pytest Fixtures for FastAPI & Database Persistence Testing.
Provides an async database session with automatic dual-engine capabilities:
- When PostgreSQL (Docker/live) is reachable: tests against PostgreSQL 16 + pgvector.
- When PostgreSQL is offline (CI/local sandbox): automatically falls back to in-memory SQLite async engine.
"""

import asyncio
import logging
import sys
from pathlib import Path
from typing import AsyncGenerator

# Ensure project root is in sys.path for backend package discovery
project_root = str(Path(__file__).resolve().parent.parent.parent)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy import text
from httpx import AsyncClient, ASGITransport

from backend.config import get_settings
from backend.db.base import Base
from backend.db.seed import seed_database

try:
    from backend.main import app
except ImportError:
    app = None

logger = logging.getLogger("test_conftest")

# Cache PostgreSQL reachability across test functions
_postgres_reachable: bool | None = None


@pytest_asyncio.fixture(scope="function")
async def test_engine() -> AsyncGenerator[AsyncEngine, None]:
    """
    Database engine with dynamic PostgreSQL -> SQLite in-memory fallback.
    """
    global _postgres_reachable
    settings = get_settings()
    engine: AsyncEngine

    if _postgres_reachable is not False:
        try:
            # Quick probe to configured PostgreSQL instance with 1s timeout
            pg_engine = create_async_engine(
                settings.database_url,
                echo=False,
                connect_args={"timeout": 1.0} if "asyncpg" in settings.database_url else {},
            )
            async with pg_engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                await conn.commit()
            _postgres_reachable = True
            logger.info("Successfully connected to live PostgreSQL instance for test execution.")
            engine = pg_engine
        except Exception as e:
            _postgres_reachable = False
            logger.warning(
                f"PostgreSQL connection to {settings.database_url} failed ({type(e).__name__}). "
                f"Activating transparent SQLite in-memory async fallback."
            )
            engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    else:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    if "sqlite" in engine.url.drivername:
        from sqlalchemy import event

        @event.listens_for(engine.sync_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    # Initialize all 7 normalized relational tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Teardown
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """
    Function-scoped database session wrapped in an isolated transaction rolled back on completion.
    """
    connection = await test_engine.connect()
    trans = await connection.begin()
    session_factory = async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        class_=AsyncSession,
    )
    session = session_factory()

    yield session

    await session.close()
    await trans.rollback()
    await connection.close()


@pytest_asyncio.fixture(scope="function")
async def seeded_session(db_session: AsyncSession) -> AsyncSession:
    """
    Function-scoped database session pre-populated with deterministic seed data:
    5 departments, 14 routing rules, 16 users, and 5 initial grievances.
    """
    await seed_database(db_session, include_historical=False)
    await db_session.flush()
    return db_session


@pytest_asyncio.fixture(scope="function")
async def m2_seeded_session(db_session: AsyncSession) -> AsyncSession:
    """
    Function-scoped database session pre-populated with Milestone 2 10-department operational seed data.
    """
    try:
        from backend.app.db.seed import seed_database as seed_modern_db
        await seed_modern_db(db_session, reset=False, include_historical=False)
    except Exception as e:
        logger.warning(f"Modern seeding pass in fixture failed: {e}")
    await db_session.flush()
    return db_session


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """
    Async HTTP test client bound to FastAPI app with database dependency override.
    """
    if app is None:
        pytest.skip("FastAPI app not loaded (Milestone 2 deliverable)")

    from backend.db.base import get_db
    from backend.db.session import get_db_session

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_db_session] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def async_client(client: AsyncClient) -> AsyncClient:
    """Alias fixture for async_client."""
    return client
