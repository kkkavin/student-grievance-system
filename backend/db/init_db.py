"""
CLI re-export bridge for python -m backend.db.init_db.
"""
from backend.app.db.init_db import init_database, main

if __name__ == "__main__":
    main()
