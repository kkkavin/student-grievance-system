"""
Database connection, AsyncEngine, session factory, and Base declarative model.
Re-exported from backend.app.db.session for backwards compatibility.
"""
from backend.app.db.session import (
    Base,
    engine,
    AsyncSessionLocal,
    get_engine,
    get_session_factory,
    get_db,
    get_db_session,
    init_db,
    get_database_url,
    DATABASE_URL,
    DatabaseEngineManager,
    compile_vector_sqlite,
)

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
    "compile_vector_sqlite",
]
