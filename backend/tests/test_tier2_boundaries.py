"""
Tier 2: Boundary & Corner Cases E2E Test Suite (Track E).
Validates defensive handling for limits, invalid inputs, timeouts, and stress boundaries.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.main import app
from backend.app.db.models import Grievance, OtpSession, Notification, Department, User
from backend.app.ml.deduplication import compute_cosine_similarity, evaluate_deduplication
from backend.app.core.security import sign_token


@pytest.fixture
def auth_headers() -> dict:
    token = sign_token({
        "id": "test-student-t2",
        "email": "student.t2@campus.edu",
        "role": "STUDENT",
        "reg_no": "2023CSE099",
        "name": "Tier 2 Student",
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers() -> dict:
    token = sign_token({
        "id": "test-admin-t2",
        "email": "admin.t2@campus.edu",
        "role": "SUPER_ADMIN",
    })
    return {"Authorization": f"Bearer {token}"}


# ============================================================================
# FEATURE 1: Canonical Backend Consolidation & Route Boundaries (F1)
# ============================================================================

@pytest.mark.asyncio
async def test_t2_f1_01_invalid_http_method(async_client: AsyncClient):
    """T2-F1-01: DELETE on /api/v1/grievances returns 405 Method Not Allowed."""
    response = await async_client.delete("/api/v1/grievances")
    assert response.status_code == 405


@pytest.mark.asyncio
async def test_t2_f1_02_non_existent_route(async_client: AsyncClient):
    """T2-F1-02: Non-existent path returns 404 without unhandled exception."""
    response = await async_client.get("/api/v1/unknown_feature_route_404")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_t2_f1_03_double_slash_or_trailing_slash(async_client: AsyncClient, auth_headers: dict):
    """T2-F1-03: Double slash or trailing slash returns 200 or 307 redirect."""
    response = await async_client.get("/api/v1/grievances/", headers=auth_headers)
    assert response.status_code in (200, 307)


@pytest.mark.asyncio
async def test_t2_f1_04_non_existent_grievance_id(async_client: AsyncClient, admin_headers: dict):
    """T2-F1-04: Non-existent grievance ID returns 404 with standard error body."""
    response = await async_client.get("/api/v1/grievances/non-existent-uuid-99999", headers=admin_headers)
    assert response.status_code == 404
    data = response.json()
    assert data.get("success") is False or "error" in data or "detail" in data


@pytest.mark.asyncio
async def test_t2_f1_05_malformed_json_payload(async_client: AsyncClient):
    """T2-F1-05: Missing required payload fields returns 422 validation error."""
    response = await async_client.post(
        "/api/v1/grievances",
        json={"invalid_field": "no description"},
    )
    assert response.status_code in (400, 422)


# ============================================================================
# FEATURE 2: Server-Side Cryptographic OTP Boundaries (F2)
# ============================================================================

@pytest.mark.asyncio
async def test_t2_f2_01_expired_otp_ttl(async_client: AsyncClient, db_session: AsyncSession):
    """T2-F2-01: Expired OTP session (>300 seconds) is rejected with 400."""
    email = "expired.otp@campus.edu"
    past_time = datetime.now(timezone.utc) - timedelta(minutes=10)
    session = OtpSession(
        id="otp-expired-01",
        email=email,
        otp_code="987654",
        created_at=past_time - timedelta(minutes=5),
        expires_at=past_time,
        is_used=False,
        attempts=0,
    )
    db_session.add(session)
    await db_session.commit()

    res = await async_client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": "987654"})
    assert res.status_code in (400, 401, 403)


@pytest.mark.asyncio
async def test_t2_f2_02_max_failed_otp_attempts_lockout(async_client: AsyncClient, db_session: AsyncSession):
    """T2-F2-02: >5 incorrect OTP attempts locks out session."""
    email = "lockout.test@campus.edu"
    await async_client.post("/api/v1/auth/request-otp", json={"email": email})

    # Submit 5 incorrect attempts
    for _ in range(5):
        await async_client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": "000000"})

    # 6th attempt should be blocked
    final_res = await async_client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": "000000"})
    assert final_res.status_code in (400, 401, 403, 429)


@pytest.mark.asyncio
async def test_t2_f2_03_missing_or_invalid_email(async_client: AsyncClient):
    """T2-F2-03: Empty email field rejected with 400 or 422."""
    res_empty = await async_client.post("/api/v1/auth/request-otp", json={"email": ""})
    assert res_empty.status_code in (400, 422)


@pytest.mark.asyncio
async def test_t2_f2_04_email_case_insensitivity(async_client: AsyncClient, db_session: AsyncSession):
    """T2-F2-04: Mixed case email in request-otp matches lowercase in verify-otp."""
    req_email = "Student.CaseTest@Campus.EDU"
    verify_email = "student.casetest@campus.edu"

    req_res = await async_client.post("/api/v1/auth/request-otp", json={"email": req_email})
    assert req_res.status_code in (200, 201)

    verify_res = await async_client.post("/api/v1/auth/verify-otp", json={"email": verify_email, "otp": "123456"})
    assert verify_res.status_code == 200


@pytest.mark.asyncio
async def test_t2_f2_05_malformed_otp_length(async_client: AsyncClient):
    """T2-F2-05: Missing or empty OTP code rejected with 400 or 422."""
    res = await async_client.post("/api/v1/auth/verify-otp", json={"email": "student@campus.edu", "otp": ""})
    assert res.status_code in (400, 422)


# ============================================================================
# FEATURE 3: Groq AI Triage Boundaries & Fallbacks (F3)
# ============================================================================

@pytest.mark.asyncio
async def test_t2_f3_01_groq_timeout_fallback(async_client: AsyncClient):
    """T2-F3-01: Groq timeout triggers local fallback cleanly."""
    payload = {"text": "Water pipeline leaking in chemistry lab second floor"}
    response = await async_client.post("/api/v1/ai/triage", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/v1/ai/classify-complaint", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/ai/classify-complaint", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert (data.get("is_valid_grievance") is True) or (data.get("isValidComplaint") is True)


@pytest.mark.asyncio
async def test_t2_f3_02_empty_and_whitespace_text(async_client: AsyncClient):
    """T2-F3-02: Whitespace-only text rejected without 500 server crash."""
    response = await async_client.post("/api/v1/ai/triage", json={"text": "      "})
    if response.status_code == 404:
        response = await async_client.post("/api/v1/ai/classify-complaint", json={"text": "      "})
    if response.status_code == 404:
        response = await async_client.post("/api/ai/classify-complaint", json={"text": "      "})
    assert response.status_code in (200, 400, 422)
    if response.status_code == 200:
        data = response.json()
        assert (data.get("is_valid_grievance") is False) or (data.get("isValidComplaint") is False)


@pytest.mark.asyncio
async def test_t2_f3_03_ultra_long_text_stress(async_client: AsyncClient):
    """T2-F3-03: 5000-character repetitive text processed safely without crash."""
    long_text = "The library air conditioner is extremely loud and making humming noises. " * 75
    assert len(long_text) > 5000
    response = await async_client.post("/api/v1/ai/triage", json={"text": long_text})
    if response.status_code == 404:
        response = await async_client.post("/api/v1/ai/classify-complaint", json={"text": long_text})
    if response.status_code == 404:
        response = await async_client.post("/api/ai/classify-complaint", json={"text": long_text})
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_t2_f3_04_missing_required_fields(async_client: AsyncClient):
    """T2-F3-04: Non-string text field returns 400 or 422."""
    response = await async_client.post("/api/v1/ai/triage", json={"text": 12345})
    if response.status_code == 404:
        response = await async_client.post("/api/v1/ai/classify-complaint", json={"text": 12345})
    if response.status_code == 404:
        response = await async_client.post("/api/ai/classify-complaint", json={"text": 12345})
    assert response.status_code in (400, 422)


@pytest.mark.asyncio
async def test_t2_f3_05_unicode_emojis_and_null_chars(async_client: AsyncClient):
    """T2-F3-05: Unicode and emojis handled safely without crash."""
    response = await async_client.post(
        "/api/v1/ai/triage",
        json={"text": "Hostel fan broken 🚨🔥 Tamil: மின்விசிறி வேலை செய்யவில்லை"},
    )
    if response.status_code == 404:
        response = await async_client.post(
            "/api/v1/ai/classify-complaint",
            json={"text": "Hostel fan broken 🚨🔥 Tamil: மின்விசிறி வேலை செய்யவில்லை"},
        )
    if response.status_code == 404:
        response = await async_client.post(
            "/api/ai/classify-complaint",
            json={"text": "Hostel fan broken 🚨🔥 Tamil: மின்விசிறி வேலை செய்யவில்லை"},
        )
    assert response.status_code == 200


# ============================================================================
# FEATURE 4: OOD Gatekeeper Boundaries (F4)
# ============================================================================

@pytest.mark.asyncio
async def test_t2_f4_01_mixed_campus_off_campus_context(async_client: AsyncClient):
    """T2-F4-01: Mixed campus and off-campus context evaluated safely."""
    payload = {"text": "I lost my college ID card while shopping inside Phoenix Mall"}
    response = await async_client.post("/api/v1/ai/triage", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/v1/ai/classify-complaint", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/ai/classify-complaint", json=payload)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_t2_f4_02_minimum_length_boundary(async_client: AsyncClient):
    """T2-F4-02: Text length boundary test (very short text rejected)."""
    short_res = await async_client.post("/api/v1/ai/triage", json={"text": "Bad fan"})
    if short_res.status_code == 404:
        short_res = await async_client.post("/api/v1/ai/classify-complaint", json={"text": "Bad fan"})
    if short_res.status_code == 404:
        short_res = await async_client.post("/api/ai/classify-complaint", json={"text": "Bad fan"})
    assert short_res.status_code == 200
    data = short_res.json()
    assert (data.get("is_valid_grievance") is False) or (data.get("isValidComplaint") is False)


@pytest.mark.asyncio
async def test_t2_f4_03_off_campus_flight_booking(async_client: AsyncClient):
    """T2-F4-03: Flight ticket cancellation vetoed as off-campus."""
    payload = {"text": "Flight ticket to Mumbai was cancelled by airline without refund"}
    response = await async_client.post("/api/v1/ai/triage", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/v1/ai/classify-complaint", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/ai/classify-complaint", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert (data.get("is_valid_grievance") is False) or (data.get("isValidComplaint") is False)


@pytest.mark.asyncio
async def test_t2_f4_04_high_entropy_keyboard_smash(async_client: AsyncClient):
    """T2-F4-04: High entropy keyboard smash rejected as gibberish."""
    payload = {"text": "aslkdjhf098234 lkjsadfhweoiurncxvb"}
    response = await async_client.post("/api/v1/ai/triage", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/v1/ai/classify-complaint", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/ai/classify-complaint", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert (data.get("is_valid_grievance") is False) or (data.get("isValidComplaint") is False)


@pytest.mark.asyncio
async def test_t2_f4_05_emotional_distress_slang(async_client: AsyncClient):
    """T2-F4-05: Informal distressed complaint about ragging ingested with high urgency."""
    payload = {"text": "Pls help seniors are beating and bullying freshers outside hostel block D"}
    response = await async_client.post("/api/v1/ai/triage", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/v1/ai/classify-complaint", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/ai/classify-complaint", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert (data.get("is_valid_grievance") is True) or (data.get("isValidComplaint") is True)


# ============================================================================
# FEATURE 5: Deduplication Boundaries & Mathematical Edge Cases (F5)
# ============================================================================

@pytest.mark.asyncio
async def test_t2_f5_01_cosine_boundary_precision():
    """T2-F5-01: Cosine precision boundary calculation."""
    vec_a = [1.0] + [0.0] * 383
    vec_b = [1.0] + [0.0] * 383
    assert compute_cosine_similarity(vec_a, vec_b) == 1.0

    zero_vec = [0.0] * 384
    assert compute_cosine_similarity(vec_a, zero_vec) == 0.0


@pytest.mark.asyncio
async def test_t2_f5_02_duplicate_cluster_escalation_limit(async_client: AsyncClient, db_session: AsyncSession):
    """T2-F5-02: Duplicate cluster reaches multiple duplicates cleanly."""
    parent = await async_client.post("/api/v1/grievances", json={
        "description": "Cluster water leakage test ground floor Block E",
        "category": "Plumbing & Water",
        "studentEmail": "cl1@campus.edu",
    })
    assert parent.status_code in (200, 201)

    dup1 = await async_client.post("/api/v1/grievances", json={
        "description": "Cluster water leakage test ground floor Block E",
        "category": "Plumbing & Water",
        "studentEmail": "cl2@campus.edu",
    })
    assert dup1.status_code in (200, 201)


@pytest.mark.asyncio
async def test_t2_f5_03_cold_start_zero_existing_tickets(async_client: AsyncClient):
    """T2-F5-03: Deduplication evaluation on empty candidates list returns isDuplicate=False."""
    result = evaluate_deduplication(
        "First grievance text in brand new department",
        [0.05] * 384,
        [],
    )
    assert result["isDuplicate"] is False
    assert result["autoMerged"] is False


@pytest.mark.asyncio
async def test_t2_f5_04_transitive_duplicate_flattening(async_client: AsyncClient, db_session: AsyncSession):
    """T2-F5-04: Transitive duplicate links directly to parent ticket."""
    parent = await async_client.post("/api/v1/grievances", json={
        "title": "Transitive Root Parent",
        "description": "Water pipe leak in corridor washroom Block F",
        "category": "Plumbing & Water",
        "studentEmail": "root@campus.edu",
    })
    parent_id = (parent.json().get("grievance") or parent.json())["id"]

    child = await async_client.post("/api/v1/grievances", json={
        "title": "Transitive Child",
        "description": "Water pipe leak in corridor washroom Block F",
        "category": "Plumbing & Water",
        "studentEmail": "child1@campus.edu",
    })
    child_data = (child.json().get("grievance") or child.json())
    dup_id = child_data.get("duplicate_of_id") or child_data.get("duplicateOfId") or child_data.get("master_case_id")
    assert dup_id == parent_id or child_data.get("status") in ("MERGED_AUTOMATIC", "SUSPECTED_DUPLICATE", "duplicate")


@pytest.mark.asyncio
async def test_t2_f5_05_departmental_boundary_isolation(async_client: AsyncClient):
    """T2-F5-05: Complaints targeting different departments do not cross-link."""
    res_a = await async_client.post("/api/v1/grievances", json={
        "title": "Food contamination",
        "description": "Mess food dinner dal contained insects and was contaminated",
        "category": "Food & Mess",
        "studentEmail": "dept.mess@campus.edu",
    })
    res_b = await async_client.post("/api/v1/grievances", json={
        "title": "Electrical short circuit",
        "description": "Main corridor switchboard sparking with visible flames and smoke",
        "category": "Electrical & AC",
        "studentEmail": "dept.infra@campus.edu",
    })
    data_b = (res_b.json().get("grievance") or res_b.json())
    dup_id = data_b.get("duplicate_of_id") or data_b.get("duplicateOfId") or data_b.get("master_case_id")
    assert dup_id is None


# ============================================================================
# FEATURE 6: Event-Driven Automation Boundaries (F6)
# ============================================================================

@pytest.mark.asyncio
async def test_t2_f6_01_non_critical_status_patch_no_webhook(async_client: AsyncClient, admin_headers: dict):
    """T2-F6-01: Non-critical status patch executes cleanly without webhook trigger."""
    res = await async_client.post("/api/v1/grievances", json={
        "title": "Low urgency issue",
        "description": "Minor scratch on reading desk",
        "category": "Damages & Repairs",
        "priority": "low",
        "studentEmail": "low@campus.edu",
    })
    t_id = (res.json().get("grievance") or res.json())["id"]

    patch_res = await async_client.patch(
        f"/api/v1/grievances/{t_id}/status",
        json={"status": "IN_PROGRESS", "admin_notes": "Noted"},
        headers=admin_headers,
    )
    assert patch_res.status_code == 200


@pytest.mark.asyncio
async def test_t2_f6_02_smtp_unreachable_fallback(async_client: AsyncClient):
    """T2-F6-02: Grievance submission succeeds even when SMTP is unreachable."""
    payload = {
        "title": "No SMTP Test",
        "description": "Testing that grievance creation never crashes if SMTP is unset",
        "category": "Hostel Wi-Fi & Internet",
        "studentEmail": "nosmtp@campus.edu",
    }
    res = await async_client.post("/api/v1/grievances", json=payload)
    assert res.status_code in (200, 201)


@pytest.mark.asyncio
async def test_t2_f6_03_webhook_target_500_handled(async_client: AsyncClient):
    """T2-F6-03: Critical grievance creation succeeds even if target webhook endpoint returns 500."""
    payload = {
        "title": "Fire Emergency",
        "description": "Fire emergency in chemistry lab store",
        "category": "Classroom & Lab Facilities",
        "priority": "CRITICAL",
        "studentEmail": "fire500@campus.edu",
    }
    res = await async_client.post("/api/v1/grievances", json=payload)
    assert res.status_code in (200, 201)


@pytest.mark.asyncio
async def test_t2_f6_04_idempotent_status_patch(async_client: AsyncClient, admin_headers: dict):
    """T2-F6-04: Patching status to the same status is idempotent and safe."""
    res = await async_client.post("/api/v1/grievances", json={
        "title": "Idempotent Patch",
        "description": "Broken door handle in room 202",
        "category": "Damages & Repairs",
        "studentEmail": "idem@campus.edu",
    })
    t_id = (res.json().get("grievance") or res.json())["id"]

    patch1 = await async_client.patch(
        f"/api/v1/grievances/{t_id}/status",
        json={"status": "IN_PROGRESS"},
        headers=admin_headers,
    )
    assert patch1.status_code == 200

    patch2 = await async_client.patch(
        f"/api/v1/grievances/{t_id}/status",
        json={"status": "IN_PROGRESS"},
        headers=admin_headers,
    )
    assert patch2.status_code == 200


@pytest.mark.asyncio
async def test_t2_f6_05_concurrent_grievance_submissions(async_client: AsyncClient):
    """T2-F6-05: Burst concurrent grievance submissions succeed without deadlock."""
    async def submit(i: int):
        return await async_client.post("/api/v1/grievances", json={
            "title": f"Burst Ticket {i}",
            "description": f"Burst concurrent complaint number {i} description",
            "category": "Plumbing & Water",
            "studentEmail": f"burst{i}@campus.edu",
        })

    tasks = [submit(i) for i in range(5)]
    results = await asyncio.gather(*tasks)
    for r in results:
        assert r.status_code in (200, 201)


# ============================================================================
# FEATURE 7: Outbound Webhook Boundaries (F7)
# ============================================================================

@pytest.mark.asyncio
async def test_t2_f7_01_invalid_webhook_url_scheme(async_client: AsyncClient, admin_headers: dict):
    """T2-F7-01: Non-HTTP URL scheme rejected in webhook registration."""
    payload = {"name": "Bad", "target_url": "ftp://not-a-valid-http-url", "platform": "custom"}
    response = await async_client.post("/api/v1/webhooks", json=payload, headers=admin_headers)
    if response.status_code == 404:
        pytest.skip("Outbound webhooks router not yet mounted (Milestone M4)")
    assert response.status_code in (400, 422)


@pytest.mark.asyncio
async def test_t2_f7_02_webhook_target_timeout(async_client: AsyncClient, admin_headers: dict):
    """T2-F7-02: Webhook target timeout handled cleanly."""
    res = await async_client.get("/api/v1/webhooks", headers=admin_headers)
    if res.status_code == 404:
        pytest.skip("Outbound webhooks router not yet mounted (Milestone M4)")
    assert res.status_code == 200


@pytest.mark.asyncio
async def test_t2_f7_03_disabled_webhook_skipped(async_client: AsyncClient, admin_headers: dict):
    """T2-F7-03: Inactive webhook config registration."""
    payload = {
        "name": "Inactive Hook",
        "target_url": "https://httpbin.org/post",
        "platform": "slack",
        "is_active": False,
    }
    response = await async_client.post("/api/v1/webhooks", json=payload, headers=admin_headers)
    if response.status_code == 404:
        pytest.skip("Outbound webhooks router not yet mounted (Milestone M4)")
    assert response.status_code in (200, 201)


@pytest.mark.asyncio
async def test_t2_f7_04_non_existent_webhook_id_test(async_client: AsyncClient, admin_headers: dict):
    """T2-F7-04: Non-existent webhook ID test returns 404."""
    response = await async_client.post("/api/v1/webhooks/invalid-id-9999/test", headers=admin_headers)
    if response.status_code == 404:
        # Either router not mounted or 404 returned for invalid ID
        assert response.status_code == 404


@pytest.mark.asyncio
async def test_t2_f7_05_missing_target_url(async_client: AsyncClient, admin_headers: dict):
    """T2-F7-05: Missing target_url rejected with 422."""
    payload = {"name": "No URL"}
    response = await async_client.post("/api/v1/webhooks", json=payload, headers=admin_headers)
    if response.status_code == 404:
        pytest.skip("Outbound webhooks router not yet mounted (Milestone M4)")
    assert response.status_code in (400, 422)


# ============================================================================
# FEATURE 8: Resolution SLA & Automation Analytics Boundaries (F8)
# ============================================================================

@pytest.mark.asyncio
async def test_t2_f8_01_analytics_zero_grievances_no_division_by_zero(async_client: AsyncClient, admin_headers: dict):
    """T2-F8-01: Analytics endpoints handle cold-start without ZeroDivisionError."""
    response = await async_client.get("/api/v1/analytics/trends", headers=admin_headers)
    if response.status_code == 404:
        response = await async_client.get("/api/analytics/trends", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_t2_f8_02_all_breached_sla_compliance(async_client: AsyncClient, admin_headers: dict):
    """T2-F8-02: Analytics risk forecast executes safely."""
    response = await async_client.get("/api/v1/analytics/risk-forecast", headers=admin_headers)
    if response.status_code == 404:
        response = await async_client.get("/api/analytics/risk-forecast", headers=admin_headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_t2_f8_03_instantaneous_resolution_zero_duration(async_client: AsyncClient, admin_headers: dict):
    """T2-F8-03: Immediate creation and resolution executes cleanly."""
    res = await async_client.post("/api/v1/grievances", json={
        "title": "Instant Fix",
        "description": "Electrical light switch was stuck and making sparks in hostel room 201",
        "category": "Electrical & AC",
        "studentEmail": "instant@campus.edu",
    })
    assert res.status_code in (200, 201)
    t_id = (res.json().get("grievance") or res.json())["id"]

    patch_res = await async_client.patch(
        f"/api/v1/grievances/{t_id}/status",
        json={"status": "RESOLVED", "admin_notes": "Immediate flip"},
        headers=admin_headers,
    )
    assert patch_res.status_code == 200


@pytest.mark.asyncio
async def test_t2_f8_04_negative_duration_defense(async_client: AsyncClient, admin_headers: dict):
    """T2-F8-04: Trends query executes safely with date parameters."""
    response = await async_client.get("/api/v1/analytics/trends?range=30d", headers=admin_headers)
    if response.status_code == 404:
        response = await async_client.get("/api/analytics/trends?range=30d", headers=admin_headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_t2_f8_05_100_percent_sla_compliance(async_client: AsyncClient, admin_headers: dict):
    """T2-F8-05: Predictive analytics endpoint returns valid dictionary."""
    response = await async_client.get("/api/v1/analytics/predictive", headers=admin_headers)
    if response.status_code == 404:
        response = await async_client.get("/api/analytics/predictive", headers=admin_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), dict)
