"""
Milestone 3 Unit Test Suite:
Vector Deduplication, EmbeddingService Fallback, Model Columns, and Event Automation.
"""

import math
import pytest
from datetime import datetime, timezone

from backend.app.db.models import Grievance, Complaint
from backend.app.ml.deduplication import (
    EmbeddingService,
    compute_embedding,
    compute_cosine_similarity,
    generate_embedding_vector,
    find_semantic_duplicate,
)
from backend.app.services.email_service import send_status_update_email
from backend.app.services.webhook_service import dispatch_webhook_alert


def run_coroutine(coro):
    """Drives coroutines to completion without requiring a socket-based event loop."""
    result = None
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        result = exc.value
    return result


class TestEmbeddingService:
    def test_singleton_identity(self):
        svc1 = EmbeddingService.get_instance()
        svc2 = EmbeddingService.get_instance()
        assert svc1 is svc2

    def test_compute_embedding_dimension_and_norm(self):
        text = "Water leakage on second floor hostel corridor"
        vec = compute_embedding(text)
        assert isinstance(vec, list)
        assert len(vec) == 384
        norm = math.sqrt(sum(x * x for x in vec))
        assert math.isclose(norm, 1.0, rel_tol=1e-3)

    def test_compute_embedding_deterministic(self):
        text = "Ceiling fan not working in Room 302"
        vec1 = compute_embedding(text)
        vec2 = compute_embedding(text)
        assert vec1 == vec2

    def test_distinct_texts_distinct_embeddings(self):
        t1 = "Water pipe leaking in washroom"
        t2 = "Library book pages torn"
        v1 = compute_embedding(t1)
        v2 = compute_embedding(t2)
        sim = compute_cosine_similarity(v1, v2)
        assert sim < 0.60

    def test_identical_texts_high_similarity(self):
        t1 = "Water cooler on second floor hostel block B is dispensing warm water"
        t2 = "Water cooler on second floor hostel block B is dispensing warm water"
        v1 = compute_embedding(t1)
        v2 = compute_embedding(t2)
        sim = compute_cosine_similarity(v1, v2)
        assert math.isclose(sim, 1.0, rel_tol=1e-3)

    def test_cosine_boundary_precision(self):
        vec_a = [1.0] + [0.0] * 383
        vec_b = [1.0] + [0.0] * 383
        assert compute_cosine_similarity(vec_a, vec_b) == 1.0

        zero_vec = [0.0] * 384
        assert compute_cosine_similarity(vec_a, zero_vec) == 0.0


class TestModelMappedColumns:
    def test_model_alias_equivalence(self):
        assert Grievance is Complaint

    def test_grievance_mapped_columns_defaults(self):
        g = Grievance(
            id="tkt-test-m3-01",
            ticket_no="GRV-2026-M3-001",
            student_reg_no="2023CSE001",
            student_name="Test Student",
            student_email="student@campus.edu",
            category="Plumbing & Water",
            description="Test grievance description",
        )
        assert g.duplicate_of_id is None
        assert g.duplicate_count == 0
        assert g.intercepted_by_dedup is False
        assert g.embedding is None

    def test_duplicate_linking_and_parity(self):
        g = Grievance(
            id="tkt-test-m3-02",
            ticket_no="GRV-2026-M3-002",
            student_reg_no="2023CSE002",
            student_name="Test Student 2",
            student_email="student2@campus.edu",
            category="Plumbing & Water",
            description="Child complaint",
            duplicate_of_id="tkt-parent-001",
            duplicate_count=0,
            intercepted_by_dedup=True,
            embedding=[0.05] * 384,
        )
        assert g.duplicate_of_id == "tkt-parent-001"
        assert g.duplicateOfId == "tkt-parent-001"
        assert g.master_case_id == "tkt-parent-001"
        assert g.masterCaseId == "tkt-parent-001"
        assert g.intercepted_by_dedup is True
        assert g.interceptedByDedup is True
        assert len(g.embedding) == 384

    def test_to_dict_includes_dedup_fields(self):
        g = Grievance(
            id="tkt-test-m3-03",
            ticket_no="GRV-2026-M3-003",
            student_reg_no="2023CSE003",
            student_name="Test Student 3",
            student_email="student3@campus.edu",
            category="Electrical & AC",
            description="Air conditioner failure",
            duplicate_of_id="tkt-parent-002",
            duplicate_count=2,
            intercepted_by_dedup=True,
        )
        d = g.to_dict()
        assert d["duplicate_of_id"] == "tkt-parent-002"
        assert d["duplicateOfId"] == "tkt-parent-002"
        assert d["duplicate_count"] == 2
        assert d["duplicateCount"] == 2
        assert d["intercepted_by_dedup"] is True
        assert d["interceptedByDedup"] is True


class TestSemanticDuplicateMatching:
    def test_find_semantic_duplicate_matches_parent(self):
        parent = Grievance(
            id="tkt-parent-101",
            ticket_no="GRV-2026-P101",
            student_reg_no="2023CSE010",
            student_name="Parent Reporter",
            student_email="parent@campus.edu",
            category="Plumbing & Water",
            description="Water cooler on second floor hostel block B is dispensing warm water",
            assigned_department_id="dept-hostel",
            status="pending",
        )
        parent.embedding = compute_embedding(parent.description)

        class MockScalars:
            def __init__(self, items):
                self._items = items
            def all(self):
                return self._items
            def scalar_one_or_none(self):
                return self._items[0] if self._items else None

        class MockResult:
            def __init__(self, items):
                self._items = items
            def scalars(self):
                return MockScalars(self._items)
            def scalar_one_or_none(self):
                return self._items[0] if self._items else None

        class MockDbSession:
            def __init__(self, candidates):
                self.candidates = candidates
            async def execute(self, stmt):
                return MockResult(self.candidates)

        mock_db = MockDbSession([parent])
        coro = find_semantic_duplicate(
            new_text="Water cooler on second floor hostel block B is dispensing warm water",
            department_id="dept-hostel",
            db=mock_db,
            threshold=0.82,
        )
        match = run_coroutine(coro)
        assert match is not None
        assert match.id == "tkt-parent-101"

    def test_find_semantic_duplicate_dissimilar_returns_none(self):
        parent = Grievance(
            id="tkt-parent-102",
            ticket_no="GRV-2026-P102",
            student_reg_no="2023CSE011",
            student_name="Parent Reporter",
            student_email="parent2@campus.edu",
            category="Electrical & AC",
            description="Fluorescent tube flickering on 3rd floor hallway",
            assigned_department_id="dept-infra",
            status="pending",
        )
        parent.embedding = compute_embedding(parent.description)

        class MockScalars:
            def __init__(self, items):
                self._items = items
            def all(self):
                return self._items
            def scalar_one_or_none(self):
                return self._items[0] if self._items else None

        class MockResult:
            def __init__(self, items):
                self._items = items
            def scalars(self):
                return MockScalars(self._items)
            def scalar_one_or_none(self):
                return self._items[0] if self._items else None

        class MockDbSession:
            def __init__(self, candidates):
                self.candidates = candidates
            async def execute(self, stmt):
                return MockResult(self.candidates)

        mock_db = MockDbSession([parent])
        coro = find_semantic_duplicate(
            new_text="Mess dinner food was cold and undercooked",
            department_id="dept-hostel",
            db=mock_db,
            threshold=0.82,
        )
        match = run_coroutine(coro)
        assert match is None


class TestEventAutomationServices:
    def test_send_status_update_email_fallback(self):
        res = run_coroutine(send_status_update_email(
            grievance_id="tkt-test-01",
            student_email="test.student@campus.edu",
            old_status="pending",
            new_status="IN_PROGRESS",
            notes="Technician dispatched",
        ))
        assert res is True

    def test_send_status_update_email_empty_recipient(self):
        res = run_coroutine(send_status_update_email(
            grievance_id="tkt-test-02",
            student_email="",
            old_status=None,
            new_status="RECEIVED",
        ))
        assert res is False

    def test_dispatch_webhook_alert_critical(self):
        data = {
            "id": "tkt-crit-01",
            "ticket_no": "GRV-2026-CRIT-01",
            "category": "Electrical & AC",
            "priority": "CRITICAL",
            "description": "Fire emergency sparking switchboard",
            "assigned_department_id": "dept-infra",
            "duplicate_count": 0,
        }
        res = run_coroutine(dispatch_webhook_alert("grievance.critical", data))
        assert res["success"] is True
        assert res["event_type"] == "grievance.critical"
        assert res["payload"]["urgency"] == "CRITICAL"
        assert res["payload"]["grievance_id"] == "tkt-crit-01"

    def test_dispatch_webhook_alert_duplicate_cluster(self):
        data = {
            "id": "tkt-clust-01",
            "ticket_no": "GRV-2026-CLUST-01",
            "category": "Plumbing & Water",
            "priority": "HIGH",
            "description": "Block B complete water supply outage",
            "assigned_department_id": "dept-hostel",
            "duplicate_count": 4,
        }
        res = run_coroutine(dispatch_webhook_alert("grievance.duplicate_cluster", data))
        assert res["success"] is True
        assert res["event_type"] == "grievance.duplicate_cluster"
        assert res["payload"]["duplicate_count"] == 4
