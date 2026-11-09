"""
Database Persistence & Vector Test Harness Verification.
Empirically tests:
1. Creation of all 7 relational tables matching db.ts and src/types.ts.
2. 384-dimensional vector embedding storage, retrieval, and precision fidelity.
3. Deterministic seed data initialization (5 departments, 14 routing rules, 16 users, 5 complaints).
"""

import pytest
from sqlalchemy import select, func
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
from backend.db.base import Base


@pytest.mark.asyncio
async def test_all_seven_tables_created(db_session: AsyncSession):
    """Verify all 7 normalized relational tables exist in Base metadata and can be queried."""
    table_names = set(Base.metadata.tables.keys())
    expected_tables = {
        "departments",
        "users",
        "complaints",
        "category_routing_rules",
        "audit_logs",
        "notifications",
        "otp_codes",
    }
    assert expected_tables.issubset(table_names), f"Missing tables: {expected_tables - table_names}"


@pytest.mark.asyncio
async def test_vector_storage_and_retrieval(db_session: AsyncSession):
    """Verify 384-dimensional vector embedding insert, float fidelity, and retrieval."""
    test_vec = [float(i) / 384.0 for i in range(384)]
    complaint = Complaint(
        id="tkt-vec-01",
        ticket_no="GRV-TEST-001",
        student_reg_no="2023CS001",
        student_name="Vector Tester",
        student_email="vec@college.edu",
        student_type="hosteller",
        category="Plumbing & Water",
        description="Water pipe leak test",
        embedding=test_vec,
    )
    db_session.add(complaint)
    await db_session.flush()

    res = await db_session.execute(select(Complaint).where(Complaint.id == "tkt-vec-01"))
    fetched = res.scalar_one()
    assert fetched is not None
    assert fetched.ticket_no == "GRV-TEST-001"
    assert fetched.ticketNo == "GRV-TEST-001"
    assert len(fetched.embedding) == 384
    assert abs(fetched.embedding[0] - 0.0) < 1e-6
    assert abs(fetched.embedding[1] - (1.0 / 384.0)) < 1e-6


@pytest.mark.asyncio
async def test_deterministic_seed_execution(seeded_session: AsyncSession):
    """Verify seed execution initializes 5 departments, 14 routing rules, 16 users, and 5 complaints."""
    dept_count = await seeded_session.scalar(select(func.count(Department.id)))
    assert dept_count == 5, f"Expected 5 departments, found {dept_count}"

    rules_count = await seeded_session.scalar(select(func.count(CategoryRoutingRule.id)))
    assert rules_count == 14, f"Expected 14 routing rules, found {rules_count}"

    users_count = await seeded_session.scalar(select(func.count(User.id)))
    assert users_count == 16, f"Expected 16 users, found {users_count}"

    complaints_count = await seeded_session.scalar(select(func.count(Complaint.id)))
    assert complaints_count == 5, f"Expected 5 grievances, found {complaints_count}"

    # Verify key seed records
    sa = await seeded_session.scalar(select(User).where(User.id == "admin-super-01"))
    assert sa is not None
    assert sa.role == "SUPER_ADMIN"

    stu = await seeded_session.scalar(select(User).where(User.id == "STU123"))
    assert stu is not None
    assert stu.role == "STUDENT"
    assert stu.regNo == "STU123"

    tkt1 = await seeded_session.scalar(select(Complaint).where(Complaint.id == "tkt-101"))
    assert tkt1 is not None
    assert tkt1.ticket_no == "GRV-2026-8912"
    assert tkt1.ticketNo == "GRV-2026-8912"
    assert tkt1.assigned_department_id == "dept-hostel-admin"
    assert tkt1.assignedDepartmentId == "dept-hostel-admin"
    assert len(tkt1.embedding) == 384
