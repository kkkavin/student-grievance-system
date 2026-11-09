"""
backend/tests/test_analytics_forecasting.py
Campus Analytics Multidimensional Rollups, Monthly Risk Severity Forecasting, and Explainability Test Suite.
Ports:
- test/unit_analytics.test.ts
- test/stress_analytics_edge_cases.test.ts
- test/e2e/e2e_analytics.test.ts
"""

from datetime import datetime, timezone
import pytest
from httpx import AsyncClient

from backend.services.analytics import (
    compute_hostel_maintenance_rollup,
    compute_transport_rollup,
    compute_wifi_density_matrix,
    infer_issue_type,
    infer_transport_incident_type,
)
from backend.services.forecasting import (
    compute_risk_score,
    get_academic_calendar_factors,
)


class TestMultidimensionalRollups:

    def test_hostel_maintenance_rollup_aggregation(self):
        sample_tickets = [
            {"id": "t1", "category": "Hostel Maintenance", "hostel_block": "Block A", "room_no": "A-101", "status": "PRIMARY"},
            {"id": "t2", "category": "Hostel Maintenance", "hostel_block": "Block A", "room_no": "A-102", "status": "MERGED_AUTOMATIC"},
            {"id": "t3", "category": "Hostel Maintenance", "hostel_block": "Block A", "room_no": "A-201", "status": "resolved"},
            {"id": "t4", "category": "Hostel Maintenance", "hostel_block": "Block B", "room_no": "B-305", "status": "pending"},
        ]

        rollup = compute_hostel_maintenance_rollup(sample_tickets)
        assert len(rollup["byBlock"]) >= 2
        block_a = next(b for b in rollup["byBlock"] if b["block"] == "Block A")
        assert block_a["total"] == 3
        assert block_a["resolved"] == 1
        assert block_a["consolidationRatio"] == 0.33  # 1 merged / 3 total

        block_b = next(b for b in rollup["byBlock"] if b["block"] == "Block B")
        assert block_b["total"] == 1
        assert block_b["consolidationRatio"] == 0.0

    def test_transport_rollup_delay_and_surge(self):
        sample_tickets = [
            {"category": "Bus & Transport", "transport_route": "Route 1", "transport_incident_type": "delay"},
            {"category": "Bus & Transport", "transport_route": "Route 1", "transport_incident_type": "delay"},
            {"category": "Bus & Transport", "transport_route": "Route 1", "transport_incident_type": "maintenance"},
            {"category": "Bus & Transport", "transport_route": "Route 2", "transport_incident_type": "capacity_surge"},
            {"category": "Bus & Transport", "transport_route": "Route 2", "transport_incident_type": "capacity_surge"},
        ]

        rollup = compute_transport_rollup(sample_tickets)
        r1 = next(r for r in rollup["byRoute"] if r["route"] == "Route 1")
        assert r1["delayFrequencyPct"] == 67  # 2 delays / 3 total
        assert r1["status"] == "DELAYED"

        r2 = next(r for r in rollup["byRoute"] if r["route"] == "Route 2")
        assert r2["status"] == "SURGE"

    def test_wifi_density_matrix_saturation_levels(self):
        tickets = []
        # 9 for CSE -> HIGH
        for _ in range(9):
            tickets.append({"category": "Hostel Wi-Fi & Internet", "department_block": "CSE"})
        # 5 for ECE -> MEDIUM
        for _ in range(5):
            tickets.append({"category": "Hostel Wi-Fi & Internet", "department_block": "ECE"})
        # 2 for MECH -> LOW
        for _ in range(2):
            tickets.append({"category": "Hostel Wi-Fi & Internet", "department_block": "MECH"})

        rollup = compute_wifi_density_matrix(tickets)
        cse = next(d for d in rollup["densityMatrix"] if d["departmentBlock"] == "CSE")
        assert cse["densityLevel"] == "HIGH"

        ece = next(d for d in rollup["densityMatrix"] if d["departmentBlock"] == "ECE")
        assert ece["densityLevel"] == "MEDIUM"

        mech = next(d for d in rollup["densityMatrix"] if d["departmentBlock"] == "MECH")
        assert mech["densityLevel"] == "LOW"


class TestMonthlyRiskForecastingMathAndBounds:

    def test_risk_score_bounds_1_to_100(self):
        # Min boundary check (0 inputs)
        min_res = compute_risk_score(0, 100, 0, 0, 0.1, 0)
        assert min_res["score"] >= 1
        assert min_res["level"] == "LOW"

        # Max boundary check (100k+ inputs)
        max_res = compute_risk_score(100_000, 1, 50_000, 365, 3.0, 50_000)
        assert max_res["score"] <= 100
        assert max_res["level"] == "HIGH_RISK"

    def test_risk_score_component_weight_ceilings(self):
        # Velocity ceiling: 35
        v_res = compute_risk_score(500, 1, 0, 0, 1.0, 0)
        assert "velocity" in v_res["primaryDriver"].lower()

        # Backlog ceiling: 30
        b_res = compute_risk_score(5, 5, 50, 20, 1.0, 0)
        assert "backlog" in b_res["primaryDriver"].lower() or "aging" in b_res["primaryDriver"].lower()

    @pytest.mark.parametrize(
        "month,expected_mult,expected_phase_substr",
        [
            (10, 1.65, "Monsoon"),
            (11, 1.65, "Monsoon"),
            (12, 0.35, "Vacation"),
            (1, 1.40, "Reopening"),
            (2, 1.0, "Regular"),
            (4, 1.50, "Finals"),
            (6, 0.35, "Vacation"),
            (7, 1.40, "Reopening"),
        ],
    )
    def test_academic_calendar_multipliers(self, month, expected_mult, expected_phase_substr):
        dt = datetime(2026, month, 15, tzinfo=timezone.utc)
        factors = get_academic_calendar_factors(dt)
        assert factors["overallMultiplier"] == expected_mult
        assert expected_phase_substr.lower() in factors["phase"].lower()


class TestAnalyticsEndpoints:

    @pytest.mark.asyncio
    async def test_get_trends_endpoint(self, async_client: AsyncClient):
        resp = await async_client.get("/api/analytics/trends")
        assert resp.status_code == 200
        data = resp.json()
        assert "hostelMaintenance" in data
        assert "campusTransport" in data
        assert "networkWifi" in data

    @pytest.mark.asyncio
    async def test_get_risk_forecast_endpoint(self, async_client: AsyncClient):
        resp = await async_client.get("/api/analytics/risk-forecast")
        assert resp.status_code == 200
        data = resp.json()
        assert "overallCampusRiskScore" in data
        assert 1 <= data["overallCampusRiskScore"] <= 100
        assert "forecasts" in data or "zoneForecasts" in data
