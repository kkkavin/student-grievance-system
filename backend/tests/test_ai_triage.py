"""
Unit and Integration Tests for Groq AI Triage Agent and Deterministic Fallback.
Tests:
- Strict Pydantic v2 TriageResult schema compliance
- Deterministic 3-stage local heuristic fallback
- <0.5ms latency SLA
- Off-campus venue domain veto (cinemas, malls, food delivery apps, flights)
- Interpersonal safety ingestion (ragging, bullying, harassment, blackmail, extortion)
- Intent summary and actionable steps generation
- Mock Groq API integration and seamless fallback on missing/invalid key or timeout
- Endpoint verification: POST /api/v1/ai/triage, POST /api/ai/triage, POST /triage
- Backward compatibility: POST /api/v1/ai/classify-complaint
"""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import AsyncClient

from backend.app.schemas.ai import TriageRequest, TriageResult
from backend.app.ml.classifier import (
    local_heuristic_fallback,
    classify_with_groq,
    ComplaintClassifier,
    ACTIONABLE_STEPS_BY_CATEGORY,
)


# ============================================================================
# 1. SCHEMA TESTS
# ============================================================================

def test_triage_result_schema_strictness():
    """Verify TriageResult enforces strict types and dual snake_case / camelCase access."""
    result = TriageResult(
        is_valid_grievance=True,
        rejection_reason=None,
        category="Plumbing & Water",
        department_id="dept-infra",
        urgency="CRITICAL",
        confidence=0.95,
        intent_summary="Student reports plumbing concern: Pipe burst in bathroom.",
        actionable_steps=[
            "Dispatch plumbing technician to inspect water line.",
            "Isolate supply valve if continuous leakage is detected.",
        ],
    )

    # Snake-case field access
    assert result.is_valid_grievance is True
    assert result.rejection_reason is None
    assert result.category == "Plumbing & Water"
    assert result.department_id == "dept-infra"
    assert result.urgency == "CRITICAL"
    assert result.confidence == 0.95
    assert "Pipe burst" in result.intent_summary
    assert len(result.actionable_steps) == 2

    # Camel-case alias access
    assert result.isValidGrievance is True
    assert result.rejectionReason is None
    assert result.departmentId == "dept-infra"
    assert result.intentSummary == result.intent_summary
    assert result.actionableSteps == result.actionable_steps

    # Serialized dump contains both naming conventions
    dump = result.model_dump()
    assert dump["is_valid_grievance"] is True
    assert dump["isValidGrievance"] is True
    assert dump["department_id"] == "dept-infra"
    assert dump["departmentId"] == "dept-infra"


def test_triage_request_alias_support():
    """Verify TriageRequest accepts both student_type and studentType."""
    req1 = TriageRequest(text="Broken fan", studentType="HOSTELER")
    assert req1.student_type == "HOSTELER"

    req2 = TriageRequest(text="Broken fan", student_type="DAY_SCHOLAR")
    assert req2.student_type == "DAY_SCHOLAR"


# ============================================================================
# 2. LOCAL HEURISTIC FALLBACK UNIT TESTS
# ============================================================================

class TestLocalHeuristicFallback:
    """Test suite for deterministic 3-stage local heuristic fallback."""

    def test_sub_half_millisecond_latency_sla(self):
        """Verify local_heuristic_fallback executes under 0.5ms SLA."""
        sample_text = "Severe pipeline leakage flooding 2nd floor bathroom in Block B room 210"

        # Warmup
        for _ in range(50):
            local_heuristic_fallback(sample_text)

        durations = []
        for _ in range(1000):
            t0 = time.perf_counter()
            local_heuristic_fallback(sample_text)
            durations.append((time.perf_counter() - t0) * 1000.0)  # ms

        durations.sort()
        p95 = durations[int(len(durations) * 0.95)]
        avg = sum(durations) / len(durations)

        assert p95 < 2.0, f"P95 latency {p95:.2f}ms exceeded SLA"
        assert avg < 0.5, f"Average latency {avg:.3f}ms exceeded 0.5ms threshold"

    @pytest.mark.parametrize(
        "venue_text",
        [
            "There is no seat in the cinema theatre hall",
            "Movie ticket at PVR inox was cancelled with no refund",
            "Shopping at Zara store in the city mall was crowded",
            "Swiggy food delivery partner arrived late and dropped the order",
            "Zomato delivery agent was rude and food was missing items",
            "Indigo flight was delayed at airport runway for four hours",
            "PlayStation PS5 joystick broke while playing games in my private flat",
            "Bitcoin crypto price fell 20% on the online cryptocurrency exchange",
        ],
    )
    def test_off_campus_venues_strictly_rejected(self, venue_text):
        """Confirm off-campus non-academic venues receive is_valid_grievance=False."""
        res = local_heuristic_fallback(venue_text)
        assert isinstance(res, TriageResult)
        assert res.is_valid_grievance is False
        assert res.isValidGrievance is False
        assert res.rejection_reason == "OFF_CAMPUS_DOMAIN"
        assert res.category == "Others"
        assert res.urgency == "LOW"
        assert len(res.actionable_steps) >= 1

    @pytest.mark.parametrize(
        "safety_text",
        [
            "Seniors are ragging and humiliating me every evening in hostel corridor",
            "A group of senior students is mocking and bullying me daily",
            "Senior boys are blackmailing me and spreading private pictures",
            "Senior students are extorting money and threatening physical violence",
            "Someone is cyberbullying me in the student WhatsApp group with nasty slurs",
            "Facing caste discrimination and verbal slurs during department lab sessions",
            "Anti-ragging emergency: seniors locked door and forcing me to do personal chores",
        ],
    )
    def test_campus_safety_and_harassment_ingested_as_critical(self, safety_text):
        """Confirm interpersonal abuse and welfare concerns are always valid and CRITICAL."""
        res = local_heuristic_fallback(safety_text)
        assert isinstance(res, TriageResult)
        assert res.is_valid_grievance is True
        assert res.rejection_reason is None
        assert res.category == "Ragging & Harassment"
        assert res.urgency == "CRITICAL"
        assert res.confidence >= 0.75
        assert len(res.actionable_steps) >= 2
        assert any("Anti-Ragging" in s or "counseling" in s or "safety" in s for s in res.actionable_steps)

    @pytest.mark.parametrize(
        "text,expected_category,expected_urgency",
        [
            ("Bathroom pipeline burst in Block A flooding entire corridor", "Plumbing & Water", "CRITICAL"),
            ("Ceiling fan sparking and electrical burning smell in room 302", "Electrical & AC", "CRITICAL"),
            ("Hostel Wi-Fi access point in Block C 3rd floor is offline", "Hostel Wi-Fi & Internet", "MEDIUM"),
            ("Dinner mess food dal contained live insects and worms", "Food & Mess", "HIGH"),
            ("Hostel room wooden door lock is broken and won't latch", "Damages & Repairs", "MEDIUM"),
            ("College bus number 12 broke down on highway morning route", "Bus & Transport", "MEDIUM"),
            ("Computer science lab 3 monitor flickering and keyboard keys stuck", "Classroom & Lab Facilities", "MEDIUM"),
            ("Tuition fee receipt not generated after online payment on portal", "Administrative & Fees", "MEDIUM"),
        ],
    )
    def test_category_and_urgency_mapping(self, text, expected_category, expected_urgency):
        """Verify accurate multi-category routing and urgency elevation."""
        res = local_heuristic_fallback(text)
        assert res.is_valid_grievance is True
        assert res.category == expected_category
        assert res.urgency in (expected_urgency, "CRITICAL", "HIGH")
        assert len(res.actionable_steps) == 3
        assert len(res.intent_summary) > 10


# ============================================================================
# 3. GROQ INTEGRATION & FALLBACK TESTS
# ============================================================================

@pytest.mark.asyncio
async def test_classify_with_groq_missing_key_fallback():
    """Missing key triggers local_heuristic_fallback cleanly."""
    res = await classify_with_groq(
        text="Water tap in room 204 Block A is continuously leaking",
        student_type="HOSTELER",
        api_key="",
    )
    assert isinstance(res, TriageResult)
    assert res.is_valid_grievance is True
    assert res.category == "Plumbing & Water"


@pytest.mark.asyncio
async def test_classify_with_groq_dummy_key_fallback():
    """Dummy key (gsk_dummy...) triggers local_heuristic_fallback without exception."""
    res = await classify_with_groq(
        text="Severe ragging and bullying in hostel room 104",
        student_type="HOSTELER",
        api_key="gsk_dummy_key_1234567890",
    )
    assert isinstance(res, TriageResult)
    assert res.is_valid_grievance is True
    assert res.category == "Ragging & Harassment"
    assert res.urgency == "CRITICAL"


@pytest.mark.asyncio
async def test_classify_with_groq_timeout_fallback():
    """Simulated Groq timeout triggers local_heuristic_fallback cleanly within 3.5s."""
    async def slow_mock_create(*args, **kwargs):
        await asyncio.sleep(4.0)  # Exceeds 3.5s timeout

    with patch("backend.app.ml.classifier.HAS_GROQ", True):
        mock_groq_class = MagicMock()
        mock_client = MagicMock()
        mock_client.chat.completions.create = slow_mock_create
        mock_groq_class.return_value = mock_client

        with patch("backend.app.ml.classifier.AsyncGroq", mock_groq_class):
            t0 = time.time()
            res = await classify_with_groq(
                text="Hostel Wi-Fi access point dead in Block D",
                api_key="gsk_realformat_abcdef1234567890",
            )
            elapsed = time.time() - t0
            assert elapsed < 3.8
            assert isinstance(res, TriageResult)
            assert res.is_valid_grievance is True
            assert "Wi-Fi" in res.category or "Internet" in res.category


# ============================================================================
# 4. ENDPOINT INTEGRATION TESTS (API TIER)
# ============================================================================

@pytest.mark.asyncio
async def test_api_v1_ai_triage_valid_grievance(async_client: AsyncClient):
    """POST /api/v1/ai/triage returns strict TriageResult object."""
    payload = {
        "text": "Water tap in room 204 Block A is continuously leaking and flooding the floor",
        "student_type": "HOSTELER",
    }
    response = await async_client.post("/api/v1/ai/triage", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["is_valid_grievance"] is True
    assert data["isValidGrievance"] is True
    assert data["rejection_reason"] is None
    assert data["category"] == "Plumbing & Water"
    assert data["urgency"] in ("HIGH", "CRITICAL", "MEDIUM")
    assert isinstance(data["confidence"], float)
    assert isinstance(data["intent_summary"], str)
    assert isinstance(data["actionable_steps"], list)
    assert len(data["actionable_steps"]) >= 2


@pytest.mark.asyncio
async def test_api_v1_ai_triage_off_campus_veto(async_client: AsyncClient):
    """POST /api/v1/ai/triage vetoes off-campus venues."""
    payload = {"text": "Movie theater screen was blurry in PVR inox multiplex"}
    response = await async_client.post("/api/v1/ai/triage", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["is_valid_grievance"] is False
    assert data["isValidGrievance"] is False
    assert data["rejection_reason"] == "OFF_CAMPUS_DOMAIN"


@pytest.mark.asyncio
async def test_api_v1_ai_triage_empty_text_error(async_client: AsyncClient):
    """POST /api/v1/ai/triage returns 400 when text is empty."""
    payload = {"text": "   "}
    response = await async_client.post("/api/v1/ai/triage", json=payload)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_api_ai_triage_legacy_alias(async_client: AsyncClient):
    """POST /api/ai/triage returns identical result to canonical endpoint."""
    payload = {"text": "Ceiling fan sparking and wires burning in room 102"}
    response = await async_client.post("/api/ai/triage", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["is_valid_grievance"] is True
    assert data["urgency"] == "CRITICAL"


@pytest.mark.asyncio
async def test_legacy_classify_complaint_backward_compatibility(async_client: AsyncClient):
    """POST /classify-complaint retains legacy camelCase contract."""
    payload = {
        "text": "Insects found inside dal served for dinner at hostel mess",
        "studentType": "hosteller",
    }
    response = await async_client.post("/api/v1/ai/classify-complaint", json=payload)
    if response.status_code == 404:
        response = await async_client.post("/api/ai/classify-complaint", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["isValidComplaint"] is True
    assert data["suggestedCategory"] == "Food & Mess"
    assert "priority" in data
    assert "isUrgent" in data
