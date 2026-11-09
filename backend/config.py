"""
Re-export bridge for backend.config -> backend.app.core.config.
Maintains 100% backward compatibility for existing modules and routes.
"""
from backend.app.core.config import Settings, get_settings, settings

__all__ = [
    "Settings",
    "get_settings",
    "settings",
]
