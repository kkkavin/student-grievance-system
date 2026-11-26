"""
CLI and Programmatic Database Initialization Runner.
Usage:
    python -m app.db.init_db
    python -m backend.app.db.init_db
Initializes pgvector extension, creates all 8 core tables, and installs
backward-compatibility database views on PostgreSQL.
"""

import asyncio
import logging
from pathlib import Path
import sys

# Ensure backend and repository root directories are in sys.path
_current_dir = Path(__file__).resolve().parent
_backend_dir = _current_dir.parent.parent
_root_dir = _backend_dir.parent

for _p in (str(_backend_dir), str(_root_dir)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from sqlalchemy import text

# Import engine, Base, and register all models
try:
    from backend.app.db.session import engine, Base
    import backend.app.db.models  # noqa: F401
except ImportError:
    from app.db.session import engine, Base
    import app.db.models  # noqa: F401

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("init_db")


async def init_database() -> bool:
    """
    Initializes database tables, vector extension, and backward compatibility views.
    Returns True on success, False on fatal error.
    """
    logger.info("Starting database schema initialization...")
    dialect_name = engine.dialect.name
    logger.info(f"Target database dialect: {dialect_name}")

    has_vector = False
    if dialect_name == "postgresql":
        try:
            logger.info("Checking PostgreSQL pgvector extension...")
            async with engine.connect() as probe_conn:
                res = await probe_conn.execute(
                    text("SELECT 1 FROM pg_extension WHERE extname = 'vector';")
                )
                if res.scalar():
                    has_vector = True
                    logger.info("pgvector extension already installed.")
                else:
                    autocommit_conn = await probe_conn.execution_options(isolation_level="AUTOCOMMIT")
                    await autocommit_conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
                    has_vector = True
                    logger.info("pgvector extension successfully created.")
        except Exception as ext_err:
            logger.info(f"Note on CREATE EXTENSION vector: {ext_err}. Proceeding with JSON/text serialization.")
            has_vector = False

        engine.dialect.has_pgvector = has_vector
        if not has_vector:
            logger.info("Adjusting Complaint table indices for non-pgvector environment...")
            try:
                from backend.app.db.models import Complaint
            except ImportError:
                from app.db.models import Complaint
            hnsw_indexes = [idx for idx in Complaint.__table__.indexes if idx.name == "idx_complaints_embedding_hnsw"]
            for idx in hnsw_indexes:
                Complaint.__table__.indexes.remove(idx)

    async with engine.begin() as conn:
        # 1. Create All Tables
        logger.info(f"Creating all {len(Base.metadata.tables)} tables in Base.metadata...")
        for table_name in Base.metadata.tables:
            logger.info(f"  -> Model table: {table_name}")
        await conn.run_sync(Base.metadata.create_all)
        logger.info("Tables created successfully.")

        # 3. PostgreSQL Backward Compatibility Views
        if dialect_name == "postgresql":
            logger.info("Configuring PostgreSQL backward-compatibility views...")
            try:
                await conn.execute(text("CREATE OR REPLACE VIEW grievances AS SELECT * FROM complaints;"))
                await conn.execute(text("CREATE OR REPLACE VIEW outbox AS SELECT * FROM notifications;"))
                logger.info("Views 'grievances' and 'outbox' verified.")
            except Exception as view_err:
                logger.warning(f"Note on creating views: {view_err}")

        # 4. Synchronize Alembic migration state directly in database
        try:
            await conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS alembic_version ("
                    "version_num VARCHAR(32) NOT NULL, "
                    "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)"
                    ");"
                )
            )
            await conn.execute(text("DELETE FROM alembic_version;"))
            await conn.execute(
                text("INSERT INTO alembic_version (version_num) VALUES ('0001_initial_schema');")
            )
            logger.info("Alembic migration version synchronized to '0001_initial_schema'.")
        except Exception as stamp_err:
            logger.debug(f"Alembic stamp notice: {stamp_err}")

    logger.info("Database initialization completed successfully.")
    return True


def main() -> None:
    """Synchronous CLI entry point for 'python -m app.db.init_db'."""
    try:
        success = asyncio.run(init_database())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        logger.info("Database initialization aborted by user.")
        sys.exit(130)
    except Exception as exc:
        logger.error(f"Fatal error during database initialization: {exc}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
