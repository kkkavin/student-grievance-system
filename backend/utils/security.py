"""
Password hashing and verification utilities.
Supports bcrypt with fallback to plain equality comparison for legacy and test environments.
"""

import bcrypt


def hash_password(password: str) -> str:
    """Hashes a password with bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_or_plain: str) -> bool:
    """
    Verifies a password against a hash or plain string.
    Returns True if valid, False otherwise.
    """
    if not plain_password or not hashed_or_plain:
        return False

    plain_clean = plain_password.strip()
    target_clean = hashed_or_plain.strip()

    # Plain text match check
    if plain_clean == target_clean:
        return True

    # Bcrypt verification
    if target_clean.startswith("$2a$") or target_clean.startswith("$2b$") or target_clean.startswith("$2y$"):
        try:
            return bcrypt.checkpw(plain_clean.encode("utf-8"), target_clean.encode("utf-8"))
        except Exception:
            return False

    return False
