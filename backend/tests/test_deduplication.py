"""
backend/tests/test_deduplication.py
Hybrid Dense Vector Cosine + Token Lexical Deduplication & Cascading Resolution Test Suite.
Ports:
- test/unit_deduplication.test.ts
- test/unit_semantic_grouping.test.ts
- test/e2e/e2e_cascading_resolution.test.ts
- test/fixtures/dedup_fixtures.ts
"""

import math
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.ml.deduplication import (
    cosine_similarity,
    jaccard_similarity,
    compute_hybrid_similarity,
    evaluate_deduplication,
    generate_embedding_vector,
)
from backend.db.models import Complaint, Notification, User
from backend.app.core.security import sign_token


class TestMathematicalVectorOperations:

    def test_vector_dimension_and_l2_norm(self):
        text = "Water pipeline leakage in Hostel Block A room 204"
        emb = generate_embedding_vector(text, ["Plumbing & Water", "Block A"])
        assert len(emb) == 384
        norm = math.sqrt(sum(x * x for x in emb))
        assert math.isclose(norm, 1.0, rel_tol=1e-3)

    def test_cosine_similarity_identity_and_orthogonality(self):
        vec_a = [0.1 * i for i in range(384)]
        # Normalize
        norm_a = math.sqrt(sum(x * x for x in vec_a))
        vec_a_norm = [x / norm_a for x in vec_a]

        assert math.isclose(cosine_similarity(vec_a_norm, vec_a_norm), 1.0, rel_tol=1e-5)
        zero_vec = [0.0] * 384
        assert cosine_similarity(vec_a_norm, zero_vec) == 0.0

    def test_jaccard_lexical_token_overlap(self):
        text_a = "Severe water pipe burst under bathroom sink in Block A"
        text_b = "Water pipe leaking heavily under bathroom sink in Block A corridor"
        sim = jaccard_similarity(text_a, text_b)
        assert sim > 0.40

    def test_hybrid_similarity_formula_weights(self):
        # 70% cosine + 30% jaccard
        emb_a = [1.0] + [0.0] * 383
        emb_b = [1.0] + [0.0] * 383
        text_a = "same description text"
        text_b = "same description text"
        score = compute_hybrid_similarity(emb_a, emb_b, text_a, text_b)
        assert math.isclose(score, 1.0, rel_tol=1e-3)


class TestDeduplicationThresholdDecisions:

    def test_auto_merge_threshold_ge_92(self):
        text = "Severe water leak under washroom sink in room A-304, washroom floor flooded"
        shared_emb = [0.05] * 384

        candidate = {
            "id": "tkt-master-01",
            "ticket_id": "GRV-2026-M01",
            "title": "Water leak room A-304",
            "description": text,
            "embedding": shared_emb,
            "status": "PRIMARY",
        }

        res = evaluate_deduplication(text, shared_emb, [candidate])
        assert res["isDuplicate"] is True
        assert res["autoMerged"] is True
        assert res["confidence"] >= 0.92
        assert res["primaryId"] == "tkt-master-01"

    def test_suspected_duplicate_threshold_80_to_91(self):
        primary_text = "Water leaking under washroom sink in room A-304, drainage backup"
        partial_text = "Water leaking under sink in room A-304"
        emb_primary = [0.05] * 384
        emb_partial = [0.045] * 192 + [0.055] * 192

        candidate = {
            "id": "tkt-master-02",
            "ticket_id": "GRV-2026-M02",
            "title": "Water leakage",
            "description": primary_text,
            "embedding": emb_primary,
            "status": "PRIMARY",
        }

        res = evaluate_deduplication(partial_text, emb_partial, [candidate])
        assert res["isDuplicate"] is True
        assert res["confidence"] >= 0.80

    def test_divergent_complaint_lt_80_remains_primary(self):
        plumbing_text = "Water leak in washroom sink A-304"
        electrical_text = "Ceiling fan regulator burnt out in room A-304"
        emb_plumb = [1.0] + [0.0] * 383
        emb_elec = [0.0] + [1.0] + [0.0] * 382

        candidate = {
            "id": "tkt-master-03",
            "title": "Plumbing leak",
            "description": plumbing_text,
            "embedding": emb_plumb,
            "status": "PRIMARY",
        }

        res = evaluate_deduplication(electrical_text, emb_elec, [candidate])
        assert res["isDuplicate"] is False
        assert res["autoMerged"] is False
        assert res["confidence"] < 0.80


class TestCascadingResolutionAndNotifications:

    @pytest.mark.asyncio
    async def test_single_click_cascading_resolve_with_notifications(
        self, async_client: AsyncClient, m2_seeded_session: AsyncSession
    ):
        admin_token = sign_token({
            "id": "user-dept-hostel",
            "email": "hostel.admin@campus.edu",
            "role": "department_admin",
            "department_id": "dept-hostel",
            "departmentId": "dept-hostel",
            "permissions": ["resolve:department"],
        })

        # 1. Create Master Ticket
        master = Complaint(
            id="tkt-cascade-master-01",
            ticket_no="GRV-2026-CAS-01",
            student_reg_no="2023CSE042",
            student_name="Kavin",
            student_email="kavin@student.campus.edu",
            description="Water pipeline burst Block A corridor",
            category="Plumbing & Water",
            assigned_department_id="dept-hostel",
            status="PRIMARY",
            embedding=[0.0] * 384,
        )
        m2_seeded_session.add(master)

        # 2. Create 3 Linked Children
        children = []
        for i in range(1, 4):
            ch = Complaint(
                id=f"tkt-cascade-child-{i}",
                ticket_no=f"GRV-2026-CAS-C{i}",
                student_reg_no=f"2023CSE0{42 + i}",
                student_name=f"Student {i}",
                student_email=f"student{i}@student.campus.edu",
                description=f"Water leaking in corridor near room {300 + i}",
                category="Plumbing & Water",
                assigned_department_id="dept-hostel",
                status="MERGED_AUTOMATIC",
                master_case_id="tkt-cascade-master-01",
                embedding=[0.0] * 384,
            )
            children.append(ch)
            m2_seeded_session.add(ch)

        await m2_seeded_session.commit()

        # 3. Resolve Master
        resolve_payload = {"resolutionNote": "Pipeline valve replaced, area cleaned."}
        resp = await async_client.post(
            f"/api/complaints/{master.id}/resolve",
            json=resolve_payload,
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["resolvedCount"] == 4  # Master + 3 children

        # 4. Verify DB State: Master and all children resolved
        await m2_seeded_session.refresh(master)
        assert master.status == "resolved"
        assert master.resolved_at is not None

        for ch in children:
            await m2_seeded_session.refresh(ch)
            assert ch.status == "resolved"
            assert ch.resolved_at is not None

        # 5. Verify N+1 Outbox Notifications (Master reporter + 3 child reporters)
        stmt = select(Notification).where(
            Notification.recipient.in_([
                "kavin@student.campus.edu",
                "student1@student.campus.edu",
                "student2@student.campus.edu",
                "student3@student.campus.edu",
            ])
        )
        n_res = await m2_seeded_session.execute(stmt)
        notifs = n_res.scalars().all()
        assert len(notifs) >= 4

    @pytest.mark.asyncio
    async def test_detach_duplicate_restores_primary(
        self, async_client: AsyncClient, m2_seeded_session: AsyncSession
    ):
        master = Complaint(
            id="tkt-detach-master-01",
            ticket_no="GRV-2026-DETACH-M",
            student_reg_no="2023CSE042",
            student_name="Kavin",
            student_email="kavin@student.campus.edu",
            description="Master complaint for detach test",
            category="Plumbing & Water",
            assigned_department_id="dept-hostel",
            status="PRIMARY",
            embedding=[0.0] * 384,
        )
        m2_seeded_session.add(master)
        await m2_seeded_session.flush()

        child = Complaint(
            id="tkt-detach-test-01",
            ticket_no="GRV-2026-DETACH-01",
            student_reg_no="2023CSE099",
            student_name="Test Student",
            student_email="test.student@campus.edu",
            description="Testing detach endpoint",
            category="Plumbing & Water",
            assigned_department_id="dept-hostel",
            status="MERGED_AUTOMATIC",
            master_case_id=master.id,
            embedding=[0.0] * 384,
        )
        m2_seeded_session.add(child)
        await m2_seeded_session.commit()

        resp = await async_client.post("/api/complaints/detach", json={"childId": child.id})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["newStatus"] == "PRIMARY"

        await m2_seeded_session.refresh(child)
        assert child.status == "PRIMARY"
        assert child.master_case_id is None



class TestCandidateStarvationAndHighVolumeDeduplication:
    """
    Permanent regression test for candidate starvation when >100 tickets accumulate in a category.
    Verifies that the candidate query does not saturate its limit with MERGED_AUTOMATIC child tickets,
    ensuring newly created primary tickets are included in candidate pools for subsequent duplicates.
    """

    @pytest.mark.asyncio
    async def test_candidate_starvation_prevention_over_100_tickets(
        self, async_client: AsyncClient, m2_seeded_session: AsyncSession
    ):
        # 1. Seed 1 Block D primary ticket + 99 MERGED_AUTOMATIC child tickets in 'Plumbing & Water'
        # to simulate high-volume ticket accumulation (100 rows in category).
        block_d_master_id = "tkt-starve-d-master"
        master_d = Complaint(
            id=block_d_master_id,
            ticket_no="GRV-2026-STRV-D00",
            student_reg_no="2023STRV000",
            student_name="Block D Master",
            student_email="starve.d0@campus.edu",
            category="Plumbing & Water",
            assigned_department_id="dept-hostel",
            hostel_block="Block D",
            room_no="D-101",
            description="Water supply valve fractured in Block D 1st floor pump room flooding corridor",
            status="PRIMARY",
            embedding=[0.05] * 384,
        )
        m2_seeded_session.add(master_d)

        for i in range(1, 100):
            child_d = Complaint(
                id=f"tkt-starve-d-child-{i:03d}",
                ticket_no=f"GRV-2026-STRV-D{i:03d}",
                student_reg_no=f"2023STRV{i:03d}",
                student_name=f"Block D Child {i}",
                student_email=f"starve.d{i}@campus.edu",
                category="Plumbing & Water",
                assigned_department_id="dept-hostel",
                hostel_block="Block D",
                room_no="D-101",
                description="Water supply valve fractured in Block D 1st floor pump room flooding corridor",
                status="MERGED_AUTOMATIC",
                master_case_id=block_d_master_id,
                embedding=[0.05] * 384,
            )
            m2_seeded_session.add(child_d)
        await m2_seeded_session.commit()

        # 2. Submit Ticket #101 in Block B in the same category ('Plumbing & Water')
        desc_b = "Overhead tank float valve stuck open in Block B rooftop pouring water"
        payload_b1 = {
            "studentRegNo": "STARVE_B_001",
            "studentName": "Student B 1",
            "studentEmail": "starve.b1@campus.edu",
            "studentType": "Hosteller",
            "hostelBlock": "Block B",
            "roomNo": "B-401",
            "category": "Plumbing & Water",
            "description": desc_b,
            "priority": "urgent",
        }
        resp_b1 = await async_client.post("/api/grievances", json=payload_b1)
        assert resp_b1.status_code == 201, f"Failed creating Ticket #101: {resp_b1.text}"
        ticket_b1 = resp_b1.json()
        assert ticket_b1["status"] == "PRIMARY"
        b1_id = ticket_b1["id"]

        # 3. Submit Ticket #102 with identical description to Ticket #101 in Block B
        payload_b2 = {
            "studentRegNo": "STARVE_B_002",
            "studentName": "Student B 2",
            "studentEmail": "starve.b2@campus.edu",
            "studentType": "Hosteller",
            "hostelBlock": "Block B",
            "roomNo": "B-401",
            "category": "Plumbing & Water",
            "description": desc_b,
            "priority": "urgent",
        }
        resp_b2 = await async_client.post("/api/grievances", json=payload_b2)
        assert resp_b2.status_code == 201, f"Failed creating Ticket #102: {resp_b2.text}"
        ticket_b2 = resp_b2.json()

        # Invariant: Ticket #102 MUST be auto-merged into Ticket #101 (b1_id)
        # If candidate starvation bug is present, Ticket #101 was cut off from the candidate query,
        # causing Ticket #102 to erroneously become PRIMARY instead of MERGED_AUTOMATIC!
        assert ticket_b2["status"] == "MERGED_AUTOMATIC", (
            f"Candidate starvation detected! Ticket #102 status is '{ticket_b2['status']}', expected 'MERGED_AUTOMATIC'. "
            f"Ticket #101 was excluded from the candidate pool by accumulated child tickets!"
        )
        assert (ticket_b2.get("master_case_id") == b1_id or ticket_b2.get("masterCaseId") == b1_id), (
            f"Ticket #102 master_case_id={ticket_b2.get('master_case_id')} != {b1_id}"
        )


class TestLocationAdjacencyGuardrails:
    """
    Permanent regression tests for physical location adjacency guardrails.
    Verifies that identical or near-identical descriptions across different hostel blocks
    (e.g., Block A vs Block C) or distant floors are NEVER erroneously merged.
    Also tests dictionary key normalization (camelCase 'hostelBlock' vs snake_case 'hostel_block').
    """

    @pytest.mark.asyncio
    async def test_cross_block_complaints_remain_independent_primaries(
        self, async_client: AsyncClient, m2_seeded_session: AsyncSession
    ):
        desc = "Severe water pipe burst under washroom sink flooding corridor"

        # 1. Submit Primary in Block A, Room A-101
        resp_a = await async_client.post("/api/grievances", json={
            "studentRegNo": "LOC_A_001",
            "studentName": "Block A Student",
            "studentEmail": "blocka@campus.edu",
            "studentType": "Hosteller",
            "hostelBlock": "Block A",
            "roomNo": "A-101",
            "category": "Plumbing & Water",
            "description": desc,
            "priority": "high",
        })
        assert resp_a.status_code == 201
        ticket_a = resp_a.json()
        assert ticket_a["status"] == "PRIMARY"

        # 2. Submit Identical Description in Block C, Room C-101
        resp_c = await async_client.post("/api/grievances", json={
            "studentRegNo": "LOC_C_001",
            "studentName": "Block C Student",
            "studentEmail": "blockc@campus.edu",
            "studentType": "Hosteller",
            "hostelBlock": "Block C",
            "roomNo": "C-101",
            "category": "Plumbing & Water",
            "description": desc,
            "priority": "high",
        })
        assert resp_c.status_code == 201
        ticket_c = resp_c.json()

        # Invariant: Block C MUST NOT merge with Block A despite identical text!
        assert ticket_c["status"] == "PRIMARY", (
            f"Location adjacency guardrail bypassed! Block C ticket was merged (status: {ticket_c['status']}) "
            f"into Block A (master: {ticket_c.get('master_case_id')})."
        )
        assert ticket_c.get("master_case_id") is None
        assert ticket_c.get("masterCaseId") is None

    def test_check_location_adjacency_key_compatibility(self):
        from backend.ml.deduplication import check_location_adjacency

        new_ticket_snake = {
            "hostel_block": "Block A",
            "room_no": "A-101",
            "student_type": "hosteller",
            "category": "Plumbing & Water",
        }
        candidate_diff_block_camel = {
            "hostelBlock": "Block C",
            "roomNo": "C-101",
            "studentType": "hosteller",
            "category": "Plumbing & Water",
        }
        candidate_same_block_camel = {
            "hostelBlock": "Block A",
            "roomNo": "A-102",
            "studentType": "hosteller",
            "category": "Plumbing & Water",
        }
        candidate_distant_floor_camel = {
            "hostelBlock": "Block A",
            "roomNo": "A-401",
            "studentType": "hosteller",
            "category": "Plumbing & Water",
        }

        # Block mismatch must return False under camelCase keys
        assert check_location_adjacency(new_ticket_snake, candidate_diff_block_camel, "Plumbing & Water") is False

        # Same block adjacent floor must return True
        assert check_location_adjacency(new_ticket_snake, candidate_same_block_camel, "Plumbing & Water") is True

        # Same block distant floor (floor 1 vs floor 4) must return False
        assert check_location_adjacency(new_ticket_snake, candidate_distant_floor_camel, "Plumbing & Water") is False


class TestTriageQueueIntegration:
    """
    Tests suspected duplicate (similarity 0.80 - 0.91) queueing in /api/complaints/triage.
    """

    @pytest.mark.asyncio
    async def test_suspected_duplicate_enqueued_in_triage(
        self, async_client: AsyncClient, m2_seeded_session: AsyncSession
    ):
        base_desc = "Severe drainage blockage in room A-301 bathroom floor trap causing water backflow into bedroom"
        similar_desc = "Drainage blockage in room A-301 bathroom with floor water backflow problem"

        r1 = await async_client.post("/api/grievances", json={
            "studentRegNo": "TRIAGE_001",
            "studentName": "Primary Student",
            "studentEmail": "triage.primary@campus.edu",
            "studentType": "Hosteller",
            "hostelBlock": "Block A",
            "roomNo": "A-301",
            "category": "Plumbing & Water",
            "description": base_desc,
            "priority": "high",
        })
        assert r1.status_code == 201
        p_ticket = r1.json()
        assert p_ticket["status"] == "PRIMARY"

        r2 = await async_client.post("/api/grievances", json={
            "studentRegNo": "TRIAGE_002",
            "studentName": "Suspect Student",
            "studentEmail": "triage.suspect@campus.edu",
            "studentType": "Hosteller",
            "hostelBlock": "Block A",
            "roomNo": "A-301",
            "category": "Plumbing & Water",
            "description": similar_desc,
            "priority": "high",
        })
        assert r2.status_code == 201
        s_ticket = r2.json()
        assert s_ticket["status"] == "SUSPECTED_DUPLICATE"

        r_triage = await async_client.get("/api/complaints/triage")
        assert r_triage.status_code == 200
        triage_data = r_triage.json()
        assert triage_data["duplicateSuspectsCount"] >= 1
        found = any(item["grievance"]["id"] == s_ticket["id"] for item in triage_data["queue"])
        assert found, f"Suspected duplicate {s_ticket['id']} not found in triage queue"
