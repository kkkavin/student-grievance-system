"""
Unit and Integration Test Suite for Outbound Webhooks (VisAI Labs GTM Suite).
Tests registration, validation, dispatching, platform formatting,
delivery telemetry, and event-driven automation.
"""

from datetime import datetime, timezone
from unittest.mock import patch, AsyncMock
import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.db.models import WebhookConfig, WebhookDeliveryLog
from backend.app.services.webhook_service import (
    dispatch_webhook_alert,
    deliver_single_webhook,
    format_platform_payload,
)


@pytest.mark.asyncio
async def test_webhook_registration_and_alias(
    async_client: AsyncClient, db_session: AsyncSession, admin_headers: dict
):
    """Verifies webhook registration via both /api/v1/webhooks and /api/webhooks alias."""
    payload = {
        "name": "DevOps Slack Channel",
        "target_url": "https://hooks.slack.com/services/T1/B1/X1",
        "platform": "slack",
        "trigger_on_critical": True,
        "trigger_on_duplicate_cluster": True,
    }

    # Primary endpoint
    res1 = await async_client.post("/api/v1/webhooks", json=payload, headers=admin_headers)
    assert res1.status_code in (200, 201)
    data1 = res1.json()
    assert "id" in data1
    assert data1["name"] == "DevOps Slack Channel"
    assert data1["platform"] == "slack"

    # Alias endpoint
    payload2 = {
        "name": "DevOps Discord Channel",
        "target_url": "https://discord.com/api/webhooks/123/xyz",
        "platform": "discord",
    }
    res2 = await async_client.post("/api/webhooks", json=payload2, headers=admin_headers)
    assert res2.status_code in (200, 201)
    data2 = res2.json()
    assert "id" in data2
    assert data2["platform"] == "discord"


@pytest.mark.asyncio
async def test_webhook_url_validation(async_client: AsyncClient, admin_headers: dict):
    """Verifies invalid or non-HTTP schemes are rejected with 422."""
    bad_payload = {
        "name": "Bad Scheme",
        "target_url": "ftp://files.internal/hook",
        "platform": "custom",
    }
    res = await async_client.post("/api/v1/webhooks", json=bad_payload, headers=admin_headers)
    assert res.status_code in (400, 422)


@pytest.mark.asyncio
async def test_webhook_crud_lifecycle(async_client: AsyncClient, admin_headers: dict):
    """Tests GET, PATCH, and DELETE operations on a webhook config."""
    # 1. Create
    create_res = await async_client.post("/api/v1/webhooks", json={
        "name": "Lifecycle Hook",
        "target_url": "https://httpbin.org/post",
        "platform": "custom",
        "is_active": True,
    }, headers=admin_headers)
    assert create_res.status_code in (200, 201)
    wh_id = create_res.json()["id"]

    # 2. Get by ID
    get_res = await async_client.get(f"/api/v1/webhooks/{wh_id}", headers=admin_headers)
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Lifecycle Hook"

    # 3. Patch
    patch_res = await async_client.patch(f"/api/v1/webhooks/{wh_id}", json={
        "name": "Updated Lifecycle Hook",
        "is_active": False,
    }, headers=admin_headers)
    assert patch_res.status_code == 200
    assert patch_res.json()["name"] == "Updated Lifecycle Hook"
    assert patch_res.json()["is_active"] is False

    # 4. Delete
    del_res = await async_client.delete(f"/api/v1/webhooks/{wh_id}", headers=admin_headers)
    assert del_res.status_code == 200

    # 5. Confirm 404
    get_after = await async_client.get(f"/api/v1/webhooks/{wh_id}", headers=admin_headers)
    assert get_after.status_code == 404


@pytest.mark.asyncio
async def test_webhook_test_alert_dispatch_mocked(
    async_client: AsyncClient, db_session: AsyncSession, admin_headers: dict
):
    """Verifies POST /api/v1/webhooks/{id}/test dispatches payload and commits delivery log."""
    wh_res = await async_client.post("/api/v1/webhooks", json={
        "name": "Test Alert Target",
        "target_url": "https://httpbin.org/post",
        "platform": "custom",
    }, headers=admin_headers)
    assert wh_res.status_code in (200, 201)
    wh_id = wh_res.json()["id"]

    mock_resp = httpx.Response(
        status_code=200,
        text='{"delivered": true}',
        request=httpx.Request("POST", "https://httpbin.org/post")
    )

    with patch("backend.app.services.webhook_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.post.return_value = mock_resp
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        test_res = await async_client.post(f"/api/v1/webhooks/{wh_id}/test", headers=admin_headers)

        assert test_res.status_code in (200, 201)
        data = test_res.json()
        assert data.get("status_code") == 200 or data.get("statusCode") == 200
        assert data.get("webhook_id") == wh_id or data.get("webhookId") == wh_id
        mock_instance.post.assert_called_once()

    # Query deliveries
    deliv_res = await async_client.get(f"/api/v1/webhooks/{wh_id}/deliveries", headers=admin_headers)
    assert deliv_res.status_code == 200
    logs = deliv_res.json()
    assert len(logs) >= 1


@pytest.mark.asyncio
async def test_webhook_test_dispatch_network_error_handled(
    async_client: AsyncClient, admin_headers: dict
):
    """Verifies network connection error is caught safely without returning 500."""
    wh_res = await async_client.post("/api/v1/webhooks", json={
        "name": "Failing Target",
        "target_url": "https://unreachable.host.internal/post",
        "platform": "custom",
    }, headers=admin_headers)
    wh_id = wh_res.json()["id"]

    with patch("backend.app.services.webhook_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.post.side_effect = httpx.ConnectError("Connection refused by peer")
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        test_res = await async_client.post(f"/api/v1/webhooks/{wh_id}/test", headers=admin_headers)

        assert test_res.status_code in (200, 201)
        data = test_res.json()
        assert data.get("status_code") is None or data.get("statusCode") is None
        resp_body = data.get("response_body") or data.get("responseBody") or ""
        assert "ConnectError" in resp_body


def test_platform_payload_formatting():
    """Verifies platform-specific transformations for Slack and Discord."""
    base = {
        "event": "grievance.critical",
        "ticket_no": "TICK-901",
        "category": "Electrical & AC",
        "department": "dept-infra",
        "urgency": "CRITICAL",
        "intent_summary": "Sub-station sparking vigorously",
    }

    slack_payload = format_platform_payload("slack", base)
    assert "text" in slack_payload
    assert "*[CRITICAL] Grievance #TICK-901*" in slack_payload["text"]

    discord_payload = format_platform_payload("discord", base)
    assert "content" in discord_payload
    assert "**[CRITICAL] Grievance #TICK-901**" in discord_payload["content"]

    custom_payload = format_platform_payload("custom", base)
    assert "text" not in custom_payload
    assert "content" not in custom_payload
    assert custom_payload["urgency"] == "CRITICAL"


@pytest.mark.asyncio
async def test_dispatch_webhook_alert_service_integration(db_session: AsyncSession):
    """Tests dispatch_webhook_alert querying active webhooks and logging deliveries."""
    hook = WebhookConfig(
        id="whk_srv_001",
        name="Service Test Hook",
        target_url="https://hooks.campus.internal/alert",
        platform="custom",
        trigger_on_critical=True,
        trigger_on_duplicate_cluster=True,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(hook)
    await db_session.commit()

    sample_grievance = {
        "id": "grv_test_99",
        "ticket_no": "TICK-999",
        "category": "Plumbing & Water",
        "priority": "CRITICAL",
        "intent_summary": "Major pipeline fracture in hostel quad",
        "actionable_steps": ["Shut off valve", "Dispatch plumbing team"],
    }

    mock_resp = httpx.Response(status_code=202, text="Accepted", request=httpx.Request("POST", hook.target_url))

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        summary = await dispatch_webhook_alert("grievance.critical", sample_grievance, session=db_session)

        assert summary["success"] is True
        assert summary["event_type"] == "grievance.critical"
        assert len(summary["deliveries"]) >= 1
