"""
Empirical Stress Test Harness for Milestone 3 (Vector Deduplication Engine).
Written and executed by Challenger M3.1.
Runs synchronously and non-interactively without requiring socket-based event loops.
"""

import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Setup paths
root_dir = Path(__file__).resolve().parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.ml.deduplication import (
    EmbeddingService,
    compute_embedding,
    compute_cosine_similarity,
    generate_embedding_vector,
    find_semantic_duplicate,
    VECTOR_DIMENSION,
)
from backend.app.db.models import Grievance, Complaint


def run_coroutine(coro):
    """Drives coroutines to completion without requiring a socket-based event loop."""
    result = None
    try:
        while True:
            coro.send(None)
    except StopIteration as exc:
        result = exc.value
    return result


def report_section(title: str):
    print("\n" + "=" * 75)
    print(f"  {title}")
    print("=" * 75)


def assert_condition(cond: bool, msg: str):
    if not cond:
        print(f"  [FAIL] {msg}")
        raise AssertionError(msg)
    else:
        print(f"  [PASS] {msg}")


class InMemoryAsyncDb:
    """Synchronously-driven async database mock for unit/deduplication stress testing."""
    def __init__(self, grievances):
        self.store = {g.id: g for g in grievances}
        self.added = []

    def add(self, obj):
        self.store[obj.id] = obj
        self.added.append(obj)

    async def execute(self, stmt):
        class MockResult:
            def __init__(self, items): self._items = items
            def scalars(self):
                class S:
                    def __init__(self, it): self.it = it
                    def all(self): return list(self.it)
                    def first(self): return self.it[0] if self.it else None
                return S(self._items)
            def scalar_one_or_none(self):
                return self._items[0] if self._items else None

        compiled = stmt.compile()
        sql_str = str(stmt)

        # 1. Lookup by ID (transitive traversal)
        if "complaints.id =" in sql_str:
            target_id = compiled.params.get("id_1")
            item = self.store.get(target_id)
            return MockResult([item] if item else [])

        # 2. Candidate pool search
        target_dept = compiled.params.get("assigned_department_id_1")
        results = []
        for g in self.store.values():
            if str(g.status).lower() in ("resolved", "closed", "rejected"):
                continue
            if target_dept and g.assigned_department_id != target_dept:
                continue
            results.append(g)
        return MockResult(results)


def test_embedding_dimensions_and_norm():
    report_section("TEST 1: Embedding Dimension and Unit Normalization")

    svc = EmbeddingService.get_instance()
    print(f"  EmbeddingService sentence_transformers active: {svc._use_sentence_transformers}")

    test_cases = [
        ("Standard grievance", "Water leakage on second floor hostel corridor near room 204"),
        ("Empty string", ""),
        ("Whitespace only", "   \t\r\n   "),
        ("Punctuation only", "!@#$%^&*()_+=-[]{}|;':,.<>?/`~"),
        ("Stopwords only", "the a an and or but if then else when where why how to for with on at"),
        ("Unicode and emojis", "Severe water leak! 💧 ⚠️ Room #101-B \u20ac\u00a3\u00a5 \u0928\u092e\u0938\u094d\u0924\u0947"),
        ("Numeric string", "101 202 303 404 505 606 707 808 909"),
        ("Long text 10k chars", "Water cooler broken in hostel block B. " * 250),
    ]

    for label, text in test_cases:
        vec = compute_embedding(text)
        assert_condition(isinstance(vec, list), f"{label}: output is list")
        assert_condition(len(vec) == 384, f"{label}: length == 384 (got {len(vec)})")
        assert_condition(all(isinstance(x, float) for x in vec), f"{label}: all elements are float")

        norm = math.sqrt(sum(x * x for x in vec))
        assert_condition(math.isclose(norm, 1.0, rel_tol=1e-3, abs_tol=1e-3),
                         f"{label}: norm == 1.0 ± 0.001 (got {norm:.6f})")

    # Invariance / Determinism
    t = "Ceiling fan making vibrating sound in hostel room 302"
    v1 = compute_embedding(t)
    v2 = compute_embedding(t)
    assert_condition(v1 == v2, "Invariance: consecutive calls with same input produce identical vectors")


def test_cosine_similarity_boundaries():
    report_section("TEST 2: Cosine Similarity Boundary Tests")

    # 1. Identical strings -> 1.0
    t_id_a = "No water in Block B room 101"
    t_id_b = "No water in Block B room 101"
    v_id_a = compute_embedding(t_id_a)
    v_id_b = compute_embedding(t_id_b)
    sim_ident = compute_cosine_similarity(v_id_a, v_id_b)
    assert_condition(math.isclose(sim_ident, 1.0, rel_tol=1e-3),
                     f"Identical strings -> 1.0 (got {sim_ident})")

    # 2. Near-identical strings (Mandatory mission case: "No water in Block B room 101" vs "Room 101 Block B has no water")
    t_near_1a = "No water in Block B room 101"
    t_near_1b = "Room 101 Block B has no water"
    v_near_1a = compute_embedding(t_near_1a)
    v_near_1b = compute_embedding(t_near_1b)
    sim_near_1 = compute_cosine_similarity(v_near_1a, v_near_1b)
    assert_condition(sim_near_1 > 0.85,
                     f"Near-identical case 1 ('No water in Block B room 101' vs 'Room 101 Block B has no water') -> > 0.85 (got {sim_near_1})")

    # Additional near-identical pairs
    t_near_2a = "Hostel block B room 204 has severe water leakage"
    t_near_2b = "There is severe water leakage in hostel block B room 204"
    sim_near_2 = compute_cosine_similarity(compute_embedding(t_near_2a), compute_embedding(t_near_2b))
    assert_condition(sim_near_2 > 0.85,
                     f"Near-identical case 2 (water leakage) -> > 0.85 (got {sim_near_2})")

    t_near_3a = "Library second floor wifi router is completely broken"
    t_near_3b = "Wifi router in library second floor is completely broken"
    sim_near_3 = compute_cosine_similarity(compute_embedding(t_near_3a), compute_embedding(t_near_3b))
    assert_condition(sim_near_3 > 0.85,
                     f"Near-identical case 3 (wifi broken permutation) -> > 0.85 (got {sim_near_3})")

    # 3. Completely distinct complaints (Mandatory mission case: "No water" vs "Teacher did not come to math class")
    t_dist_1a = "No water"
    t_dist_1b = "Teacher did not come to math class"
    v_dist_1a = compute_embedding(t_dist_1a)
    v_dist_1b = compute_embedding(t_dist_1b)
    sim_dist_1 = compute_cosine_similarity(v_dist_1a, v_dist_1b)
    assert_condition(sim_dist_1 < 0.60,
                     f"Completely distinct case 1 ('No water' vs 'Teacher did not come to math class') -> < 0.60 (got {sim_dist_1})")

    # Additional distinct pairs
    t_dist_2a = "Air conditioner in computer lab 3 broken"
    t_dist_2b = "Hostel mess served spoiled curd for lunch"
    sim_dist_2 = compute_cosine_similarity(compute_embedding(t_dist_2a), compute_embedding(t_dist_2b))
    assert_condition(sim_dist_2 < 0.60,
                     f"Completely distinct case 2 (AC vs mess food) -> < 0.60 (got {sim_dist_2})")

    t_dist_3a = "Streetlight near campus main gate is flickering"
    t_dist_3b = "Semester grade card has incorrect registration number"
    sim_dist_3 = compute_cosine_similarity(compute_embedding(t_dist_3a), compute_embedding(t_dist_3b))
    assert_condition(sim_dist_3 < 0.60,
                     f"Completely distinct case 3 (streetlight vs grades) -> < 0.60 (got {sim_dist_3})")

    # 4. Orthogonal and edge vector mathematics
    v_zero = [0.0] * 384
    v_unit = [1.0] + [0.0] * 383
    v_orth = [0.0, 1.0] + [0.0] * 382

    assert_condition(compute_cosine_similarity(v_unit, v_zero) == 0.0,
                     "Cosine similarity with zero vector -> 0.0")
    assert_condition(compute_cosine_similarity(v_unit, v_orth) == 0.0,
                     "Cosine similarity between orthogonal vectors -> 0.0")


def test_deduplication_lookup_and_transitive_flattening():
    report_section("TEST 3: Deduplication Lookup Logic & Transitive Flattening")

    # 1. Create Root Ticket T1
    t1_text = "No water in Block B room 101"
    t1 = Grievance(
        id="tkt-root-001",
        ticket_no="GRV-2026-TEST-000001",
        student_reg_no="2023CSE001",
        student_name="Student One",
        student_email="student1@campus.edu",
        category="Plumbing & Water",
        description=t1_text,
        status="pending",
        assigned_department_id="dept-hostel",
        duplicate_count=0,
        intercepted_by_dedup=False,
        duplicate_of_id=None,
        embedding=compute_embedding(t1_text),
    )
    db = InMemoryAsyncDb([t1])

    # 2. Test Deduplication Lookup (> 0.82 threshold match)
    dup_text = "Room 101 Block B has no water"
    matched = run_coroutine(find_semantic_duplicate(
        new_text=dup_text,
        department_id="dept-hostel",
        db=db,
        threshold=0.82,
    ))

    assert_condition(matched is not None, "Semantic duplicate search found match for near-identical complaint")
    assert_condition(matched.id == "tkt-root-001", f"Matched ticket is root ticket 'tkt-root-001' (got {matched.id})")
    assert_condition(hasattr(matched, "_similarity_score"), "Matched ticket has _similarity_score attached")
    assert_condition(matched._similarity_score > 0.82, f"Similarity score > 0.82 (got {matched._similarity_score})")

    # Simulate creation of Child Ticket T2
    t2 = Grievance(
        id="tkt-child-002",
        ticket_no="GRV-2026-TEST-000002",
        student_reg_no="2023CSE002",
        student_name="Student Two",
        student_email="student2@campus.edu",
        category="Plumbing & Water",
        description=dup_text,
        status="MERGED_AUTOMATIC",
        assigned_department_id="dept-hostel",
        duplicate_of_id=matched.id,
        master_case_id=matched.id,
        duplicate_count=0,
        intercepted_by_dedup=True,
        embedding=compute_embedding(dup_text),
    )
    # Increment root duplicate_count
    matched.duplicate_count = (matched.duplicate_count or 0) + 1
    db.add(t2)
    db.add(matched)

    # Verify T1 and T2 state
    res_t1 = db.store.get("tkt-root-001")
    assert_condition(res_t1.duplicate_count == 1, f"Root ticket duplicate_count incremented to 1 (got {res_t1.duplicate_count})")
    assert_condition(res_t1.intercepted_by_dedup is False, "Root ticket intercepted_by_dedup remains False")

    res_t2 = db.store.get("tkt-child-002")
    assert_condition(res_t2.duplicate_of_id == "tkt-root-001", f"Child ticket duplicate_of_id == 'tkt-root-001' (got {res_t2.duplicate_of_id})")
    assert_condition(res_t2.intercepted_by_dedup is True, "Child ticket intercepted_by_dedup is True")
    assert_condition(res_t2.status == "MERGED_AUTOMATIC", "Child ticket status is MERGED_AUTOMATIC")

    # 3. Test Transitive Duplicate Flattening
    # Submitting duplicate of duplicate (T3 matches T2 or candidate pool)
    t3_text = "Water is completely not running in Block B room 101"
    matched_transitive = run_coroutine(find_semantic_duplicate(
        new_text=t3_text,
        department_id="dept-hostel",
        db=db,
        threshold=0.82,
    ))

    assert_condition(matched_transitive is not None, "Semantic duplicate found match for third complaint")
    assert_condition(matched_transitive.id == "tkt-root-001",
                     f"Transitive duplicate flattened to root parent 'tkt-root-001' (got {matched_transitive.id})")

    # Link T3 to root
    t3 = Grievance(
        id="tkt-child-003",
        ticket_no="GRV-2026-TEST-000003",
        student_reg_no="2023CSE003",
        student_name="Student Three",
        student_email="student3@campus.edu",
        category="Plumbing & Water",
        description=t3_text,
        status="MERGED_AUTOMATIC",
        assigned_department_id="dept-hostel",
        duplicate_of_id=matched_transitive.id,
        master_case_id=matched_transitive.id,
        duplicate_count=0,
        intercepted_by_dedup=True,
        embedding=compute_embedding(t3_text),
    )
    matched_transitive.duplicate_count = (matched_transitive.duplicate_count or 0) + 1
    db.add(t3)
    db.add(matched_transitive)

    res_t1_after = db.store.get("tkt-root-001")
    assert_condition(res_t1_after.duplicate_count == 2,
                     f"Root ticket duplicate_count incremented to 2 after transitive duplicate (got {res_t1_after.duplicate_count})")

    # 4. Multi-level deep transitive chain test: T_deep -> T_level2 -> T_level1 -> T_root
    deep_root = Grievance(
        id="tkt-deep-root",
        ticket_no="GRV-2026-DEEP-000",
        student_reg_no="2023CSE010",
        student_name="Deep Student",
        student_email="deep@campus.edu",
        category="Electrical & AC",
        description="Power outage in academic block 3",
        status="pending",
        assigned_department_id="dept-academics",
        duplicate_count=0,
        intercepted_by_dedup=False,
        duplicate_of_id=None,
        embedding=compute_embedding("Power outage in academic block 3"),
    )
    level1 = Grievance(
        id="tkt-deep-lvl1",
        ticket_no="GRV-2026-DEEP-001",
        student_reg_no="2023CSE011",
        student_name="Deep Student 1",
        student_email="deep1@campus.edu",
        category="Electrical & AC",
        description="Power outage in academic block 3",
        status="MERGED_AUTOMATIC",
        assigned_department_id="dept-academics",
        duplicate_of_id="tkt-deep-root",
        intercepted_by_dedup=True,
        embedding=compute_embedding("Power outage in academic block 3"),
    )
    level2 = Grievance(
        id="tkt-deep-lvl2",
        ticket_no="GRV-2026-DEEP-002",
        student_reg_no="2023CSE012",
        student_name="Deep Student 2",
        student_email="deep2@campus.edu",
        category="Electrical & AC",
        description="Power outage in academic block 3",
        status="MERGED_AUTOMATIC",
        assigned_department_id="dept-academics",
        duplicate_of_id="tkt-deep-lvl1",
        intercepted_by_dedup=True,
        embedding=compute_embedding("Power outage in academic block 3"),
    )
    db.add(deep_root)
    db.add(level1)
    db.add(level2)

    matched_deep = run_coroutine(find_semantic_duplicate(
        new_text="Academic block 3 has a complete power outage",
        department_id="dept-academics",
        db=db,
        threshold=0.82,
    ))
    assert_condition(matched_deep.id == "tkt-deep-root",
                     f"3-level deep chain flattened directly to 'tkt-deep-root' (got {matched_deep.id})")

    # 5. Cycle Resistance (circular reference in data: A -> B -> A)
    circ_a = Grievance(
        id="tkt-circ-a",
        ticket_no="GRV-2026-CIRC-A",
        student_reg_no="2023CSE020",
        student_name="Circ A",
        student_email="circA@campus.edu",
        category="Internet & Wi-Fi",
        description="Hostel wifi router dead",
        status="pending",
        assigned_department_id="dept-it",
        duplicate_of_id="tkt-circ-b",
        embedding=compute_embedding("Hostel wifi router dead"),
    )
    circ_b = Grievance(
        id="tkt-circ-b",
        ticket_no="GRV-2026-CIRC-B",
        student_reg_no="2023CSE021",
        student_name="Circ B",
        student_email="circB@campus.edu",
        category="Internet & Wi-Fi",
        description="Hostel wifi router dead",
        status="pending",
        assigned_department_id="dept-it",
        duplicate_of_id="tkt-circ-a",
        embedding=compute_embedding("Hostel wifi router dead"),
    )
    db.add(circ_a)
    db.add(circ_b)

    matched_circ = run_coroutine(find_semantic_duplicate(
        new_text="Hostel wifi router dead",
        department_id="dept-it",
        db=db,
        threshold=0.82,
    ))
    assert_condition(matched_circ is not None, "Cycle resistance: circular reference terminated gracefully without infinite loop")

    # 6. Department Isolation: same text in different department must NOT match
    matched_other_dept = run_coroutine(find_semantic_duplicate(
        new_text="No water in Block B room 101",
        department_id="dept-transport",  # different department!
        db=db,
        threshold=0.82,
    ))
    assert_condition(matched_other_dept is None,
                     "Department Isolation: same text does NOT link when searching a different department")

    # 7. Status Isolation: Resolved/Closed tickets must NOT be linked
    res_t1_after.status = "RESOLVED"
    res_t2.status = "RESOLVED"
    t3.status = "RESOLVED"

    matched_resolved = run_coroutine(find_semantic_duplicate(
        new_text="No water in Block B room 101",
        department_id="dept-hostel",
        db=db,
        threshold=0.82,
    ))
    assert_condition(matched_resolved is None,
                     "Status Isolation: Resolved/Closed tickets are excluded from deduplication linking")


def test_latency_performance():
    report_section("TEST 4: Performance & Latency Benchmark")

    sample_texts = [
        "Water cooler leaking on third floor hallway",
        "Elevator stuck between floor 2 and 3 in administration block",
        "Wi-Fi connection drops every 5 minutes in library reading hall",
        "Mess dinner food was cold and rice was uncooked",
        "Air conditioner thermostat broken in seminar hall 102",
    ]

    start = time.perf_counter()
    iterations = 200
    for i in range(iterations):
        t = sample_texts[i % len(sample_texts)]
        _ = compute_embedding(t)
    total_time = time.perf_counter() - start
    avg_ms = (total_time / iterations) * 1000.0

    print(f"  Processed {iterations} embeddings in {total_time:.4f}s ({avg_ms:.3f} ms/op)")
    assert_condition(avg_ms < 5.0, f"Average embedding calculation latency < 5.0 ms (got {avg_ms:.3f} ms)")


def main():
    print("=" * 75)
    print("  EMPIRICAL VECTOR DEDUPLICATION STRESS HARNESS — CHALLENGER M3.1")
    print("=" * 75)

    test_embedding_dimensions_and_norm()
    test_cosine_similarity_boundaries()
    test_deduplication_lookup_and_transitive_flattening()
    test_latency_performance()

    print("\n" + "=" * 75)
    print("  ALL EMPIRICAL TESTS PASSED SUCCESSFULLY! (VERDICT: APPROVE)")
    print("=" * 75)


if __name__ == "__main__":
    main()
