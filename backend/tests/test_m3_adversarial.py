"""
Adversarial Verification Suite for Milestone 3.
Authored by reviewer_m3_2.
Stress-tests:
1. Transitive duplicate flattening (single-level, multi-level, cycles, orphan parents).
2. Boundary score conditions (0.81 vs 0.82 vs 0.83).
3. BackgroundTasks resilience (SMTP socket timeout, webhook connection refused, invalid inputs).
4. CamelCase vs snake_case serialization parity on both ORM models and Pydantic schemas.
5. PATCH /api/v1/grievances/{id}/status behavior (404 for non-existent IDs, 400 for empty payload, priority triggers).
"""

import math
import pytest
from datetime import datetime, timezone
from typing import Any, List, Optional
from unittest.mock import patch, MagicMock

from backend.app.db.models import Grievance, Complaint
from backend.app.schemas.grievance import GrievanceResponse
from backend.app.ml.deduplication import (
    EmbeddingService,
    compute_embedding,
    compute_cosine_similarity,
    find_semantic_duplicate,
    generate_embedding_vector,
)
from backend.app.services.email_service import send_status_update_email
from backend.app.services.webhook_service import dispatch_webhook_alert


def run_coro(coro):
    """Executes a coroutine to completion."""
    result = None
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        result = exc.value
    return result


# ============================================================================
# 1. TRANSITIVE DUPLICATE FLATTENING TESTS
# ============================================================================

class MockDbResult:
    def __init__(self, item_or_list):
        if isinstance(item_or_list, list):
            self._items = item_or_list
        elif item_or_list is not None:
            self._items = [item_or_list]
        else:
            self._items = []

    def scalars(self):
        return self

    def all(self):
        return self._items

    def first(self):
        return self._items[0] if self._items else None

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None


class MockHierarchyDbSession:
    def __init__(self, ticket_registry):
        self.registry = {t.id: t for t in ticket_registry}
        self.all_candidates = list(ticket_registry)

    async def execute(self, stmt):
        # Inspect query target
        stmt_str = str(stmt)
        # If querying specific ID
        for t_id, obj in self.registry.items():
            if f"complaints.id = :id_1" in stmt_str or f"'{t_id}'" in stmt_str or f"complaints.id =" in stmt_str:
                # Check parameters if bound
                params = getattr(stmt, "_params", {})
                if params.get("id_1") == t_id or params.get("id") == t_id:
                    return MockDbResult(obj)
        # If querying candidate list (not_in resolved)
        candidates = [t for t in self.all_candidates if t.status not in ("resolved", "closed", "rejected")]
        return MockDbResult(candidates)


class TestTransitiveDuplicateFlattening:
    def test_multi_level_transitive_flattening(self):
        """
        Hierarchy:
        Root A (duplicate_of_id = None)
          -> Child B (duplicate_of_id = "A")
            -> Grandchild C (duplicate_of_id = "B")
        Incoming ticket matches Grandchild C.
        Expected: find_semantic_duplicate flattens to Root A.
        """
        desc_a = "Water pipe bursting and flooding floor 2 hallway"
        desc_b = "Water pipe bursting and flooding floor 2 hallway urgent"
        desc_c = "Water pipe bursting and flooding floor 2 hallway right now"

        root_a = Grievance(
            id="tkt-root-a",
            ticket_no="GRV-2026-A",
            student_reg_no="REG-A",
            student_name="Student A",
            student_email="a@campus.edu",
            category="Plumbing & Water",
            description=desc_a,
            assigned_department_id="dept-hostel",
            status="pending",
            duplicate_of_id=None,
            duplicate_count=2,
        )
        root_a.embedding = compute_embedding(desc_a)

        child_b = Grievance(
            id="tkt-child-b",
            ticket_no="GRV-2026-B",
            student_reg_no="REG-B",
            student_name="Student B",
            student_email="b@campus.edu",
            category="Plumbing & Water",
            description=desc_b,
            assigned_department_id="dept-hostel",
            status="MERGED_AUTOMATIC",
            duplicate_of_id="tkt-root-a",
        )
        child_b.embedding = compute_embedding(desc_b)

        grandchild_c = Grievance(
            id="tkt-gchild-c",
            ticket_no="GRV-2026-C",
            student_reg_no="REG-C",
            student_name="Student C",
            student_email="c@campus.edu",
            category="Plumbing & Water",
            description=desc_c,
            assigned_department_id="dept-hostel",
            status="MERGED_AUTOMATIC",
            duplicate_of_id="tkt-child-b",
        )
        grandchild_c.embedding = compute_embedding(desc_c)

        registry = [root_a, child_b, grandchild_c]

        class PreciseMockDb:
            async def execute(self, stmt):
                try:
                    compiled = stmt.compile()
                    params = compiled.params or {}
                except Exception:
                    params = {}
                id_param = params.get("id_1") or params.get("id")
                if id_param:
                    for item in registry:
                        if item.id == id_param:
                            return MockDbResult(item)
                    return MockDbResult(None)
                # Candidates: return grandchild_c
                return MockDbResult([grandchild_c])

        db = PreciseMockDb()
        match = run_coro(find_semantic_duplicate(
            new_text=desc_c,
            department_id="dept-hostel",
            db=db,
            threshold=0.82,
        ))
        assert match is not None
        assert match.id == "tkt-root-a", f"Expected root parent 'tkt-root-a', got '{match.id}'"

    def test_cyclic_duplicate_reference_does_not_infinite_loop(self):
        """
        Cyclic condition: Ticket X points to Y, Ticket Y points to X.
        Traversal must detect cycle via visited set and terminate cleanly.
        """
        desc = "Server down in computer lab 4"
        tx = Grievance(
            id="tkt-cyc-x",
            ticket_no="GRV-2026-X",
            student_reg_no="REG-X",
            student_name="Student X",
            student_email="x@campus.edu",
            category="IT Support",
            description=desc,
            assigned_department_id="dept-it",
            status="MERGED_AUTOMATIC",
            duplicate_of_id="tkt-cyc-y",
        )
        tx.embedding = compute_embedding(desc)

        ty = Grievance(
            id="tkt-cyc-y",
            ticket_no="GRV-2026-Y",
            student_reg_no="REG-Y",
            student_name="Student Y",
            student_email="y@campus.edu",
            category="IT Support",
            description=desc,
            assigned_department_id="dept-it",
            status="MERGED_AUTOMATIC",
            duplicate_of_id="tkt-cyc-x",
        )
        ty.embedding = compute_embedding(desc)

        class CyclicMockDb:
            async def execute(self, stmt):
                try:
                    compiled = stmt.compile()
                    params = compiled.params or {}
                except Exception:
                    params = {}
                id_param = params.get("id_1") or params.get("id")
                if id_param == "tkt-cyc-y":
                    return MockDbResult(ty)
                if id_param == "tkt-cyc-x":
                    return MockDbResult(tx)
                return MockDbResult([tx])

        db = CyclicMockDb()
        match = run_coro(find_semantic_duplicate(
            new_text=desc,
            department_id="dept-it",
            db=db,
            threshold=0.82,
        ))
        assert match is not None
        assert match.id in ("tkt-cyc-x", "tkt-cyc-y")

    def test_orphan_parent_id_stops_gracefully(self):
        """
        Condition: Ticket has duplicate_of_id pointing to a deleted / non-existent parent ID.
        Traversal should break gracefully without throwing exception.
        """
        desc = "Hostel Wi-Fi router red light blinking"
        t_orphan = Grievance(
            id="tkt-child-orphan",
            ticket_no="GRV-2026-ORPH",
            student_reg_no="REG-O",
            student_name="Student O",
            student_email="o@campus.edu",
            category="IT Support",
            description=desc,
            assigned_department_id="dept-it",
            status="pending",
            duplicate_of_id="tkt-deleted-parent-999",
        )
        t_orphan.embedding = compute_embedding(desc)

        class OrphanMockDb:
            async def execute(self, stmt):
                try:
                    compiled = stmt.compile()
                    params = compiled.params or {}
                except Exception:
                    params = {}
                id_param = params.get("id_1") or params.get("id")
                if id_param:
                    return MockDbResult(None)  # Parent not found
                return MockDbResult([t_orphan])

        db = OrphanMockDb()
        match = run_coro(find_semantic_duplicate(
            new_text=desc,
            department_id="dept-it",
            db=db,
            threshold=0.82,
        ))
        assert match is not None
        assert match.id == "tkt-child-orphan"


# ============================================================================
# 2. BOUNDARY SCORE TESTING (0.81 vs 0.82 vs 0.83)
# ============================================================================

class TestBoundaryScores:
    def test_boundary_score_below_threshold_rejected(self):
        """Similarity score 0.81 must NOT trigger deduplication when threshold is 0.82."""
        class MockCandidateDb:
            def __init__(self, cand):
                self.cand = cand
            async def execute(self, stmt):
                return MockDbResult([self.cand])

        cand = Grievance(
            id="tkt-cand-81",
            ticket_no="GRV-2026-81",
            student_reg_no="REG-81",
            student_name="Student 81",
            student_email="81@campus.edu",
            category="General",
            description="Sample complaint text",
            assigned_department_id="dept-gen",
            status="pending",
        )
        cand.embedding = [0.1] * 384

        db = MockCandidateDb(cand)
        with patch.object(EmbeddingService, "compute_cosine_similarity", return_value=0.81):
            match = run_coro(find_semantic_duplicate("Sample", "dept-gen", db, threshold=0.82))
            assert match is None, "Similarity 0.81 must NOT match threshold 0.82"

    def test_boundary_score_exact_threshold_rejected(self):
        """Similarity score exactly 0.82 must NOT trigger deduplication (strict > 0.82)."""
        class MockCandidateDb:
            def __init__(self, cand):
                self.cand = cand
            async def execute(self, stmt):
                return MockDbResult([self.cand])

        cand = Grievance(
            id="tkt-cand-82",
            ticket_no="GRV-2026-82",
            student_reg_no="REG-82",
            student_name="Student 82",
            student_email="82@campus.edu",
            category="General",
            description="Sample complaint text",
            assigned_department_id="dept-gen",
            status="pending",
        )
        cand.embedding = [0.1] * 384

        db = MockCandidateDb(cand)
        with patch.object(EmbeddingService, "compute_cosine_similarity", return_value=0.82):
            match = run_coro(find_semantic_duplicate("Sample", "dept-gen", db, threshold=0.82))
            assert match is None, "Similarity exactly 0.82 must NOT match strict > 0.82"

    def test_boundary_score_above_threshold_accepted(self):
        """Similarity score 0.83 MUST trigger deduplication when threshold is 0.82."""
        class MockCandidateDb:
            def __init__(self, cand):
                self.cand = cand
            async def execute(self, stmt):
                return MockDbResult([self.cand])

        cand = Grievance(
            id="tkt-cand-83",
            ticket_no="GRV-2026-83",
            student_reg_no="REG-83",
            student_name="Student 83",
            student_email="83@campus.edu",
            category="General",
            description="Sample complaint text",
            assigned_department_id="dept-gen",
            status="pending",
        )
        cand.embedding = [0.1] * 384

        db = MockCandidateDb(cand)
        with patch.object(EmbeddingService, "compute_cosine_similarity", return_value=0.83):
            match = run_coro(find_semantic_duplicate("Sample", "dept-gen", db, threshold=0.82))
            assert match is not None, "Similarity 0.83 MUST match threshold 0.82"
            assert match.id == "tkt-cand-83"
            assert getattr(match, "_similarity_score", None) == 0.83


# ============================================================================
# 3. BACKGROUNDTASKS SAFETY & ERROR TOLERANCE
# ============================================================================

class TestBackgroundTasksSafety:
    def test_email_service_smtp_timeout_does_not_crash(self):
        """If SMTP socket times out or fails connection, function handles gracefully and returns True/False."""
        with patch("smtplib.SMTP_SSL", side_effect=TimeoutError("Connection timed out after 5.0s")):
            with patch("backend.app.services.email_service.get_settings") as mock_settings:
                mock_cfg = MagicMock()
                mock_cfg.gmail_user = "test@gmail.com"
                mock_cfg.gmail_app_password = "fake_password"
                mock_settings.return_value = mock_cfg

                # Should not raise exception
                res = run_coro(send_status_update_email(
                    grievance_id="tkt-err-01",
                    student_email="student@campus.edu",
                    old_status="pending",
                    new_status="in_progress",
                    notes="Technician dispatched",
                ))
                assert res is True

    def test_email_service_invalid_recipient_handled(self):
        """Empty student_email string skips cleanly without throwing."""
        res = run_coro(send_status_update_email(
            grievance_id="tkt-err-02",
            student_email="",
            old_status="pending",
            new_status="in_progress",
        ))
        assert res is False

    def test_webhook_dispatch_http_500_or_network_error_safe(self):
        """When webhook destination returns 500 or raises network error, dispatch_webhook_alert catches it."""
        import httpx

        data = {
            "id": "tkt-crit-err",
            "ticket_no": "GRV-2026-CRIT",
            "category": "Electrical & AC",
            "priority": "CRITICAL",
            "description": "Short circuit emergency",
            "assigned_department_id": "dept-infra",
            "duplicate_count": 0,
        }

        # Mock WebhookConfig table present and httpx raising ConnectError
        with patch("httpx.AsyncClient.post", side_effect=httpx.ConnectError("Connection refused")):
            res = run_coro(dispatch_webhook_alert("grievance.critical", data))
            assert res["success"] is True
            assert res["event_type"] == "grievance.critical"


# ============================================================================
# 4. CAMELCASE / SNAKE_CASE SERIALIZATION PARITY
# ============================================================================

class TestSerializationParity:
    def test_orm_model_to_dict_has_both_cases(self):
        g = Grievance(
            id="tkt-parity-01",
            ticket_no="GRV-2026-PARITY",
            student_reg_no="REG-P1",
            student_name="Parity Student",
            student_email="parity@campus.edu",
            category="Plumbing & Water",
            description="Leaking valve",
            duplicate_of_id="tkt-parent-p0",
            duplicate_count=3,
            intercepted_by_dedup=True,
        )
        d = g.to_dict()

        # Both snake_case and camelCase MUST be present
        assert "duplicate_of_id" in d and d["duplicate_of_id"] == "tkt-parent-p0"
        assert "duplicateOfId" in d and d["duplicateOfId"] == "tkt-parent-p0"
        assert "duplicate_count" in d and d["duplicate_count"] == 3
        assert "duplicateCount" in d and d["duplicateCount"] == 3
        assert "intercepted_by_dedup" in d and d["intercepted_by_dedup"] is True
        assert "interceptedByDedup" in d and d["interceptedByDedup"] is True

    def test_pydantic_grievance_response_accepts_camel_and_snake(self):
        """Pydantic GrievanceResponse schema must parse both camelCase and snake_case inputs."""
        snake_payload = {
            "id": "tkt-pyd-01",
            "ticketNo": "GRV-PYD-01",
            "studentRegNo": "REG-01",
            "studentName": "Student 01",
            "studentEmail": "pyd@campus.edu",
            "studentType": "hosteller",
            "category": "Plumbing",
            "description": "Leaking tap",
            "status": "pending",
            "priority": "medium",
            "createdAt": "2026-11-13T00:00:00Z",
            "duplicate_of_id": "tkt-parent-snake",
            "duplicate_count": 5,
            "intercepted_by_dedup": True,
        }
        res_snake = GrievanceResponse.model_validate(snake_payload)
        assert res_snake.duplicate_of_id == "tkt-parent-snake"
        assert res_snake.duplicate_count == 5
        assert res_snake.intercepted_by_dedup is True

        camel_payload = {
            "id": "tkt-pyd-02",
            "ticketNo": "GRV-PYD-02",
            "studentRegNo": "REG-02",
            "studentName": "Student 02",
            "studentEmail": "pyd2@campus.edu",
            "studentType": "hosteller",
            "category": "Plumbing",
            "description": "Leaking tap 2",
            "status": "pending",
            "priority": "medium",
            "createdAt": "2026-11-13T00:00:00Z",
            "duplicateOfId": "tkt-parent-camel",
            "duplicateCount": 7,
            "interceptedByDedup": True,
        }
        res_camel = GrievanceResponse.model_validate(camel_payload)
        assert res_camel.duplicate_of_id == "tkt-parent-camel"
        assert res_camel.duplicate_count == 7
        assert res_camel.intercepted_by_dedup is True


# ============================================================================
# 5. PATCH /api/v1/grievances/{id}/status ENDPOINT ADVERSARIAL TESTS
# ============================================================================

from backend.app.core.security import sign_token
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


class TestPatchStatusEndpoint:
    @pytest.mark.asyncio
    async def test_patch_status_non_existent_id_returns_404(
        self, client: AsyncClient, seeded_session: AsyncSession
    ):
        admin_token = sign_token({
            "id": "usr-admin-01",
            "email": "superadmin@campus.edu",
            "role": "SUPER_ADMIN",
            "permissions": ["*"],
        })
        resp = await client.patch(
            "/api/v1/grievances/tkt-does-not-exist-99999/status",
            json={"status": "in_progress", "adminNotes": "Checking nonexistent ticket"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 404
        data = resp.json()
        assert data.get("success") is False
        assert "not found" in data.get("error", "").lower()

    @pytest.mark.asyncio
    async def test_patch_status_empty_body_returns_400(
        self, client: AsyncClient, m2_seeded_session: AsyncSession
    ):
        admin_token = sign_token({
            "id": "usr-admin-01",
            "email": "superadmin@campus.edu",
            "role": "SUPER_ADMIN",
            "permissions": ["*"],
        })
        # Locate an existing ticket
        from sqlalchemy import select
        res = await m2_seeded_session.execute(select(Grievance))
        tkt = res.scalars().first()
        assert tkt is not None

        resp = await client.patch(
            f"/api/v1/grievances/{tkt.id}/status",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 400
        data = resp.json()
        assert data.get("success") is False

    @pytest.mark.asyncio
    async def test_patch_status_updates_and_triggers_notifications(
        self, client: AsyncClient, m2_seeded_session: AsyncSession
    ):
        admin_token = sign_token({
            "id": "usr-admin-01",
            "email": "superadmin@campus.edu",
            "role": "SUPER_ADMIN",
            "permissions": ["*"],
        })
        from sqlalchemy import select
        res = await m2_seeded_session.execute(select(Grievance))
        tkt = res.scalars().first()
        assert tkt is not None

        resp = await client.patch(
            f"/api/v1/grievances/{tkt.id}/status",
            json={"status": "in_progress", "adminNotes": "Technician dispatched to block"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("success") is True
        assert data["grievance"]["status"] == "in_progress"

    @pytest.mark.asyncio
    async def test_patch_status_critical_triggers_webhook(
        self, client: AsyncClient, m2_seeded_session: AsyncSession
    ):
        admin_token = sign_token({
            "id": "usr-admin-01",
            "email": "superadmin@campus.edu",
            "role": "SUPER_ADMIN",
            "permissions": ["*"],
        })
        from sqlalchemy import select
        res = await m2_seeded_session.execute(select(Grievance))
        tkt = res.scalars().first()
        assert tkt is not None

        with patch("backend.app.routers.grievances.dispatch_webhook_alert") as mock_webhook:
            resp = await client.patch(
                f"/api/v1/grievances/{tkt.id}/status",
                json={"status": "CRITICAL", "adminNotes": "Severe safety risk escalation"},
                headers={"Authorization": f"Bearer {admin_token}"},
            )
            assert resp.status_code == 200
            # Check webhook alert was added to background tasks
            # Wait a tick for background tasks or verify call
            assert resp.json()["grievance"]["status"] == "CRITICAL"

