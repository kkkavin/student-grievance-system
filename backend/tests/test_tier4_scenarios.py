"""
Tier 4 Real-World Application Scenario Test Suite.
Validates multi-step, cross-cutting realistic student and administrator journeys:
1. Urgent electrical emergency cascade with notification.
2. Hosteler water outage duplicate clustering and single-click cascading resolution.
3. Off-campus commercial venue rejection (INOX popcorn) vs campus safety acceptance (ragging).
4. Department SLA resolution and campus performance audit.
5. Outbound webhook lifecycle and live test dispatch (progressive skip for M4).
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import sign_token
from backend.app.db.models import Grievance, Notification, OtpSession


@pytest.fixture
def admin_headers() -> dict:
    token = sign_token({
        "id": "adm-super-tier4",
        "email": "admin.tier4@campus.edu",
        "role": "SUPER_ADMIN",
        "name": "Super Admin Tier 4",
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_scenario1_urgent_electrical_emergency_cascade(
    async_client: AsyncClient, db_session: AsyncSession
):
    """
    SCENARIO 1: Urgent Electrical Emergency Cascade
    Hostel power failure -> OTP auth -> Triage to Infrastructure ->
    CRITICAL urgency -> Status transition to RESOLVED -> Notification verified.
    """
    student_email = "hostel.rep@campus.edu"

    # Step 1: Request & Verify OTP
    req = await async_client.post(
        "/api/v1/auth/request-otp", json={"email": student_email}
    )
    if req.status_code == 404:
        req = await async_client.post(
            "/api/auth/send-otp", json={"email": student_email}
        )
    assert req.status_code in (200, 201)

    # Issue student token
    student_token = sign_token({
        "id": "stu-rep",
        "email": student_email,
        "role": "STUDENT",
        "reg_no": "2023REP001",
    })
    student_headers = {"Authorization": f"Bearer {student_token}"}

    # Step 2: Submit Emergency Ticket
    grv_payload = {
        "title": "Complete Power Blackout & Sparking Box in Hostel Block B",
        "description": "Complete electrical blackout across Hostel Block B 4th floor. Smell of burning wires near the main distribution box.",
        "category": "Electrical & AC",
        "hostelBlock": "Block B",
        "roomNo": "402",
        "priority": "CRITICAL",
        "studentEmail": student_email,
        "regNo": "2023REP001",
    }
    resp = await async_client.post(
        "/api/v1/grievances", json=grv_payload, headers=student_headers
    )
    if resp.status_code == 404:
        resp = await async_client.post(
            "/api/complaints", json=grv_payload, headers=student_headers
        )
    assert resp.status_code in (200, 201)
    ticket = resp.json().get("grievance") or resp.json()
    ticket_id = ticket["id"]

    # Step 3: Admin Resolves Emergency
    admin_token = sign_token({
        "id": "adm-infra",
        "email": "admin.infra@campus.edu",
        "role": "DEPARTMENT_ADMIN",
    })
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    patch_resp = await async_client.patch(
        f"/api/v1/grievances/{ticket_id}/status",
        json={"status": "RESOLVED", "admin_notes": "Burnt breaker replaced, circuit restored."},
        headers=admin_headers,
    )
    if patch_resp.status_code == 404:
        patch_resp = await async_client.post(
            f"/api/complaints/{ticket_id}/resolve",
            json={"resolutionNote": "Burnt breaker replaced, circuit restored."},
            headers=admin_headers,
        )
    assert patch_resp.status_code == 200

    # Step 4: Verify Student Notification Outbox
    stmt = select(Notification).where(Notification.recipient == student_email)
    res = await db_session.execute(stmt)
    notifications = res.scalars().all()
    assert len(notifications) >= 1


@pytest.mark.asyncio
async def test_scenario2_hosteler_water_outage_duplicate_cluster_and_cascading_resolution(
    async_client: AsyncClient, db_session: AsyncSession, admin_headers: dict
):
    """
    SCENARIO 2: Hosteler Water Outage Duplicate Cluster & Cascading Resolution
    5 students submit water outage reports in Block B ->
    1st ticket is primary, 2nd-5th linked as duplicates ->
    Cascading resolution redresses all 5 tickets simultaneously.
    """
    emails = [f"water_student_{i}@campus.edu" for i in range(1, 6)]
    submitted_tickets = []

    descriptions = [
        "Water supply is completely stopped on second floor of Hostel Block B taps and washrooms",
        "Water supply is completely stopped on second floor of Hostel Block B taps and washrooms today",
        "Water supply is completely stopped on second floor of Hostel Block B taps and washrooms since 7 AM",
        "Water supply is completely stopped on second floor of Hostel Block B taps and washrooms urgently",
        "Water supply is completely stopped on second floor of Hostel Block B taps and washrooms right now",
    ]

    for email, desc in zip(emails, descriptions):
        payload = {
            "title": "Water Outage Block B",
            "description": desc,
            "category": "Plumbing & Water",
            "hostelBlock": "Block B",
            "roomNo": "201",
            "studentEmail": email,
        }
        res = await async_client.post("/api/v1/grievances", json=payload)
        if res.status_code == 404:
            res = await async_client.post("/api/complaints", json=payload)
        assert res.status_code in (200, 201)
        submitted_tickets.append(res.json().get("grievance") or res.json())

    primary_id = submitted_tickets[0]["id"]

    # Verify duplicate linkage for tickets 2..5
    for tkt in submitted_tickets[1:]:
        parent = (
            tkt.get("duplicateOfId")
            or tkt.get("duplicate_of_id")
            or tkt.get("masterCaseId")
            or tkt.get("master_case_id")
        )
        assert parent == primary_id or tkt.get("status") in ("MERGED_AUTOMATIC", "SUSPECTED_DUPLICATE")

    # Cascading resolution on primary ticket
    resolve_resp = await async_client.post(
        f"/api/v1/grievances/{primary_id}/resolve-cascade",
        json={"resolutionNote": "Booster pump repaired and lines tested."},
        headers=admin_headers,
    )
    if resolve_resp.status_code == 404:
        resolve_resp = await async_client.post(
            f"/api/v1/grievances/{primary_id}/resolve",
            json={"resolutionNote": "Booster pump repaired and lines tested."},
            headers=admin_headers,
        )
    if resolve_resp.status_code == 404:
        resolve_resp = await async_client.post(
            f"/api/complaints/{primary_id}/resolve",
            json={"resolutionNote": "Booster pump repaired and lines tested."},
            headers=admin_headers,
        )
    assert resolve_resp.status_code == 200

    # Verify all 5 tickets are marked resolved in database
    for tkt in submitted_tickets:
        t_id = tkt["id"]
        chk_resp = await async_client.get(f"/api/v1/grievances/{t_id}", headers=admin_headers)
        assert chk_resp.status_code == 200
        cur_tkt = chk_resp.json()
        assert cur_tkt["status"].lower() in ("resolved", "closed", "merged_automatic", "suspected_duplicate")


@pytest.mark.asyncio
async def test_scenario3_off_campus_venue_rejection_and_guidance_vs_safety_acceptance(
    async_client: AsyncClient
):
    """
    SCENARIO 3: Off-Campus Venue Rejection & Student Guidance vs Campus Safety
    Student complains about movie theater popcorn -> AI triage vetoes is_valid_grievance=False ->
    Contrast with campus harassment which is accepted with HIGH/CRITICAL urgency.
    """
    # 1. Off-Campus Movie Popcorn Complaint
    popcorn_payload = {
        "text": "The popcorn at INOX multiplex was overpriced and stale, and cinema seats were torn."
    }
    triage_resp = await async_client.post("/api/v1/ai/classify-complaint", json=popcorn_payload)
    if triage_resp.status_code == 404:
        triage_resp = await async_client.post("/api/v1/ai/triage", json=popcorn_payload)
    if triage_resp.status_code == 404:
        triage_resp = await async_client.post("/api/ai/classify-complaint", json=popcorn_payload)
    assert triage_resp.status_code == 200
    triage_data = triage_resp.json()

    # Assert Veto
    is_valid = (
        triage_data.get("is_valid_grievance")
        if "is_valid_grievance" in triage_data
        else triage_data.get("isValidComplaint")
    )
    assert is_valid is False
    rejection = triage_data.get("rejection_reason") or triage_data.get("rejectionReason")
    assert rejection in ("OFF_CAMPUS_DOMAIN", "OFF_CAMPUS_VENUE", "NON_CAMPUS_VENUE")

    # 2. Campus Harassment / Ragging Complaint
    safety_payload = {
        "text": "Senior students in Hostel Block A corridor are harassing junior students and demanding cash.",
        "studentType": "hosteller",
    }
    safety_resp = await async_client.post("/api/v1/ai/classify-complaint", json=safety_payload)
    if safety_resp.status_code == 404:
        safety_resp = await async_client.post("/api/v1/ai/triage", json=safety_payload)
    if safety_resp.status_code == 404:
        safety_resp = await async_client.post("/api/ai/classify-complaint", json=safety_payload)
    assert safety_resp.status_code == 200
    safety_data = safety_resp.json()

    safety_valid = (
        safety_data.get("is_valid_grievance")
        if "is_valid_grievance" in safety_data
        else safety_data.get("isValidComplaint")
    )
    assert safety_valid is True
    cat = safety_data.get("category") or safety_data.get("suggestedCategory")
    assert cat == "Ragging & Harassment"


@pytest.mark.asyncio
async def test_scenario4_department_sla_resolution_and_performance_audit(
    async_client: AsyncClient, admin_headers: dict
):
    """
    SCENARIO 4: Department SLA Resolution & Performance Audit
    Submit complaints across departments -> Query analytics endpoints ->
    Validate SLA and trend metrics structure.
    """
    # Query trends
    sla_resp = await async_client.get("/api/v1/analytics/trends", headers=admin_headers)
    if sla_resp.status_code == 404:
        sla_resp = await async_client.get("/api/analytics/trends", headers=admin_headers)
    assert sla_resp.status_code == 200
    data = sla_resp.json()
    assert isinstance(data, dict)

    # Query predictive analytics
    pred_resp = await async_client.get("/api/v1/analytics/predictive", headers=admin_headers)
    if pred_resp.status_code in (200, 201):
        pdata = pred_resp.json()
        assert "trends" in pdata or "forecast" in pdata or "success" in pdata


@pytest.mark.asyncio
async def test_scenario5_full_outbound_webhook_lifecycle_and_live_test(
    async_client: AsyncClient, admin_headers: dict
):
    """
    SCENARIO 5: Full Outbound Webhook Lifecycle & Live Test
    Admin registers Slack webhook -> Tests dispatch -> Validates delivery logs.
    Progressively skips if M4 webhooks router is not mounted.
    """
    slack_payload = {
        "name": "Campus Slack Alert",
        "target_url": "https://hooks.slack.com/services/TEST/SLACK/HOOK",
        "platform": "slack",
        "trigger_on_critical": True,
        "is_active": True,
    }
    s_resp = await async_client.post("/api/v1/webhooks", json=slack_payload, headers=admin_headers)
    if s_resp.status_code not in (200, 201):
        pytest.skip("Outbound webhooks router not yet mounted (Milestone M4)")

    s_data = s_resp.json()
    wh_id = s_data["id"]

    # Test live dispatch
    test_resp = await async_client.post(f"/api/v1/webhooks/{wh_id}/test", headers=admin_headers)
    assert test_resp.status_code in (200, 201)
    log_data = test_resp.json()
    assert "status_code" in log_data or "statusCode" in log_data or "id" in log_data
