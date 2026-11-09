"""
CLI re-export bridge for python -m backend.db.setup_postgres.
"""
from backend.app.db.setup_postgres import (
    provision_postgres_database,
    check_port_open,
    update_env_file,
    find_project_root,
    main,
)

if __name__ == "__main__":
    main()
