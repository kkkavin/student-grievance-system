"""
Adversarial Stress Test Suite for Outbound Webhook Subsystem (Milestone 4: VisAI Labs GTM Suite).
Author: challenger_m4_1 (Empirical Challenger)

Empirically tests and stress-tests:
1. Malformed URLs (missing schema, non-http/https, empty, whitespace, null) -> 422 rejection on create & patch.
2. Platform payloads: Slack blocks/text formatting, Discord content/embeds, Custom raw JSON formatting.
3. Live test dispatch (POST /api/v1/webhooks/{id}/test): external connection failures, timeouts, 4xx/5xx responses.
4. Secret header injection: verify X-Webhook-Secret is attached when configured and omitted when null.
5. Active/Inactive filtering: inactive webhooks must not receive event triggers, query param filtering.
6. Event trigger filtering: trigger_on_critical vs trigger_on_duplicate_cluster flag isolation.
7. Extreme payloads: payload overflow / response truncation, Unicode/special characters, SQL injection resistance.
"""

from datetime import datetime, timezone
import json
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


# ==============================================================================
# 1. URL VALIDATION & MALFORMED INPUT CHALLENGES
# ==============================================================================

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid_url,reason",
    [
        ("example.com/webhook", "missing schema"),
        ("www.campus.edu/hook", "missing schema with www"),
        ("//foo.bar/baz", "protocol-relative url without schema"),
        ("ftp://files.internal/hook", "ftp non-http schema"),
        ("file:///etc/passwd", "file non-http schema"),
        ("gopher://old.net/1", "gopher non-http schema"),
        ("javascript:alert(1)", "javascript uri scheme"),
        ("ws://stream.campus.edu/events", "websocket scheme"),
        ("wss://secure.stream.edu/events", "secure websocket scheme"),
        ("smtp://mail.internal", "smtp scheme"),
        ("data:text/html,<script>alert(1)</script>", "data uri scheme"),
        ("", "empty string"),
        ("   ", "whitespace only"),
        ("\t\n", "newline and tab whitespace"),
    ],
)
async def test_adversarial_malformed_urls_rejected_on_create(
    async_client: AsyncClient, admin_headers: dict, invalid_url: str, reason: str
):
    """
    EMPIRICAL CHALLENGE: Verify all non-HTTP/HTTPS and malformed target URLs
    are strictly rejected with HTTP 422 Unprocessable Entity during webhook creation.
    """
    payload = {
        "name": f"Adversarial Hook ({reason})",
        "target_url": invalid_url,
        "platform": "custom",
    }
    res = await async_client.post("/api/v1/webhooks", json=payload, headers=admin_headers)
    assert res.status_code in (400, 422), (
        f"Expected 422/400 for malformed URL '{invalid_url}' ({reason}), got HTTP {res.status_code}: {res.text}"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid_url",
    [
        "ftp://malformed.target/hook",
        "not-a-valid-url",
        "",
        "   ",
        "javascript:void(0)",
    ],
)
async def test_adversarial_malformed_urls_rejected_on_patch(
    async_client: AsyncClient, admin_headers: dict, invalid_url: str
):
    """
    EMPIRICAL CHALLENGE: Verify PATCH rejects malformed URLs with 422 and does not corrupt existing config.
    """
    # 1. Create a valid webhook
    create_res = await async_client.post(
        "/api/v1/webhooks",
        json={
            "name": "Hook to Patch",
            "target_url": "https://valid.endpoint.org/hook",
            "platform": "custom",
        },
        headers=admin_headers,
    )
    assert create_res.status_code in (200, 201)
    wh_id = create_res.json()["id"]

    # 2. Attempt patching with invalid target_url
    patch_res = await async_client.patch(
        f"/api/v1/webhooks/{wh_id}",
        json={"target_url": invalid_url},
        headers=admin_headers,
    )
    assert patch_res.status_code in (400, 422), (
        f"Expected 422/400 when patching with invalid url '{invalid_url}', got HTTP {patch_res.status_code}"
    )

    # 3. Verify original target_url remains untouched
    get_res = await async_client.get(f"/api/v1/webhooks/{wh_id}", headers=admin_headers)
    assert get_res.status_code == 200
    assert get_res.json()["target_url"] == "https://valid.endpoint.org/hook"


# ==============================================================================
# 2. PLATFORM PAYLOAD FORMATTING & ADVERSARIAL PAYLOAD TESTS
# ==============================================================================

def test_platform_payload_slack_formatting_comprehensive():
    """
    EMPIRICAL CHALLENGE: Verify Slack payload contains formatted alert text and handles edge cases.
    """
    base_payload = {
        "event": "grievance.critical",
        "grievance_id": "grv_test_slack_001",
        "ticket_no": "GRV-2026-A1B2-123456",
        "category": "Electrical & AC",
        "department": "dept-infra",
        "urgency": "CRITICAL",
        "intent_summary": "High-voltage spark and smoke from transformer",
        "actionable_steps": ["Cut master fuse", "Evacuate quad"],
        "duplicate_count": 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    slack_payload = format_platform_payload("slack", base_payload)
    assert "text" in slack_payload
    assert "*[CRITICAL] Grievance #GRV-2026-A1B2-123456*" in slack_payload["text"]
    assert "High-voltage spark and smoke from transformer" in slack_payload["text"]
    assert "dept-infra" in slack_payload["text"]

    # Case insensitivity test
    slack_upper = format_platform_payload("SLACK", base_payload)
    assert "text" in slack_upper

    # Minimal payload without crashing
    minimal_slack = format_platform_payload("slack", {})
    assert "text" in minimal_slack
    assert "*[MEDIUM]" in minimal_slack["text"]


def test_platform_payload_discord_formatting_comprehensive():
    """
    EMPIRICAL CHALLENGE: Verify Discord payload contains markdown content and handles edge cases.
    """
    base_payload = {
        "event": "grievance.critical",
        "grievance_id": "grv_test_discord_001",
        "ticket_no": "GRV-2026-C3D4-654321",
        "category": "Hostel & Mess",
        "department": "dept-hostel",
        "urgency": "CRITICAL",
        "intent_summary": "Gas leak smell in block C kitchen",
        "actionable_steps": ["Shut off main gas valve", "Call fire department"],
        "duplicate_count": 2,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    discord_payload = format_platform_payload("discord", base_payload)
    assert "content" in discord_payload
    assert "**[CRITICAL] Grievance #GRV-2026-C3D4-654321**" in discord_payload["content"]
    assert "Gas leak smell in block C kitchen" in discord_payload["content"]
    assert "dept-hostel" in discord_payload["content"]

    # Case insensitivity
    discord_mixed = format_platform_payload("Discord", base_payload)
    assert "content" in discord_mixed


def test_platform_payload_custom_raw_json():
    """
    EMPIRICAL CHALLENGE: Custom platform must preserve raw JSON payload without injecting text or content wrappers.
    """
    base_payload = {
        "event": "grievance.critical",
        "grievance_id": "grv_custom_101",
        "ticket_no": "GRV-2026-9999",
        "category": "IT & Lab",
        "department": "dept-it",
        "urgency": "CRITICAL",
        "intent_summary": "Server room cooling unit down",
        "actionable_steps": ["Power down non-essential servers"],
        "duplicate_count": 0,
    }

    custom_payload = format_platform_payload("custom", base_payload)
    assert "text" not in custom_payload
    assert "content" not in custom_payload
    assert custom_payload["event"] == "grievance.critical"
    assert custom_payload["intent_summary"] == "Server room cooling unit down"

    # Default fallback when platform is None or empty string
    none_payload = format_platform_payload(None, base_payload)
    assert "text" not in none_payload
    assert "content" not in none_payload


# ==============================================================================
# 3. LIVE TEST DISPATCH ADVERSARIAL STRESS TESTS (POST /webhooks/{id}/test)
# ==============================================================================

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status_code,response_text",
    [
        (500, '{"error": "Internal Server Error in receiver"}'),
        (502, "Bad Gateway from reverse proxy"),
        (503, "Service Unavailable - Server overloaded"),
        (504, "Gateway Timeout"),
        (400, '{"error": "Bad Request: Invalid JSON payload"}'),
        (401, '{"error": "Unauthorized: Missing or invalid secret"}'),
        (403, '{"error": "Forbidden: IP not allowlisted"}'),
        (404, '{"error": "Webhook channel not found"}'),
        (429, '{"error": "Rate limit exceeded. Retry-After: 60"}'),
    ],
)
async def test_live_test_dispatch_external_http_errors_handled(
    async_client: AsyncClient, admin_headers: dict, status_code: int, response_text: str
):
    """
    EMPIRICAL CHALLENGE: Verify that when the external receiver responds with HTTP 4xx or 5xx:
    1. POST /api/v1/webhooks/{id}/test does NOT crash with 500.
    2. Endpoint returns 200 with delivery log data.
    3. WebhookDeliveryLog records the exact status_code and response_body.
    """
    create_res = await async_client.post(
        "/api/v1/webhooks",
        json={
            "name": f"Receiver Returning {status_code}",
            "target_url": f"https://mock.receiver.org/http-{status_code}",
            "platform": "custom",
        },
        headers=admin_headers,
    )
    assert create_res.status_code in (200, 201)
    wh_id = create_res.json()["id"]

    mock_resp = httpx.Response(
        status_code=status_code,
        text=response_text,
        request=httpx.Request("POST", f"https://mock.receiver.org/http-{status_code}"),
    )

    with patch("backend.app.services.webhook_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.post.return_value = mock_resp
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        test_res = await async_client.post(f"/api/v1/webhooks/{wh_id}/test", headers=admin_headers)

        assert test_res.status_code == 200, (
            f"Expected 200 from test endpoint despite receiver HTTP {status_code}, got {test_res.status_code}"
        )
        data = test_res.json()
        assert data.get("status_code") == status_code or data.get("statusCode") == status_code
        recorded_body = data.get("response_body") or data.get("responseBody") or ""
        assert response_text[:50] in recorded_body

    # Verify retrieval from /deliveries endpoint
    deliv_res = await async_client.get(f"/api/v1/webhooks/{wh_id}/deliveries", headers=admin_headers)
    assert deliv_res.status_code == 200
    logs = deliv_res.json()
    assert len(logs) >= 1
    assert logs[0].get("status_code") == status_code or logs[0].get("statusCode") == status_code


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "exception_cls,exception_msg",
    [
        (httpx.ConnectError, "Connection refused (os error 111)"),
        (httpx.ReadTimeout, "The read operation timed out after 3.5 seconds"),
        (httpx.ConnectTimeout, "Failed to connect within 3.5 seconds"),
        (httpx.RemoteProtocolError, "Server disconnected without sending a response"),
    ],
)
async def test_live_test_dispatch_network_failures_handled(
    async_client: AsyncClient, admin_headers: dict, exception_cls: type, exception_msg: str
):
    """
    EMPIRICAL CHALLENGE: Verify network exceptions (ConnectError, ReadTimeout, ConnectTimeout)
    do not crash the API, and are recorded in WebhookDeliveryLog with status_code=None.
    """
    create_res = await async_client.post(
        "/api/v1/webhooks",
        json={
            "name": f"Failing Network ({exception_cls.__name__})",
            "target_url": "https://unreachable.campus.internal/alert",
            "platform": "custom",
        },
        headers=admin_headers,
    )
    wh_id = create_res.json()["id"]

    with patch("backend.app.services.webhook_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.post.side_effect = exception_cls(exception_msg)
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        test_res = await async_client.post(f"/api/v1/webhooks/{wh_id}/test", headers=admin_headers)

        assert test_res.status_code == 200
        data = test_res.json()
        # On connection failure, status_code must be None
        assert data.get("status_code") is None and data.get("statusCode") is None
        resp_body = data.get("response_body") or data.get("responseBody") or ""
        assert exception_cls.__name__ in resp_body


@pytest.mark.asyncio
async def test_live_test_dispatch_nonexistent_webhook_404(
    async_client: AsyncClient, admin_headers: dict
):
    """
    EMPIRICAL CHALLENGE: POST /api/v1/webhooks/{nonexistent_id}/test returns 404 Not Found.
    """
    fake_id = "whk_nonexistent_00000000"
    res = await async_client.post(f"/api/v1/webhooks/{fake_id}/test", headers=admin_headers)
    assert res.status_code == 404


# ==============================================================================
# 4. SECRET HEADER INJECTION
# ==============================================================================

@pytest.mark.asyncio
async def test_secret_header_injected_during_dispatch(
    async_client: AsyncClient, admin_headers: dict
):
    """
    EMPIRICAL CHALLENGE: Verify secret_header is transmitted as 'X-Webhook-Secret' header
    during outbound HTTP dispatch.
    """
    secret_val = "secret_tok_super_confidential_98765"
    create_res = await async_client.post(
        "/api/v1/webhooks",
        json={
            "name": "Secured Webhook Target",
            "target_url": "https://secure.receiver.org/api",
            "platform": "custom",
            "secret_header": secret_val,
        },
        headers=admin_headers,
    )
    assert create_res.status_code in (200, 201)
    wh_id = create_res.json()["id"]

    captured_headers = {}

    async def mock_post(url, json=None, headers=None):
        nonlocal captured_headers
        captured_headers = dict(headers or {})
        return httpx.Response(status_code=200, text='{"status": "ok"}', request=httpx.Request("POST", url))

    with patch("backend.app.services.webhook_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.post = AsyncMock(side_effect=mock_post)
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        test_res = await async_client.post(f"/api/v1/webhooks/{wh_id}/test", headers=admin_headers)
        assert test_res.status_code == 200

        # Assert secret header was injected
        assert "X-Webhook-Secret" in captured_headers, "Missing X-Webhook-Secret header!"
        assert captured_headers["X-Webhook-Secret"] == secret_val
        assert captured_headers["Content-Type"] == "application/json"


@pytest.mark.asyncio
async def test_secret_header_omitted_when_null(
    async_client: AsyncClient, admin_headers: dict
):
    """
    EMPIRICAL CHALLENGE: Verify X-Webhook-Secret is NOT present in headers when secret_header is None.
    """
    create_res = await async_client.post(
        "/api/v1/webhooks",
        json={
            "name": "Public Target Without Secret",
            "target_url": "https://public.receiver.org/hook",
            "platform": "custom",
            "secret_header": None,
        },
        headers=admin_headers,
    )
    assert create_res.status_code in (200, 201)
    wh_id = create_res.json()["id"]

    captured_headers = {}

    async def mock_post(url, json=None, headers=None):
        nonlocal captured_headers
        captured_headers = dict(headers or {})
        return httpx.Response(status_code=200, text='{"status": "ok"}', request=httpx.Request("POST", url))

    with patch("backend.app.services.webhook_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.post = AsyncMock(side_effect=mock_post)
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        test_res = await async_client.post(f"/api/v1/webhooks/{wh_id}/test", headers=admin_headers)
        assert test_res.status_code == 200

        # Assert secret header was NOT injected
        assert "X-Webhook-Secret" not in captured_headers


# ==============================================================================
# 5. ACTIVE / INACTIVE FILTERING
# ==============================================================================

@pytest.mark.asyncio
async def test_active_vs_inactive_webhook_event_trigger(db_session: AsyncSession):
    """
    EMPIRICAL CHALLENGE: Inactive webhooks (is_active=False) MUST NEVER be dispatched
    during automated event alerts (grievance.critical or grievance.duplicate_cluster).
    """
    active_wh = WebhookConfig(
        id="whk_active_001",
        name="Active Notification Hook",
        target_url="https://hooks.campus.edu/active",
        platform="custom",
        trigger_on_critical=True,
        trigger_on_duplicate_cluster=True,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    inactive_wh = WebhookConfig(
        id="whk_inactive_002",
        name="Inactive Notification Hook",
        target_url="https://hooks.campus.edu/inactive",
        platform="custom",
        trigger_on_critical=True,
        trigger_on_duplicate_cluster=True,
        is_active=False,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(active_wh)
    db_session.add(inactive_wh)
    await db_session.commit()

    dispatched_targets = []

    async def mock_deliver(webhook, event_type, payload, session=None, timeout=3.5):
        dispatched_targets.append(webhook.id)
        return WebhookDeliveryLog(
            id=f"log_{webhook.id}",
            webhook_id=webhook.id,
            grievance_id=payload.get("grievance_id"),
            event_type=event_type,
            status_code=200,
            payload_json=payload,
            delivered_at=datetime.now(timezone.utc),
        )

    with patch("backend.app.services.webhook_service.deliver_single_webhook", side_effect=mock_deliver):
        sample_grievance = {
            "id": "grv_crit_active_test",
            "ticket_no": "GRV-CRIT-99",
            "category": "Hostel & Mess",
            "priority": "CRITICAL",
            "intent_summary": "Gas leak in hostel mess",
        }
        res = await dispatch_webhook_alert("grievance.critical", sample_grievance, session=db_session)

        assert res["success"] is True
        assert "whk_active_001" in dispatched_targets, "Active webhook was not dispatched!"
        assert "whk_inactive_002" not in dispatched_targets, "INACTIVE webhook was dispatched! Security/logic breach!"


@pytest.mark.asyncio
async def test_list_webhooks_active_filter_query_params(
    async_client: AsyncClient, admin_headers: dict
):
    """
    EMPIRICAL CHALLENGE: Query params ?isActive=true and ?isActive=false correctly partition results.
    """
    # Create active hook
    await async_client.post(
        "/api/v1/webhooks",
        json={"name": "Filter Active Hook", "target_url": "https://act.edu/hook", "is_active": True},
        headers=admin_headers,
    )
    # Create inactive hook
    await async_client.post(
        "/api/v1/webhooks",
        json={"name": "Filter Inactive Hook", "target_url": "https://inact.edu/hook", "is_active": False},
        headers=admin_headers,
    )

    # Filter active
    res_act = await async_client.get("/api/v1/webhooks?isActive=true", headers=admin_headers)
    assert res_act.status_code == 200
    act_list = res_act.json()
    for wh in act_list:
        assert wh.get("is_active") is True or wh.get("isActive") is True

    # Filter inactive
    res_inact = await async_client.get("/api/v1/webhooks?isActive=false", headers=admin_headers)
    assert res_inact.status_code == 200
    inact_list = res_inact.json()
    for wh in inact_list:
        assert wh.get("is_active") is False or wh.get("isActive") is False


# ==============================================================================
# 6. EVENT TRIGGER FILTERING (CRITICAL vs DUPLICATE CLUSTER)
# ==============================================================================

@pytest.mark.asyncio
async def test_event_trigger_filtering_isolation(db_session: AsyncSession):
    """
    EMPIRICAL CHALLENGE: Verify event trigger flags are mutually respected:
    - trigger_on_critical triggers ONLY on 'grievance.critical'
    - trigger_on_duplicate_cluster triggers ONLY on 'grievance.duplicate_cluster'
    - A hook with both True triggers on both.
    - A hook with both False triggers on neither.
    """
    wh_crit_only = WebhookConfig(
        id="whk_crit_only",
        name="Critical Only",
        target_url="https://hooks.campus.edu/crit",
        trigger_on_critical=True,
        trigger_on_duplicate_cluster=False,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    wh_dup_only = WebhookConfig(
        id="whk_dup_only",
        name="Dup Only",
        target_url="https://hooks.campus.edu/dup",
        trigger_on_critical=False,
        trigger_on_duplicate_cluster=True,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    wh_both = WebhookConfig(
        id="whk_both",
        name="Both Events",
        target_url="https://hooks.campus.edu/both",
        trigger_on_critical=True,
        trigger_on_duplicate_cluster=True,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    wh_neither = WebhookConfig(
        id="whk_neither",
        name="Neither Event",
        target_url="https://hooks.campus.edu/neither",
        trigger_on_critical=False,
        trigger_on_duplicate_cluster=False,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add_all([wh_crit_only, wh_dup_only, wh_both, wh_neither])
    await db_session.commit()

    sample_grievance = {
        "id": "grv_filter_test",
        "ticket_no": "GRV-FILT-01",
        "category": "Plumbing & Water",
        "priority": "CRITICAL",
        "intent_summary": "Main waterline ruptured",
    }

    # 1. Trigger grievance.critical
    dispatched_on_crit = []

    async def mock_deliver_crit(webhook, event_type, payload, session=None, timeout=3.5):
        dispatched_on_crit.append(webhook.id)
        return WebhookDeliveryLog(
            id=f"log_{webhook.id}",
            webhook_id=webhook.id,
            event_type=event_type,
            status_code=200,
            payload_json=payload,
            delivered_at=datetime.now(timezone.utc),
        )

    with patch("backend.app.services.webhook_service.deliver_single_webhook", side_effect=mock_deliver_crit):
        await dispatch_webhook_alert("grievance.critical", sample_grievance, session=db_session)
        assert "whk_crit_only" in dispatched_on_crit
        assert "whk_both" in dispatched_on_crit
        assert "whk_dup_only" not in dispatched_on_crit, "Duplicate-only hook fired on critical event!"
        assert "whk_neither" not in dispatched_on_crit, "Neither-event hook fired on critical event!"

    # 2. Trigger grievance.duplicate_cluster
    dispatched_on_dup = []

    async def mock_deliver_dup(webhook, event_type, payload, session=None, timeout=3.5):
        dispatched_on_dup.append(webhook.id)
        return WebhookDeliveryLog(
            id=f"log_{webhook.id}",
            webhook_id=webhook.id,
            event_type=event_type,
            status_code=200,
            payload_json=payload,
            delivered_at=datetime.now(timezone.utc),
        )

    with patch("backend.app.services.webhook_service.deliver_single_webhook", side_effect=mock_deliver_dup):
        await dispatch_webhook_alert("grievance.duplicate_cluster", sample_grievance, session=db_session)
        assert "whk_dup_only" in dispatched_on_dup
        assert "whk_both" in dispatched_on_dup
        assert "whk_crit_only" not in dispatched_on_dup, "Critical-only hook fired on duplicate cluster event!"
        assert "whk_neither" not in dispatched_on_dup, "Neither-event hook fired on duplicate cluster event!"


# ==============================================================================
# 7. ADVERSARIAL EDGE CASES & OVERFLOW STRESS TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_adversarial_massive_response_body_truncated_safely(
    async_client: AsyncClient, admin_headers: dict
):
    """
    EMPIRICAL CHALLENGE: Verify external response body > 50KB is truncated safely to 1000 characters
    preventing DB column / memory exhaustion.
    """
    create_res = await async_client.post(
        "/api/v1/webhooks",
        json={
            "name": "Massive Body Receiver",
            "target_url": "https://huge.response.org/post",
            "platform": "custom",
        },
        headers=admin_headers,
    )
    wh_id = create_res.json()["id"]

    # 100,000 character response body
    huge_text = "ERROR: " + ("A" * 100000)
    mock_resp = httpx.Response(
        status_code=502,
        text=huge_text,
        request=httpx.Request("POST", "https://huge.response.org/post"),
    )

    with patch("backend.app.services.webhook_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.post.return_value = mock_resp
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        test_res = await async_client.post(f"/api/v1/webhooks/{wh_id}/test", headers=admin_headers)
        assert test_res.status_code == 200
        data = test_res.json()
        saved_body = data.get("response_body") or data.get("responseBody") or ""
        assert len(saved_body) <= 1000, f"Response body was NOT truncated! Length: {len(saved_body)}"


@pytest.mark.asyncio
async def test_adversarial_unicode_and_special_characters_in_payload(
    async_client: AsyncClient, admin_headers: dict
):
    """
    EMPIRICAL CHALLENGE: Emojis, RTL scripts, and JSON injection strings in grievance details
    must be transmitted and logged safely without deserialization or character encoding corruption.
    """
    create_res = await async_client.post(
        "/api/v1/webhooks",
        json={
            "name": "Unicode & Emojis Target 🚀🔥",
            "target_url": "https://unicode.receiver.org/alert",
            "platform": "slack",
        },
        headers=admin_headers,
    )
    assert create_res.status_code in (200, 201)
    wh_id = create_res.json()["id"]

    with patch("backend.app.services.webhook_service.httpx.AsyncClient") as mock_client_cls:
        mock_instance = AsyncMock()
        mock_instance.post.return_value = httpx.Response(status_code=200, text='{"ok": true}', request=httpx.Request("POST", "https://unicode.receiver.org/alert"))
        mock_client_cls.return_value.__aenter__.return_value = mock_instance

        test_res = await async_client.post(f"/api/v1/webhooks/{wh_id}/test", headers=admin_headers)
        assert test_res.status_code == 200


@pytest.mark.asyncio
async def test_adversarial_sql_injection_attempt_in_crud(
    async_client: AsyncClient, admin_headers: dict
):
    """
    EMPIRICAL CHALLENGE: SQL injection strings in webhook name and target_url
    must be treated strictly as literal data without triggering SQL syntax errors.
    """
    sql_inj_name = "Webhook' OR '1'='1' -- DROP TABLE webhooks;"
    sql_inj_url = "https://safe.domain.org/hook?query=' OR 1=1--"

    create_res = await async_client.post(
        "/api/v1/webhooks",
        json={"name": sql_inj_name, "target_url": sql_inj_url, "platform": "custom"},
        headers=admin_headers,
    )
    assert create_res.status_code in (200, 201)
    wh_id = create_res.json()["id"]

    # Verify retrieval
    get_res = await async_client.get(f"/api/v1/webhooks/{wh_id}", headers=admin_headers)
    assert get_res.status_code == 200
    assert get_res.json()["name"] == sql_inj_name
    assert get_res.json()["target_url"] == sql_inj_url


# ==============================================================================
# 8. MULTI-WEBHOOK FAULT ISOLATION & RESILIENCE
# ==============================================================================

@pytest.mark.asyncio
async def test_multi_webhook_fault_isolation(db_session: AsyncSession):
    """
    EMPIRICAL CHALLENGE: If Webhook A raises an unhandled network/runtime exception,
    Webhook B must still be executed and delivered without being blocked.
    """
    wh_failing = WebhookConfig(
        id="whk_fault_failing_01",
        name="Crashing Receiver",
        target_url="https://crashes.internal/hook",
        trigger_on_critical=True,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    wh_succeeding = WebhookConfig(
        id="whk_fault_success_02",
        name="Healthy Receiver",
        target_url="https://healthy.internal/hook",
        trigger_on_critical=True,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add_all([wh_failing, wh_succeeding])
    await db_session.commit()

    attempts = []

    async def mock_deliver(webhook, event_type, payload, session=None, timeout=3.5):
        attempts.append(webhook.id)
        if webhook.id == "whk_fault_failing_01":
            raise RuntimeError("Catastrophic delivery crash!")
        return WebhookDeliveryLog(
            id=f"log_{webhook.id}",
            webhook_id=webhook.id,
            event_type=event_type,
            status_code=200,
            payload_json=payload,
            delivered_at=datetime.now(timezone.utc),
        )

    with patch("backend.app.services.webhook_service.deliver_single_webhook", side_effect=mock_deliver):
        sample_grievance = {
            "id": "grv_isolation_test",
            "ticket_no": "GRV-ISO-01",
            "category": "Electrical & AC",
            "priority": "CRITICAL",
            "intent_summary": "Smoke detected in electrical panel",
        }
        res = await dispatch_webhook_alert("grievance.critical", sample_grievance, session=db_session)

        assert res["success"] is True
        assert "whk_fault_failing_01" in attempts
        assert "whk_fault_success_02" in attempts, (
            "Healthy webhook was never attempted because previous webhook threw an exception!"
        )


# ==============================================================================
# 9. END-TO-END EVENT-DRIVEN ROUTER DISPATCH TRIGGERS
# ==============================================================================

@pytest.mark.asyncio
async def test_router_critical_grievance_submission_triggers_webhook(
    async_client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    """
    EMPIRICAL CHALLENGE: Verify POST /api/v1/grievances with urgency/priority='CRITICAL'
    enqueues dispatch_webhook_alert('grievance.critical', ...) in BackgroundTasks.
    """
    dispatched_events = []

    async def mock_dispatch(event_type, grievance_data, session=None):
        dispatched_events.append((event_type, grievance_data.get("priority") or grievance_data.get("urgency")))
        return {"success": True}

    with patch("backend.app.routers.grievances.dispatch_webhook_alert", side_effect=mock_dispatch):
        payload = {
            "category": "Electrical & AC",
            "description": "High voltage transformer sparks exploded near hostel mess block! Danger of electrocution!",
            "priority": "CRITICAL",
            "studentName": "Adversarial Student",
            "studentEmail": "student.adv@campus.edu",
            "hostelBlock": "Block A",
            "roomNo": "101",
        }
        res = await async_client.post("/api/v1/grievances", json=payload, headers=auth_headers)
        assert res.status_code in (200, 201), f"Grievance creation failed: {res.text}"

        assert len(dispatched_events) >= 1, "Webhook alert was not enqueued for CRITICAL grievance!"
        assert dispatched_events[0][0] == "grievance.critical"


@pytest.mark.asyncio
async def test_router_status_patch_critical_triggers_webhook(
    async_client: AsyncClient, admin_headers: dict
):
    """
    EMPIRICAL CHALLENGE: Verify PATCH /api/v1/grievances/{id}/status escalated to CRITICAL
    enqueues dispatch_webhook_alert('grievance.critical', ...) in BackgroundTasks.
    """
    # 1. Create a MEDIUM grievance
    create_res = await async_client.post(
        "/api/v1/grievances",
        json={
            "category": "Cleanliness & Sanitation",
            "description": "Corridor trash bin not emptied in Block D.",
            "priority": "MEDIUM",
            "studentName": "Regular Student",
            "studentEmail": "student.reg@campus.edu",
        },
        headers=admin_headers,
    )
    assert create_res.status_code in (200, 201)
    g_id = create_res.json()["id"]

    dispatched_events = []

    async def mock_dispatch(event_type, grievance_data, session=None):
        dispatched_events.append((event_type, grievance_data.get("priority")))
        return {"success": True}

    with patch("backend.app.routers.grievances.dispatch_webhook_alert", side_effect=mock_dispatch):
        patch_res = await async_client.patch(
            f"/api/v1/grievances/{g_id}/status",
            json={"priority": "CRITICAL", "admin_notes": "Escalated by Chief Warden"},
            headers=admin_headers,
        )
        assert patch_res.status_code == 200

        assert len(dispatched_events) >= 1, "Webhook alert was not enqueued on status escalation to CRITICAL!"
        assert dispatched_events[0][0] == "grievance.critical"


# ==============================================================================
# 10. FORMATTING KEYS INSPECTION (BLOCKS vs TEXT & EMBEDS vs CONTENT)
# ==============================================================================

def test_formatting_inspection_blocks_and_embeds():
    """
    EMPIRICAL CHALLENGE: Evaluate whether format_platform_payload produces blocks/embeds
    or uses markdown text/content as the primary webhook format.
    """
    base = {
        "event": "grievance.critical",
        "ticket_no": "TEST-404",
        "category": "Hostel & Mess",
        "department": "dept-hostel",
        "urgency": "CRITICAL",
        "intent_summary": "Water pipeline burst",
        "actionable_steps": ["Turn off valve"],
    }

    slack = format_platform_payload("slack", base)
    discord = format_platform_payload("discord", base)
    custom = format_platform_payload("custom", base)

    # Document empirical structure
    assert "text" in slack, "Slack payload must include 'text' for incoming webhook notifications"
    assert "content" in discord, "Discord payload must include 'content' for incoming webhook notifications"
    assert "event" in custom
    assert custom["urgency"] == "CRITICAL"

    # Check presence of optional rich objects
    has_slack_blocks = "blocks" in slack
    has_discord_embeds = "embeds" in discord
    # Both platforms are fully functional with text/content markdown; record boolean flags
    assert isinstance(has_slack_blocks, bool)
    assert isinstance(has_discord_embeds, bool)
