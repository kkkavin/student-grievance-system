"""
Unit and Integration Tests for Resolution SLA & Automation Analytics (VisAI Labs GTM Suite).
Tests calculations for:
- Department resolution hours vs target SLAs
- Autonomous Groq triage rate and accuracy
- Semantic deduplication volume and staff hours saved (2.5h / ticket)
- Outbound webhook 24h delivery telemetry
- Cold start resilience and zero-division safety
"""

from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.db.models import Complaint, Department, AuditLog, WebhookDeliveryLog
from backend.app.services.analytics import compute_automation_sla_metrics


@pytest.mark.asyncio
async def test_automation_sla_endpoint_v1_and_alias(async_client: AsyncClient, admin_headers: dict):
    """Verifies GET /api/v1/analytics/automation-sla and legacy /api/analytics/automation-sla."""
    r1 = await async_client.get("/api/v1/analytics/automation-sla", headers=admin_headers)
    assert r1.status_code == 200
    d1 = r1.json()
    assert "department_sla_metrics" in d1 or "departmentSlaMetrics" in d1
    assert "auto_triage_rate" in d1 or "autoTriageRate" in d1
    assert "duplicates_intercepted" in d1 or "duplicatesIntercepted" in d1
    assert "webhook_deliveries_24h" in d1 or "webhookDeliveries24h" in d1

    r2 = await async_client.get("/api/analytics/automation-sla", headers=admin_headers)
    assert r2.status_code == 200
    d2 = r2.json()
    assert "department_sla_metrics" in d2 or "departmentSlaMetrics" in d2


@pytest.mark.asyncio
async def test_department_sla_metrics_calculations(db_session: AsyncSession):
    """Tests duration calculation, compliance percentage, and breach detection."""
    now = datetime.now(timezone.utc)

    # Create test department
    dept = Department(
        id="dept-hostel",
        name="Hostel Affairs",
        code="HOSTEL",
        is_active=True,
    )

    # Create 2 resolved grievances: 1 compliant (12h < 24h), 1 breached (30h > 24h)
    g1 = Complaint(
        id="grv-sla-01",
        description="Leaking pipe in room 204",
        category="Plumbing & Water",
        assigned_department_id="dept-hostel",
        status="RESOLVED",
        created_at=now - timedelta(hours=12),
        resolved_at=now,
    )
    g2 = Complaint(
        id="grv-sla-02",
        description="Lock jammed in room 205",
        category="Hostel Maintenance",
        assigned_department_id="dept-hostel",
        status="RESOLVED",
        created_at=now - timedelta(hours=30),
        resolved_at=now,
    )

    metrics = compute_automation_sla_metrics([g1, g2], [dept], [], [])
    hostel_metric = next(
        m for m in metrics["department_sla_metrics"]
        if (m.get("department_id") == "dept-hostel" or m.get("departmentId") == "dept-hostel")
    )

    assert hostel_metric["target_sla_hours"] == 24.0
    assert hostel_metric["total_tickets"] == 2
    assert hostel_metric["resolved_tickets"] == 2
    assert hostel_metric["avg_resolution_hours"] == 21.0  # (12 + 30) / 2
    assert hostel_metric["compliance_rate"] == 50.0       # 1 of 2 compliant
    assert hostel_metric["breached_tickets"] == 1
    assert hostel_metric["status"] == "BREACHED"


def test_auto_triage_rate_calculation():
    """Tests ratio calculation when tickets are reassigned vs auto-triaged."""
    # 10 grievances, 2 reassigned in audit log
    grievances = [{"id": f"g-{i}"} for i in range(10)]
    audit_logs = [
        {"action": "REASSIGN_DEPARTMENT", "entity_id": "g-0"},
        {"action": "MANUAL_REASSIGN", "entity_id": "g-1"},
    ]

    metrics = compute_automation_sla_metrics(grievances, [], audit_logs, [])
    triage = metrics["auto_triage_rate"]

    assert triage["total_triaged"] == 10
    assert triage["manually_reassigned_count"] == 2
    assert triage["auto_triaged_count"] == 8
    assert triage["auto_triaged_pct"] == 80.0
    assert triage["accuracy_pct"] == 80.0


def test_duplicates_intercepted_hours_saved_formula():
    """Tests hours saved calculation based on total_intercepted * 2.5."""
    grievances = [
        {"id": "g-1", "intercepted_by_dedup": True, "duplicate_of_id": "parent-1", "category": "Plumbing & Water"},
        {"id": "g-2", "intercepted_by_dedup": True, "duplicate_of_id": "parent-1", "category": "Plumbing & Water"},
        {"id": "g-3", "duplicate_of_id": "parent-2", "category": "Electrical & AC"},
        {"id": "g-4", "status": "resolved"},
    ]

    metrics = compute_automation_sla_metrics(grievances, [], [], [])
    dups = metrics["duplicates_intercepted"]

    assert dups["total_count"] == 3
    assert dups["hours_saved_estimate"] == 7.5  # 3 * 2.5
    assert dups["clusters_identified"] == 2


def test_webhook_deliveries_24h_metrics():
    """Tests 24-hour log filtering and success rate."""
    now = datetime.now(timezone.utc)
    logs = [
        {"status_code": 200, "event_type": "grievance.critical", "delivered_at": now - timedelta(hours=2)},
        {"status_code": 201, "event_type": "grievance.critical", "delivered_at": now - timedelta(hours=5)},
        {"status_code": 500, "event_type": "grievance.duplicate_cluster", "delivered_at": now - timedelta(hours=10)},
        {"status_code": 200, "event_type": "grievance.critical", "delivered_at": now - timedelta(hours=36)},  # > 24h
    ]

    metrics = compute_automation_sla_metrics([], [], [], logs)
    wh = metrics["webhook_deliveries_24h"]

    assert wh["count"] == 3
    assert wh["successful_deliveries"] == 2
    assert wh["failed_deliveries"] == 1
    assert wh["success_rate_pct"] == 66.7
    assert wh["critical_alerts"] == 2
    assert wh["duplicate_clusters"] == 1


def test_cold_start_zero_division():
    """Ensures empty database state returns clean zero values without throwing ZeroDivisionError."""
    metrics = compute_automation_sla_metrics([], [], [], [])
    assert metrics["auto_triage_rate"]["total_triaged"] == 0
    assert metrics["auto_triage_rate"]["auto_triaged_pct"] == 100.0
    assert metrics["duplicates_intercepted"]["total_count"] == 0
    assert metrics["duplicates_intercepted"]["hours_saved_estimate"] == 0.0
    assert metrics["webhook_deliveries_24h"]["count"] == 0
    assert metrics["webhook_deliveries_24h"]["success_rate_pct"] == 100.0
    assert len(metrics["department_sla_metrics"]) == 10
