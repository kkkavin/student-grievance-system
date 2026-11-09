"""
backend/tests/test_concurrency_burst.py
High-Concurrency Burst Submissions, Atomic Deduplication, and Unique TicketNo Collision Test Suite.
Ports:
- test/e2e/concurrency_burst_stress.test.ts
- test/stress_concurrency_challenger.test.ts
"""

import asyncio
import re
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.main import app
from backend.db.base import get_db
from backend.db.session import get_db_session
from backend.db.models import Complaint, Department


@pytest.fixture
async def burst_client(db_session: AsyncSession):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_db_session] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


class TestSingleClusterConcurrencyBurst:

    @pytest.mark.asyncio
    async def test_60_burst_simultaneous_submissions(self, burst_client: AsyncClient, db_session: AsyncSession):
        # Ensure required department exists
        res = await db_session.execute(select(Department).where(Department.id == "dept-hostel"))
        if not res.scalars().first():
            dept = Department(
                id="dept-hostel",
                code="HOSTEL",
                name="Hostel & Accommodation",
                contact_email="hostel.admin@campus.edu",
                is_active=True,
            )
            db_session.add(dept)
            await db_session.commit()

        burst_room = "D-304"
        burst_desc = "Severe high-pressure water pipe rupture flooding hostel hallway outside room D-304"

        payloads = [
            {
                "studentRegNo": f"BURST_S1_{i:02d}",
                "studentName": f"Burst Student {i}",
                "studentEmail": f"burst.s1_{i}@campus.edu",
                "studentType": "Hosteller",
                "hostelBlock": "Block D",
                "roomNo": burst_room,
                "category": "Plumbing & Water",
                "description": burst_desc,
                "priority": "urgent",
            }
            for i in range(1, 61)
        ]

        # 60 Simultaneous HTTP requests
        tasks = [burst_client.post("/api/grievances", json=p) for p in payloads]
        responses = await asyncio.gather(*tasks)

        # Invariant 1: 100% HTTP 201 Created (Zero 400 or 500 errors)
        for r in responses:
            assert r.status_code == 201, f"Received status {r.status_code}: {r.text}"

        tickets = [r.json() for r in responses]

        # Invariant 2: High-entropy ticketNo uniqueness (60 unique ticket numbers)
        ticket_nos = [t.get("ticketNo") or t.get("ticket_no") for t in tickets]
        assert len(set(ticket_nos)) == 60, f"Ticket numbers collided! Unique: {len(set(ticket_nos))}"

        # Invariant 3: Atomicity: Exactly 1 PRIMARY, exactly 59 MERGED_AUTOMATIC
        primaries = [t for t in tickets if t.get("status") == "PRIMARY"]
        children = [t for t in tickets if t.get("status") == "MERGED_AUTOMATIC"]

        assert len(primaries) == 1, f"Expected 1 PRIMARY ticket, got {len(primaries)}"
        assert len(children) == 59, f"Expected 59 MERGED_AUTOMATIC tickets, got {len(children)}"

        master_id = primaries[0]["id"]
        for child in children:
            assert child.get("master_case_id") == master_id or child.get("masterCaseId") == master_id


class TestMultiClusterInterleavedConcurrencyBurst:

    @pytest.mark.asyncio
    async def test_60_interleaved_multi_cluster_submissions(self, burst_client: AsyncClient, db_session: AsyncSession):
        # Ensure required departments exist
        for did, code, name in [
            ("dept-hostel", "HOSTEL", "Hostel & Accommodation"),
            ("dept-transport", "TRANSPORT", "Transport & Buses"),
            ("dept-it", "IT_ERP", "IT & ERP Systems"),
        ]:
            res = await db_session.execute(select(Department).where(Department.id == did))
            if not res.scalars().first():
                db_session.add(Department(id=did, code=code, name=name, contact_email=f"{code.lower()}@campus.edu", is_active=True))
        await db_session.commit()

        # 3 Clusters x 20 complaints = 60 requests
        # Cluster A: Plumbing (Block E)
        cluster_a = [
            {
                "studentRegNo": f"BURST_A_{i:02d}",
                "studentName": f"Student A {i}",
                "studentEmail": f"burst.a_{i}@campus.edu",
                "studentType": "Hosteller",
                "hostelBlock": "Block E",
                "category": "Plumbing & Water",
                "description": "Hostel Block E 5th floor roof storage tank valve fractured water pouring",
                "priority": "urgent",
            }
            for i in range(1, 21)
        ]

        # Cluster B: Transport (Route 18)
        cluster_b = [
            {
                "studentRegNo": f"BURST_B_{i:02d}",
                "studentName": f"Student B {i}",
                "studentEmail": f"burst.b_{i}@campus.edu",
                "studentType": "DayScholar",
                "category": "Bus & Transport",
                "description": "Route 18 college bus transmission breakdown near East Toll Gate stranded",
                "priority": "high",
            }
            for i in range(1, 21)
        ]

        # Cluster C: Network (CAD Lab 204)
        cluster_c = [
            {
                "studentRegNo": f"BURST_C_{i:02d}",
                "studentName": f"Student C {i}",
                "studentEmail": f"burst.c_{i}@campus.edu",
                "studentType": "DayScholar",
                "category": "Hostel Wi-Fi & Internet",
                "description": "Mechanical Dept CAD Lab 204 switch port flapping workstation connections dropped",
                "priority": "medium",
            }
            for i in range(1, 21)
        ]

        # Interleave requests
        interleaved = []
        for i in range(20):
            interleaved.append(cluster_a[i])
            interleaved.append(cluster_b[i])
            interleaved.append(cluster_c[i])

        tasks = [burst_client.post("/api/grievances", json=p) for p in interleaved]
        responses = await asyncio.gather(*tasks)

        for r in responses:
            assert r.status_code == 201

        tickets = [r.json() for r in responses]

        # Partition into exactly 3 primaries and 57 children
        primaries = [t for t in tickets if t.get("status") == "PRIMARY"]
        children = [t for t in tickets if t.get("status") == "MERGED_AUTOMATIC"]

        assert len(primaries) == 3, f"Expected 3 cluster primaries, got {len(primaries)}"
        assert len(children) == 57, f"Expected 57 children, got {len(children)}"

        # Zero cross-cluster contamination: Each cluster primary only clusters its own category
        primary_categories = {p["id"]: p["category"] for p in primaries}
        for ch in children:
            master_id = ch.get("master_case_id") or ch.get("masterCaseId")
            assert master_id in primary_categories
            assert ch["category"] == primary_categories[master_id]
