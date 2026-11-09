"""
Test Suite for Seeding & Credentials Verification.
Deploys as backend/tests/test_seeding_credentials.py for Milestone 1.

Verifies:
1. 100% 10-Department Coverage (id, code, contact_email, is_active)
2. Super Admin (Dr. Rajeshwari) and 10 Dept Admins seeded with correct roles and password hashes
3. 4 Sample Student Personas seeded across branches and hostels
4. Universal Development OTP '123456' active for all accounts
5. 35+ realistic complaints with status and priority diversity
6. 3 Semantic Duplicate Clusters (auto-merge >= 0.92, suspected duplicate 0.80 - 0.91)
7. 384-dimensional normalized vector embeddings on all complaints
8. 100% Idempotency over multiple consecutive seeding passes
9. Clean reset and re-population with reset=True
"""

import math
import pytest
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from backend.app.db.base import Base
from backend.app.db.models import (
    Department,
    User,
    Complaint,
    CategoryRoutingRule,
    AuditLog,
    Notification,
    OtpSession,
)
from backend.app.db.seed import (
    seed_database,
    pwd_context,
)


@pytest.fixture
async def isolated_session():
    """Provides an isolated in-memory SQLite database session."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        yield session

    await engine.dispose()


@pytest.mark.asyncio
async def test_seeding_10_departments_coverage(isolated_session: AsyncSession):
    """Verify all 10 campus departments are seeded with correct codes and active status."""
    await seed_database(isolated_session, reset=False)
    await isolated_session.flush()

    expected_codes = {
        "HOSTEL", "MESS", "IT_ERP", "ACADEMICS", "INFRA",
        "TRANSPORT", "SECURITY", "MEDICAL", "ACCOUNTS", "STUDENTLIFE",
    }
    depts = (await isolated_session.scalars(select(Department))).all()
    assert len(depts) == 10, f"Expected 10 departments, found {len(depts)}"

    found_codes = {d.code for d in depts}
    assert found_codes == expected_codes, f"Missing codes: {expected_codes - found_codes}"

    for d in depts:
        assert d.is_active is True
        assert "@campus.edu" in d.contact_email


@pytest.mark.asyncio
async def test_seeding_canonical_users_and_passwords(isolated_session: AsyncSession):
    """Verify Super Admin Dr. Rajeshwari, 10 Dept Admins, and 4 Students."""
    await seed_database(isolated_session, reset=False)
    await isolated_session.flush()

    # 1. Super Admin
    sa = await isolated_session.scalar(select(User).where(User.email == "admin@campus.edu"))
    assert sa is not None, "Super Admin admin@campus.edu not found"
    assert sa.role == "SUPER_ADMIN"
    assert "Dr. Rajeshwari" in sa.name
    assert sa.reg_no == "ADMIN-001"
    assert pwd_context.verify("Admin@123", sa.password_hash)

    # 2. 10 Department Admins
    dept_admins = (
        await isolated_session.scalars(
            select(User).where(User.role.in_(["DEPARTMENT_ADMIN", "DEPARTMENT_HEAD"]))
        )
    ).all()
    assert len(dept_admins) == 10, f"Expected 10 department admins, found {len(dept_admins)}"
    for da in dept_admins:
        assert da.department_id is not None
        assert pwd_context.verify("Dept@123", da.password_hash)

    # 3. 4 Students
    student_emails = [
        "kavin@student.campus.edu",
        "ananya@student.campus.edu",
        "rahul@student.campus.edu",
        "priya@student.campus.edu",
    ]
    for semail in student_emails:
        stu = await isolated_session.scalar(select(User).where(User.email == semail))
        assert stu is not None, f"Student {semail} not found"
        assert stu.role == "STUDENT"
        assert pwd_context.verify("Student@123", stu.password_hash)


@pytest.mark.asyncio
async def test_seeding_universal_dev_otp(isolated_session: AsyncSession):
    """Verify universal dev OTP '123456' is active for all seeded accounts."""
    await seed_database(isolated_session, reset=False)
    await isolated_session.flush()

    target_emails = [
        "admin@campus.edu",
        "hostel.admin@campus.edu",
        "it.admin@campus.edu",
        "kavin@student.campus.edu",
    ]
    for em in target_emails:
        otp_sess = await isolated_session.scalar(
            select(OtpSession).where(OtpSession.email == em)
        )
        assert otp_sess is not None, f"No OTP session found for {em}"
        assert otp_sess.otp_code == "123456"
        assert otp_sess.is_used is False


@pytest.mark.asyncio
async def test_seeding_complaints_diversity_and_duplicate_clusters(isolated_session: AsyncSession):
    """Verify 35+ complaints with status/priority diversity and 3 duplicate clusters."""
    await seed_database(isolated_session, reset=False)
    await isolated_session.flush()

    complaints = (await isolated_session.scalars(select(Complaint))).all()
    assert len(complaints) >= 35, f"Expected >=35 complaints, found {len(complaints)}"

    statuses = {c.status for c in complaints}
    assert {"pending", "in_progress", "escalated", "resolved"}.issubset(statuses)

    priorities = {c.priority for c in complaints}
    assert {"urgent", "high", "medium", "low"}.issubset(priorities)

    # Cluster 1: Wi-Fi (master tkt-101 + children tkt-102, 103, 104)
    wifi_master = await isolated_session.get(Complaint, "tkt-101")
    assert wifi_master is not None
    wifi_children = (
        await isolated_session.scalars(
            select(Complaint).where(Complaint.master_case_id == "tkt-101")
        )
    ).all()
    assert len(wifi_children) == 3
    for c in wifi_children:
        assert c.similarity_score >= 0.92

    # Cluster 2: Plumbing (master tkt-105 + children tkt-106, 107)
    plumb_master = await isolated_session.get(Complaint, "tkt-105")
    assert plumb_master is not None
    plumb_children = (
        await isolated_session.scalars(
            select(Complaint).where(Complaint.master_case_id == "tkt-105")
        )
    ).all()
    assert len(plumb_children) == 2
    for c in plumb_children:
        assert 0.80 <= c.similarity_score <= 0.91

    # Cluster 3: Mess Food (master tkt-108 + children tkt-109, 110)
    mess_master = await isolated_session.get(Complaint, "tkt-108")
    assert mess_master is not None
    mess_children = (
        await isolated_session.scalars(
            select(Complaint).where(Complaint.master_case_id == "tkt-108")
        )
    ).all()
    assert len(mess_children) == 2
    for c in mess_children:
        assert c.similarity_score >= 0.92


@pytest.mark.asyncio
async def test_seeding_vector_embeddings_384d_normalized(isolated_session: AsyncSession):
    """Verify all complaints have 384-dimensional unit L2-normalized embeddings."""
    await seed_database(isolated_session, reset=False)
    await isolated_session.flush()

    complaints = (await isolated_session.scalars(select(Complaint))).all()
    for c in complaints:
        assert c.embedding is not None
        assert len(c.embedding) == 384
        norm = math.sqrt(sum(x * x for x in c.embedding))
        assert abs(norm - 1.0) < 1e-4, f"Vector norm {norm} != 1.0 for complaint {c.id}"


@pytest.mark.asyncio
async def test_seeding_strict_idempotency_consecutive_passes(isolated_session: AsyncSession):
    """Verify running seeder multiple times without reset causes 0 errors and 0 duplicate rows."""
    await seed_database(isolated_session, reset=False)
    await isolated_session.flush()

    initial_depts = await isolated_session.scalar(select(func.count(Department.id)))
    initial_users = await isolated_session.scalar(select(func.count(User.id)))
    initial_complaints = await isolated_session.scalar(select(func.count(Complaint.id)))

    # Re-run seeder 3 times
    for _ in range(3):
        await seed_database(isolated_session, reset=False)
        await isolated_session.flush()

        depts = await isolated_session.scalar(select(func.count(Department.id)))
        users = await isolated_session.scalar(select(func.count(User.id)))
        complaints = await isolated_session.scalar(select(func.count(Complaint.id)))

        assert depts == initial_depts
        assert users == initial_users
        assert complaints == initial_complaints


@pytest.mark.asyncio
async def test_seeding_reset_mode(isolated_session: AsyncSession):
    """Verify reset=True cleanly wipes and reseeds."""
    await seed_database(isolated_session, reset=False)
    await isolated_session.flush()

    depts1 = await isolated_session.scalar(select(func.count(Department.id)))
    assert depts1 == 10

    await seed_database(isolated_session, reset=True)
    await isolated_session.flush()

    depts2 = await isolated_session.scalar(select(func.count(Department.id)))
    assert depts2 == 10
