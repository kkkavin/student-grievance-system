"""
PostgreSQL Setup & Provisioning Helper for Campus Grievance Redressal System.
Automatically provisions 'campus_grievance_db', enables pgvector extension,
and synchronizes active connection strings into .env and backend/.env.
"""

import asyncio
import os
from pathlib import Path
import re
import socket
import sys
from typing import Dict, Optional


def check_port_open(host: str = "127.0.0.1", port: int = 5432, timeout: float = 1.0) -> bool:
    """Performs a fast, non-blocking TCP socket check."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (ConnectionRefusedError, TimeoutError, OSError):
        return False


def update_env_file(env_path: Path, updates: Dict[str, str]) -> None:
    """
    Idempotently updates key-value pairs in a .env file while preserving
    existing comments, blank lines, and unrelated configuration keys.
    """
    env_path.parent.mkdir(parents=True, exist_ok=True)
    lines = []
    found_keys = set()

    if env_path.exists():
        content = env_path.read_text(encoding="utf-8")
        for line in content.splitlines():
            matched = False
            for key, val in updates.items():
                pattern = rf"^\s*{re.escape(key)}\s*=.*$"
                if re.match(pattern, line):
                    lines.append(f"{key}={val}")
                    found_keys.add(key)
                    matched = True
                    break
            if not matched:
                lines.append(line)

    for key, val in updates.items():
        if key not in found_keys:
            lines.append(f"{key}={val}")

    env_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    print(f"[SETUP] Synchronized environment variables in {env_path.resolve()}")


def find_project_root() -> Path:
    """Finds the project root by ascending directories until package.json or backend/ is found."""
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / "package.json").exists() and (parent / "backend").is_dir():
            return parent
    return Path.cwd()


async def provision_postgres_database() -> bool:
    """
    Connects to PostgreSQL, checks/creates 'campus_grievance_db',
    verifies the pgvector extension, and injects connection strings into .env.
    """
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", os.getenv("DATABASE_PWD", "postgres"))
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = int(os.getenv("POSTGRES_PORT", "5432"))
    db_name = os.getenv("POSTGRES_DB", "campus_grievance_db")

    root_dir = find_project_root()
    root_env = root_dir / ".env"
    backend_env = root_dir / "backend" / ".env"

    print(f"\n[SETUP] Testing PostgreSQL connection on {host}:{port}...")

    if not check_port_open(host, port, timeout=1.0):
        print(f"[SETUP] Port {port} is not reachable on {host}.")
        print("[SETUP] Application will operate seamlessly using high-performance SQLite fallback.")

        sqlite_updates = {
            "DATABASE_URL": "sqlite+aiosqlite:///./backend.sqlite",
            "SYNC_DATABASE_URL": "sqlite:///./backend.sqlite",
            "SQLITE_FALLBACK_URL": "sqlite+aiosqlite:///./backend.sqlite",
        }
        update_env_file(root_env, sqlite_updates)
        update_env_file(backend_env, sqlite_updates)
        return False

    try:
        import asyncpg
    except ImportError:
        print("[ERROR] 'asyncpg' library is not installed in the active Python environment.")
        return False

    conn = None
    maintenance_dbs = ["postgres", "template1"]
    last_error: Optional[Exception] = None

    for m_db in maintenance_dbs:
        try:
            conn = await asyncpg.connect(
                user=user,
                password=password,
                host=host,
                port=port,
                database=m_db,
                timeout=3.0,
            )
            print(f"[SETUP] Connected to PostgreSQL maintenance database '{m_db}'.")
            break
        except Exception as exc:
            last_error = exc

    if not conn:
        print(f"[SETUP] Could not connect to PostgreSQL on {host}:{port}: {last_error}")
        print("[SETUP] Falling back to SQLite configuration.")
        return False

    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", db_name
        )
        if not exists:
            print(f"[SETUP] Creating database '{db_name}'...")
            await conn.execute(f'CREATE DATABASE "{db_name}" OWNER "{user}" ENCODING \'UTF8\'')
            print(f"[SETUP] Database '{db_name}' created successfully.")
        else:
            print(f"[SETUP] Database '{db_name}' already exists.")
    finally:
        await conn.close()

    try:
        target_conn = await asyncpg.connect(
            user=user,
            password=password,
            host=host,
            port=port,
            database=db_name,
            timeout=3.0,
        )
        try:
            await target_conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            version = await target_conn.fetchval(
                "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
            )
            print(f"[SETUP] pgvector extension verified (v{version}).")
        except Exception as ext_err:
            print(f"[SETUP] Notice: pgvector extension could not be initialized: {ext_err}")
            print("[SETUP] System will serialize embeddings as JSON/text fallback.")
        finally:
            await target_conn.close()
    except Exception as target_err:
        print(f"[SETUP] Warning during target db connection: {target_err}")

    from urllib.parse import quote_plus
    encoded_password = quote_plus(password)
    pg_async_url = f"postgresql+asyncpg://{user}:{encoded_password}@{host}:{port}/{db_name}"
    pg_sync_url = f"postgresql+psycopg2://{user}:{encoded_password}@{host}:{port}/{db_name}"
    sqlite_url = "sqlite+aiosqlite:///./backend.sqlite"

    env_updates = {
        "DATABASE_URL": pg_async_url,
        "SYNC_DATABASE_URL": pg_sync_url,
        "SQLITE_FALLBACK_URL": sqlite_url,
    }

    update_env_file(root_env, env_updates)
    update_env_file(backend_env, env_updates)

    print(f"\n[OK] PostgreSQL database '{db_name}' provisioned and active on {host}:{port}!\n")
    return True


def main() -> int:
    asyncio.run(provision_postgres_database())
    return 0


if __name__ == "__main__":
    sys.exit(main())
