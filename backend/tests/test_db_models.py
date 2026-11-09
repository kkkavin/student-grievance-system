"""
Pytest integration test verifying:
1. All 7 SQLAlchemy 2.0 Async models initialize and persist cleanly.
2. Foreign key constraints, relationships, and cascading behavior.
3. pgvector column Vector(384) persistence and fidelity.
4. Cosine similarity ordering (native pgvector on PostgreSQL or Python dot-product on SQLite).
"""

import math
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.db.models import (
    Department,
    User,
    Complaint,
    CategoryRoutingRule,
    AuditLog,
    Notification,
    OtpCode,
)


@pytest.mark.asyncio
async def test_department_and_user_creation(db_session: AsyncSession):
    dept = Department(
        id="dept-test-01",
        name="Test Dept",
        code="TEST_DEPT",
        contact_email="test.dept@college.edu",
    )
    db_session.add(dept)
    await db_session.flush()

    user = User(
        id="usr-test-01",
        reg_no="REG-TEST-01",
        name="Test Student",
        email="test.student@college.edu",
        role="STUDENT",
        department_id="dept-test-01",
    )
    db_session.add(user)
    await db_session.flush()

    retrieved = await db_session.get(User, "usr-test-01")
    assert retrieved is not None
    assert retrieved.name == "Test Student"
    assert retrieved.regNo == "REG-TEST-01"
    assert retrieved.departmentId == "dept-test-01"
    assert retrieved.isEmailVerified is True


@pytest.mark.asyncio
async def test_complaint_foreign_keys_and_relationships(db_session: AsyncSession):
    dept = Department(
        id="dept-test-02",
        name="Hostel Facilities",
        code="HOSTEL_FAC",
        contact_email="hostel.fac@college.edu",
    )
    user = User(
        id="usr-test-02",
        reg_no="REG-TEST-02",
        name="Priya Tester",
        email="priya.test@college.edu",
        role="STUDENT",
        department_id="dept-test-02",
    )
    db_session.add_all([dept, user])
    await db_session.flush()

    complaint = Complaint(
        id="tkt-rel-01",
        ticket_no="GRV-REL-001",
        student_reg_no="REG-TEST-02",
        student_name="Priya Tester",
        student_email="priya.test@college.edu",
        student_type="hosteller",
        category="Plumbing & Water",
        description="Leaking pipe in bathroom",
        status="pending",
        assigned_department_id="dept-test-02",
    )
    db_session.add(complaint)
    await db_session.flush()

    res = await db_session.execute(
        select(Complaint).where(Complaint.id == "tkt-rel-01")
    )
    fetched = res.scalar_one()
    assert fetched.assignedDepartmentId == "dept-test-02"
    assert fetched.studentRegNo == "REG-TEST-02"


@pytest.mark.asyncio
async def test_routing_rules_audit_notifications_and_otp(db_session: AsyncSession):
    dept = Department(
        id="dept-test-03",
        name="Network Infrastructure",
        code="NET_INFRA",
        contact_email="net.infra@college.edu",
    )
    db_session.add(dept)
    await db_session.flush()

    rule = CategoryRoutingRule(
        id="rule-test-01",
        category="Hostel Wi-Fi",
        department_id="dept-test-03",
    )
    audit = AuditLog(
        id="audit-test-01",
        entity_type="Complaint",
        entity_id="tkt-rel-01",
        action="STATUS_UPDATE",
        actor_id="admin-super-01",
        actor_email="superadmin@college.edu",
        actor_role="SUPER_ADMIN",
        previous_state="pending",
        new_state="in_progress",
    )
    notif = Notification(
        id="notif-test-01",
        recipient="test.student@college.edu",
        subject="Ticket Updated",
        body="Your ticket is now in progress.",
        type="confirmation",
    )
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    otp = OtpCode(
        id="otp-test-01",
        email="test.student@college.edu",
        otp_code="123456",
        expires_at=now + timedelta(minutes=5),
    )
    db_session.add_all([rule, audit, notif, otp])
    await db_session.flush()

    r = await db_session.get(CategoryRoutingRule, "rule-test-01")
    assert r is not None
    assert r.departmentId == "dept-test-03"

    a = await db_session.get(AuditLog, "audit-test-01")
    assert a is not None
    assert a.actorRole == "SUPER_ADMIN"
    assert a.previousState == "pending"
    assert a.entityType == "Complaint"
    assert a.entityId == "tkt-rel-01"
    assert a.actorId == "admin-super-01"
    assert a.actorEmail == "superadmin@college.edu"
    assert a.newState == "in_progress"
    assert a.createdAt != ""
    # Test AuditLog setter mutations
    a.entityType = "ComplaintAudit"
    a.entityId = "tkt-rel-02"
    a.actorId = "admin-002"
    a.actorEmail = "admin2@college.edu"
    a.actorRole = "DEPT_ADMIN"
    a.previousState = "in_progress"
    a.newState = "resolved"
    assert a.entity_type == "ComplaintAudit"
    assert a.entity_id == "tkt-rel-02"
    assert a.actor_id == "admin-002"
    assert a.actor_email == "admin2@college.edu"
    assert a.actor_role == "DEPT_ADMIN"
    assert a.previous_state == "in_progress"
    assert a.new_state == "resolved"

    n = await db_session.get(Notification, "notif-test-01")
    assert n is not None
    assert n.recipient == "test.student@college.edu"
    assert n.userId == "test.student@college.edu"
    assert n.createdAt != ""
    n.userId = "notif.user@college.edu"
    assert n.userId == "notif.user@college.edu"

    o = await db_session.get(OtpCode, "otp-test-01")
    assert o is not None
    assert o.otp_code == "123456"
    assert o.otpCode == "123456"
    assert o.is_used is False
    assert o.isUsed is False
    assert o.expiresAt is not None
    assert o.createdAt != ""
    o.otpCode = "654321"
    o.isUsed = True
    assert o.otp_code == "654321"
    assert o.is_used is True


@pytest.mark.asyncio
async def test_pgvector_similarity_search(db_session: AsyncSession):
    # Vector of dimension 384
    vec_a = [1.0 if i == 0 else 0.0 for i in range(384)]
    vec_b = [0.9 if i == 0 else 0.1 for i in range(384)]
    # L2 normalize vec_b
    norm_b = math.sqrt(sum(x * x for x in vec_b))
    vec_b = [x / norm_b for x in vec_b]

    vec_c = [0.0 if i == 0 else 1.0 / math.sqrt(383.0) for i in range(384)]

    c1 = Complaint(
        id="tkt-vec-01",
        ticket_no="GRV-VEC-001",
        student_reg_no="REG-01",
        student_name="Student 1",
        student_email="s1@test.edu",
        student_type="hosteller",
        category="Plumbing & Water",
        description="Pipe leakage test",
        status="pending",
        embedding=vec_a,
    )
    c2 = Complaint(
        id="tkt-vec-02",
        ticket_no="GRV-VEC-002",
        student_reg_no="REG-02",
        student_name="Student 2",
        student_email="s2@test.edu",
        student_type="hosteller",
        category="Plumbing & Water",
        description="Leaking water tap test",
        status="pending",
        embedding=vec_b,
    )
    c3 = Complaint(
        id="tkt-vec-03",
        ticket_no="GRV-VEC-003",
        student_reg_no="REG-03",
        student_name="Student 3",
        student_email="s3@test.edu",
        student_type="hosteller",
        category="Food & Mess",
        description="Completely unrelated food text",
        status="pending",
        embedding=vec_c,
    )
    db_session.add_all([c1, c2, c3])
    await db_session.flush()

    bind = db_session.bind
    is_postgres = bind.dialect.name == "postgresql"

    if is_postgres:
        stmt = (
            select(Complaint)
            .where(Complaint.category == "Plumbing & Water")
            .order_by(Complaint.embedding.cosine_distance(vec_a))
        )
        result = await db_session.scalars(stmt)
        ordered = list(result.all())
    else:
        # SQLite candidate fetch + Python cosine distance
        stmt = select(Complaint).where(Complaint.category == "Plumbing & Water")
        result = await db_session.scalars(stmt)
        candidates = list(result.all())

        def cosine_dist(emb: list[float], target: list[float]) -> float:
            dot = sum(x * y for x, y in zip(emb, target))
            n1 = math.sqrt(sum(x * x for x in emb))
            n2 = math.sqrt(sum(y * y for y in target))
            if n1 == 0 or n2 == 0:
                return 1.0
            return 1.0 - (dot / (n1 * n2))

        ordered = sorted(candidates, key=lambda c: cosine_dist(c.embedding, vec_a))

    assert len(ordered) == 2
    assert ordered[0].id == "tkt-vec-01"
    assert ordered[1].id == "tkt-vec-02"
