"""
RFC 7519 HS256 JWT Authentication, Cryptographic Token & Password Security Utility.
Provides 100% cryptographic and claims parity with frontend authentication and API expectations.
"""

import base64
import hashlib
import hmac
import json
import time
from typing import Any, Dict, Optional
import bcrypt

try:
    from backend.app.core.config import settings
except ImportError:
    try:
        from app.core.config import settings
    except ImportError:
        from backend.config import settings

DEFAULT_SECRET = settings.jwt_secret
DEFAULT_EXPIRES_IN = settings.jwt_expiration_seconds


# ---------------------------------------------------------------------------
# Password Hashing & Verification (bcrypt)
# ---------------------------------------------------------------------------
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
    if (
        target_clean.startswith("$2a$")
        or target_clean.startswith("$2b$")
        or target_clean.startswith("$2y$")
    ):
        try:
            return bcrypt.checkpw(plain_clean.encode("utf-8"), target_clean.encode("utf-8"))
        except Exception:
            return False

    return False


# ---------------------------------------------------------------------------
# Base64URL Encoding Helpers
# ---------------------------------------------------------------------------
def base64url_encode(input_bytes: bytes) -> str:
    """Base64URL encode bytes without padding."""
    return base64.urlsafe_b64encode(input_bytes).decode("utf-8").rstrip("=")


def base64url_decode(input_str: str) -> bytes:
    """Base64URL decode string with padding added if needed."""
    rem = len(input_str) % 4
    if rem > 0:
        input_str += "=" * (4 - rem)
    return base64.urlsafe_b64decode(input_str.encode("utf-8"))


# ---------------------------------------------------------------------------
# JWT Signing & Verification (RFC 7519 HS256)
# ---------------------------------------------------------------------------
def sign_token(
    payload: Dict[str, Any],
    secret: str = DEFAULT_SECRET,
    expires_in_seconds: int = DEFAULT_EXPIRES_IN,
) -> str:
    """
    Signs a JWT payload using RFC 7519 HS256 (HMAC-SHA256).
    """
    header = {
        "alg": "HS256",
        "typ": "JWT",
    }

    now = int(time.time())
    full_payload = dict(payload)
    if "iat" not in full_payload:
        full_payload["iat"] = now
    if "exp" not in full_payload:
        full_payload["exp"] = now + expires_in_seconds
    if "iss" not in full_payload:
        full_payload["iss"] = "student-grievance-system"

    # Normalize roles
    if "role" in full_payload and isinstance(full_payload["role"], str):
        full_payload["role"] = full_payload["role"].lower()

    header_b64 = base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = base64url_encode(json.dumps(full_payload, separators=(",", ":")).encode("utf-8"))
    signature_input = f"{header_b64}.{payload_b64}".encode("utf-8")

    signature = hmac.new(secret.encode("utf-8"), signature_input, hashlib.sha256).digest()
    signature_b64 = base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def verify_token(
    token: str,
    secret: str = DEFAULT_SECRET,
) -> Optional[Dict[str, Any]]:
    """
    Verifies a JWT token using RFC 7519 HS256.
    Returns decoded payload if valid and unexpired; returns None if invalid.
    Strictly resists alg:none, algorithm confusion, typ tampering, and timing attacks.
    """
    if not token or not isinstance(token, str):
        return None

    parts = token.strip().split(".")
    if len(parts) != 3:
        return None

    header_b64, payload_b64, signature_b64 = parts
    if not header_b64 or not payload_b64 or not signature_b64:
        return None

    try:
        header_raw = base64url_decode(header_b64).decode("utf-8")
        header = json.loads(header_raw)

        # Strict algorithm and typ validation
        if header.get("alg") != "HS256":
            return None
        if "typ" in header and header["typ"] != "JWT":
            return None

        # Verify HMAC signature (RFC 7515 canonical comparison resists padding-bit malleability)
        signature_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = hmac.new(secret.encode("utf-8"), signature_input, hashlib.sha256).digest()
        expected_sig_b64 = base64url_encode(expected_sig)

        if not hmac.compare_digest(expected_sig_b64, signature_b64):
            return None

        payload_raw = base64url_decode(payload_b64).decode("utf-8")
        payload = json.loads(payload_raw)

        now = int(time.time())
        exp = payload.get("exp")
        if exp is not None and isinstance(exp, (int, float)) and exp < now:
            return None

        return payload
    except Exception:
        return None


# Aliases
sign_jwt = sign_token
verify_jwt = verify_token

__all__ = [
    "hash_password",
    "verify_password",
    "sign_token",
    "verify_token",
    "sign_jwt",
    "verify_jwt",
    "base64url_encode",
    "base64url_decode",
]
