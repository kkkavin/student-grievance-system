"""Compatibility entrypoint shim forwarding to canonical backend.app.main."""
from backend.app.main import app

__all__ = ["app"]
