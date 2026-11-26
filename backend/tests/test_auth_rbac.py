"""
backend/tests/test_auth_rbac.py
Comprehensive Authentication, RBAC, JWT Cryptographic Security, and Row-Level Access Control (RLAC) Test Suite.
Ports:
- test/challenger_m1_auth_jwt.test.ts
- test/adversarial_rlac_idor.test.ts
- test/e2e/e2e_rbac_isolation.test.ts
- test/e2e/e2e_rbac_auth.test.ts
"""

import time
import json
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.main import app
from backend.app.db.session import get_db_session
from backend.app.db.models import User, Department, Complaint
from backend.app.core.security import (
    sign_token,
    verify_token,
    hash_password,
    verify_password,
    base64url_encode,
    base64url_decode,
    DEFAULT_SECRET,
)


@pytest.fixture
def valid_jwt_payload():
    return {
        "id": "usr-test-01",
        "email": "kavin@student.campus.edu",
        "role": "student",
        "department_id": None,
        "name": "Kavin Kumar",
        "reg_no": "2023CSE042",
        "permissions": ["read:own", "write:own"],
    }


# ============================================================================
# 1. Cryptographic JWT Engine & Header Attack Surface
# ============================================================================
class TestJwtCryptographicSecurity:

    def test_jwt_valid_signing_and_verification(self, valid_jwt_payload):
        token = sign_token(valid_jwt_payload)
        assert isinstance(token, str)
        assert len(token.split(".")) == 3

        decoded = verify_token(token)
        assert decoded is not None
        assert decoded["email"] == "kavin@student.campus.edu"
        assert decoded["role"] == "student"
        assert decoded["reg_no"] == "2023CSE042"
        assert "exp" in decoded
        assert "iat" in decoded

    @pytest.mark.parametrize("alg", ["none", "None", "NONE", "nOnE"])
    def test_jwt_alg_none_rejection(self, valid_jwt_payload, alg):
        header = {"alg": alg, "typ": "JWT"}
        header_b64 = base64url_encode(json.dumps(header).encode("utf-8"))
        payload_b64 = base64url_encode(json.dumps(valid_jwt_payload).encode("utf-8"))

        # Case 1: Trailing dot (empty signature)
        token_no_sig = f"{header_b64}.{payload_b64}."
        assert verify_token(token_no_sig) is None

        # Case 2: 2 parts
        token_two_parts = f"{header_b64}.{payload_b64}"
        assert verify_token(token_two_parts) is None

        # Case 3: Bogus signature
        token_bogus_sig = f"{header_b64}.{payload_b64}.c29tZXNpZ25hdHVyZQ"
        assert verify_token(token_bogus_sig) is None

    @pytest.mark.parametrize(
        "alg",
        ["HS384", "HS512", "RS256", "RS384", "ES256", "PS256", "EdDSA", "", "plaintext"],
    )
    def test_jwt_unsupported_algorithms_rejection(self, valid_jwt_payload, alg):
        header = {"alg": alg, "typ": "JWT"}
        header_b64 = base64url_encode(json.dumps(header).encode("utf-8"))
        payload_b64 = base64url_encode(json.dumps(valid_jwt_payload).encode("utf-8"))
        fake_sig = base64url_encode(b"0" * 32)
        token = f"{header_b64}.{payload_b64}.{fake_sig}"
        assert verify_token(token) is None

    @pytest.mark.parametrize("typ", ["JWE", "REFRESH", "NOT_JWT", "jwt/v2", "TOKEN"])
    def test_jwt_header_typ_confusion_rejection(self, valid_jwt_payload, typ):
        header = {"alg": "HS256", "typ": typ}
        header_b64 = base64url_encode(json.dumps(header).encode("utf-8"))
        payload_b64 = base64url_encode(json.dumps(valid_jwt_payload).encode("utf-8"))
        token = sign_token(valid_jwt_payload)
        _, _, sig_b64 = token.split(".")
        tampered_token = f"{header_b64}.{payload_b64}.{sig_b64}"
        assert verify_token(tampered_token) is None

    def test_jwt_payload_role_tampering_rejection(self, valid_jwt_payload):
        valid_token = sign_token(valid_jwt_payload)
        header_b64, payload_b64, sig_b64 = valid_token.split(".")

        # Forged payload with role SUPER_ADMIN
        forged_payload = dict(valid_jwt_payload)
        forged_payload["role"] = "super_admin"
        forged_payload_b64 = base64url_encode(json.dumps(forged_payload).encode("utf-8"))

        tampered_token = f"{header_b64}.{forged_payload_b64}.{sig_b64}"
        assert verify_token(tampered_token) is None

    def test_jwt_signature_bit_flip_rejection(self, valid_jwt_payload):
        valid_token = sign_token(valid_jwt_payload)
        header_b64, payload_b64, sig_b64 = valid_token.split(".")
        # Mutate last signature character
        mutated_sig = sig_b64[:-1] + ("A" if sig_b64[-1] != "A" else "B")
        tampered_token = f"{header_b64}.{payload_b64}.{mutated_sig}"
        assert verify_token(tampered_token) is None

    def test_jwt_expired_token_rejection(self, valid_jwt_payload):
        expired_token = sign_token(valid_jwt_payload, expires_in_seconds=-60)
        assert verify_token(expired_token) is None


# ============================================================================
# 2. Authentication Endpoints & Universal Dev OTP 123456
# ============================================================================
class TestAuthEndpointsAndDevOtp:

    @pytest.mark.asyncio
    async def test_universal_dev_otp_verification(self, async_client: AsyncClient, m2_seeded_session: AsyncSession):
        # Universal Dev OTP 123456 must succeed for student
        payload = {"email": "kavin@student.campus.edu", "otp": "123456"}
        res = await async_client.post("/api/auth/verify-otp", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True

    @pytest.mark.asyncio
    async def test_wrong_otp_rejection(self, async_client: AsyncClient):
        payload = {"email": "kavin@student.campus.edu", "otp": "999999"}
        res = await async_client.post("/api/auth/verify-otp", json=payload)
        assert res.status_code == 400
        data = res.json()
        assert "error" in data

    @pytest.mark.asyncio
    async def test_student_login_with_valid_password(self, async_client: AsyncClient, m2_seeded_session: AsyncSession):
        payload = {"identifier": "2023CSE042", "password": "Student@123"}
        res = await async_client.post("/api/auth/login", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "token" in data
        assert data["user"]["role"].upper() == "STUDENT"

    @pytest.mark.asyncio
    async def test_department_admin_login_with_valid_password(self, async_client: AsyncClient, m2_seeded_session: AsyncSession):
        payload = {"identifier": "hostel.admin@campus.edu", "password": "Dept@123"}
        res = await async_client.post("/api/auth/admin/login", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert "token" in data
        assert data["role"] == "DEPARTMENT_ADMIN"
        assert "/admin/department/dashboard" in data["redirectUrl"]

    @pytest.mark.asyncio
    async def test_super_admin_login_with_valid_password(self, async_client: AsyncClient, m2_seeded_session: AsyncSession):
        payload = {"identifier": "admin@campus.edu", "password": "Admin@123"}
        res = await async_client.post("/api/auth/admin/login", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["role"] == "SUPER_ADMIN"
        assert data["redirectUrl"] == "/admin/dashboard"


# ============================================================================
# 3. Student Rejection on Admin Portals (HTTP 403 Forbidden)
# ============================================================================
class TestStudentAdminPortalRejection:

    @pytest.mark.asyncio
    @pytest.mark.parametrize("identifier", ["kavin@student.campus.edu", "2023CSE042", "rahul@student.campus.edu"])
    async def test_student_credentials_rejected_on_admin_login(self, async_client: AsyncClient, m2_seeded_session: AsyncSession, identifier):
        payload = {"identifier": identifier, "password": "Student@123"}
        res = await async_client.post("/api/auth/admin/login", json=payload)
        assert res.status_code == 403
        data = res.json()
        assert data["success"] is False
        assert "STUDENT accounts are not permitted" in data["error"]
        assert data.get("role") == "STUDENT"

    @pytest.mark.asyncio
    async def test_student_credentials_rejected_on_admin_login_alias(self, async_client: AsyncClient, m2_seeded_session: AsyncSession):
        payload = {"identifier": "2023CSE042", "password": "Student@123"}
        res = await async_client.post("/api/auth/admin-login", json=payload)
        assert res.status_code == 403
        data = res.json()
        assert data["success"] is False


# ============================================================================
# 4. Row-Level Access Control (RLAC) & Horizontal IDOR Prevention
# ============================================================================
class TestRowLevelAccessControlAndIdor:

    @pytest.mark.asyncio
    async def test_cross_dept_read_idor_forbidden_403(self, async_client: AsyncClient, m2_seeded_session: AsyncSession):
        # Hostel Admin token
        hostel_token = sign_token({
            "id": "user-dept-hostel",
            "email": "hostel.admin@campus.edu",
            "role": "department_admin",
            "department_id": "dept-hostel",
            "departmentId": "dept-hostel",
            "permissions": ["read:department", "write:department", "resolve:department"],
        })

        # Locate an IT ticket (assigned_department_id == 'dept-it')
        stmt = select(Complaint).where(Complaint.assigned_department_id == "dept-it")
        res = await m2_seeded_session.execute(stmt)
        it_ticket = res.scalars().first()
        assert it_ticket is not None

        # Hostel Admin tries to read IT ticket
        resp = await async_client.get(
            f"/api/complaints/{it_ticket.id}",
            headers={"Authorization": f"Bearer {hostel_token}"},
        )
        assert resp.status_code == 403
        data = resp.json()
        assert "error" in str(data) or "detail" in str(data)

    @pytest.mark.asyncio
    async def test_cross_dept_write_idor_forbidden_403(self, async_client: AsyncClient, m2_seeded_session: AsyncSession):
        hostel_token = sign_token({
            "id": "user-dept-hostel",
            "email": "hostel.admin@campus.edu",
            "role": "department_admin",
            "department_id": "dept-hostel",
            "departmentId": "dept-hostel",
            "permissions": ["read:department", "write:department", "resolve:department"],
        })

        stmt = select(Complaint).where(Complaint.assigned_department_id == "dept-it")
        res = await m2_seeded_session.execute(stmt)
        it_ticket = res.scalars().first()

        # Hostel Admin attempts to update IT ticket
        update_payload = {"status": "in_progress", "adminNotes": "Malicious cross-dept update"}
        resp = await async_client.put(
            f"/api/complaints/{it_ticket.id}",
            json=update_payload,
            headers={"Authorization": f"Bearer {hostel_token}"},
        )
        assert resp.status_code == 403

        # Verify DB ticket remains pristine
        await m2_seeded_session.refresh(it_ticket)
        assert it_ticket.admin_notes != "Malicious cross-dept update"

    @pytest.mark.asyncio
    async def test_student_horizontal_idor_read_forbidden_403(self, async_client: AsyncClient, m2_seeded_session: AsyncSession):
        student_a_token = sign_token({
            "id": "user-student-kavin",
            "email": "kavin@student.campus.edu",
            "role": "student",
            "reg_no": "2023CSE042",
            "regNo": "2023CSE042",
        })

        # Find Student B's complaint (Rahul)
        stmt = select(Complaint).where(Complaint.student_reg_no == "2022MECH088")
        res = await m2_seeded_session.execute(stmt)
        ticket_b = res.scalars().first()
        if ticket_b:
            resp = await async_client.get(
                f"/api/complaints/{ticket_b.id}",
                headers={"Authorization": f"Bearer {student_a_token}"},
            )
            assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_super_admin_unrestricted_global_access_200(self, async_client: AsyncClient, m2_seeded_session: AsyncSession):
        super_token = sign_token({
            "id": "user-super-admin",
            "email": "admin@campus.edu",
            "role": "super_admin",
            "department_id": None,
            "permissions": ["*"],
        })

        # Super Admin accesses complaints across departments
        stmt = select(Complaint).limit(5)
        res = await m2_seeded_session.execute(stmt)
        tickets = res.scalars().all()
        for t in tickets:
            resp = await async_client.get(
                f"/api/complaints/{t.id}",
                headers={"Authorization": f"Bearer {super_token}"},
            )
            assert resp.status_code == 200
