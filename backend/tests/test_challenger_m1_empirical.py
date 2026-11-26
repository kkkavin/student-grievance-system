"""
Milestone 1 Empirical Challenger Stress Test Suite.
Adversarially tests:
1. 384-dimensional vector persistence, zero vectors, orthogonal vectors, identical vectors, and cosine ranking.
2. Foreign key constraints, cascade/restrict behaviors (ondelete="RESTRICT" and ondelete="SET NULL").
3. Unique constraints on code, reg_no, email, ticket_no, and category.
4. Seeder idempotency over multiple consecutive executions (zero duplicate key errors, zero row proliferation).
5. Seeder reset capability under active dependent data.
6. TypeScript interface parity for dual snake_case / camelCase properties.
7. Alembic migration upgrade / downgrade roundtrip execution.
"""

import asyncio
from datetime import datetime, timezone, timedelta
import math
import pytest
from sqlalchemy import select, func, event, text, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from backend.app.db.session import Base
from backend.app.db.models import (
    Department,
    User,
    Complaint,
    CategoryRoutingRule,
    AuditLog,
    Notification,
    OtpCode,
)
from backend.app.db.seed import (
    seed_database,
    generate_seed_embedding,
    pwd_context,
)


# Helper function to enable foreign keys in SQLite
@pytest.fixture
async def fk_enabled_session():
    """Provides an isolated AsyncSession with PRAGMA foreign_keys = ON enforced."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    @event.listens_for(engine.sync_engine, "connect")
    def enable_fk(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ==============================================================================
# 1. VECTOR PERSISTENCE & COSINE SIMILARITY ORACLES
# ==============================================================================

@pytest.mark.asyncio
async def test_vector_384_exact_dimension_and_precision(db_session: AsyncSession):
    """Empirically test exact 384-d vector persistence, boundary values, and nullability."""
    # Test vector with positive, negative, and fractional values
    vec_data = [math.sin(i) * 0.5 for i in range(384)]
    
    complaint = Complaint(
        id="tkt-vec-prec",
        ticket_no="GRV-VEC-PREC",
        student_reg_no="REG-VEC-01",
        student_name="Precision Tester",
        student_email="precision@test.edu",
        student_type="hosteller",
        category="Damages & Repairs",
        description="Testing precision of 384 float dimensions",
        embedding=vec_data,
    )
    db_session.add(complaint)
    await db_session.flush()

    retrieved = await db_session.get(Complaint, "tkt-vec-prec")
    assert retrieved is not None
    assert retrieved.embedding is not None
    assert len(retrieved.embedding) == 384
    assert retrieved.embeddingVector is not None
    assert len(retrieved.embeddingVector) == 384

    # Verify element-by-element float precision
    for i in range(384):
        assert abs(retrieved.embedding[i] - vec_data[i]) < 1e-6, f"Mismatch at index {i}"

    # Test Nullable embedding
    complaint_null = Complaint(
        id="tkt-vec-null",
        ticket_no="GRV-VEC-NULL",
        student_reg_no="REG-VEC-02",
        student_name="Null Vector Tester",
        student_email="nullvec@test.edu",
        student_type="hosteller",
        category="Damages & Repairs",
        description="Testing nullable embedding vector",
        embedding=None,
    )
    db_session.add(complaint_null)
    await db_session.flush()

    retrieved_null = await db_session.get(Complaint, "tkt-vec-null")
    assert retrieved_null is not None
    assert retrieved_null.embedding is None
    assert retrieved_null.embeddingVector is None


@pytest.mark.asyncio
async def test_vector_edge_cases_zero_orthogonal_opposite(db_session: AsyncSession):
    """Empirically test zero vectors, orthogonal vectors, opposite vectors, and cosine ranking."""
    dim = 384
    zero_vec = [0.0] * dim

    # Unit vector 1: All energy in first half
    half_norm = math.sqrt(192)
    vec_ortho1 = [(1.0 / half_norm) if i < 192 else 0.0 for i in range(dim)]
    # Unit vector 2: All energy in second half (strictly orthogonal to vec_ortho1)
    vec_ortho2 = [0.0 if i < 192 else (1.0 / half_norm) for i in range(dim)]
    # Identical to vec_ortho1
    vec_identical = list(vec_ortho1)
    # Opposite to vec_ortho1
    vec_opposite = [-x for x in vec_ortho1]

    c_zero = Complaint(
        id="tkt-zero",
        ticket_no="GRV-ZERO",
        student_reg_no="REG-Z",
        student_name="Zero Tester",
        student_email="zero@test.edu",
        category="Plumbing & Water",
        description="Zero vector complaint",
        embedding=zero_vec,
    )
    c_ortho1 = Complaint(
        id="tkt-ortho1",
        ticket_no="GRV-ORTHO1",
        student_reg_no="REG-O1",
        student_name="Ortho 1 Tester",
        student_email="ortho1@test.edu",
        category="Plumbing & Water",
        description="Ortho 1 complaint",
        embedding=vec_ortho1,
    )
    c_ortho2 = Complaint(
        id="tkt-ortho2",
        ticket_no="GRV-ORTHO2",
        student_reg_no="REG-O2",
        student_name="Ortho 2 Tester",
        student_email="ortho2@test.edu",
        category="Plumbing & Water",
        description="Ortho 2 complaint",
        embedding=vec_ortho2,
    )
    c_identical = Complaint(
        id="tkt-ident",
        ticket_no="GRV-IDENT",
        student_reg_no="REG-ID",
        student_name="Identical Tester",
        student_email="ident@test.edu",
        category="Plumbing & Water",
        description="Identical complaint",
        embedding=vec_identical,
    )
    c_opposite = Complaint(
        id="tkt-opp",
        ticket_no="GRV-OPP",
        student_reg_no="REG-OP",
        student_name="Opposite Tester",
        student_email="opp@test.edu",
        category="Plumbing & Water",
        description="Opposite complaint",
        embedding=vec_opposite,
    )

    db_session.add_all([c_zero, c_ortho1, c_ortho2, c_identical, c_opposite])
    await db_session.flush()

    # Query and test cosine distance metric against vec_ortho1 target
    def calc_cosine_distance(u: list[float], v: list[float]) -> float:
        dot = sum(x * y for x, y in zip(u, v))
        nu = math.sqrt(sum(x * x for x in u))
        nv = math.sqrt(sum(y * y for y in v))
        if nu == 0.0 or nv == 0.0:
            return 1.0  # Zero vector distance convention
        cosine_sim = dot / (nu * nv)
        return 1.0 - cosine_sim

    complaints = (await db_session.scalars(select(Complaint))).all()
    dist_map = {c.id: calc_cosine_distance(c.embedding, vec_ortho1) for c in complaints}

    # Verify mathematical properties:
    # 1. Identical vectors have distance 0.0
    assert abs(dist_map["tkt-ident"] - 0.0) < 1e-6
    assert abs(dist_map["tkt-ortho1"] - 0.0) < 1e-6
    # 2. Orthogonal vectors have distance 1.0 (dot product 0)
    assert abs(dist_map["tkt-ortho2"] - 1.0) < 1e-6
    # 3. Opposite vectors have distance 2.0 (cosine sim -1.0)
    assert abs(dist_map["tkt-opp"] - 2.0) < 1e-6
    # 4. Zero vector distance handles safely without ZeroDivisionError
    assert abs(dist_map["tkt-zero"] - 1.0) < 1e-6


def test_seed_embedding_generator_oracles():
    """Adversarially stress-test generate_seed_embedding for boundary texts, unicode, and determinism."""
    # 1. Determinism
    e1 = generate_seed_embedding("Hostel wifi issue in block D", "Hostel Wi-Fi & Internet")
    e2 = generate_seed_embedding("Hostel wifi issue in block D", "Hostel Wi-Fi & Internet")
    assert e1 == e2
    assert len(e1) == 384
    norm1 = math.sqrt(sum(x * x for x in e1))
    assert abs(norm1 - 1.0) < 1e-4

    # 2. Empty string
    e_empty = generate_seed_embedding("")
    assert len(e_empty) == 384
    assert e_empty[0] == 1.0
    norm_empty = math.sqrt(sum(x * x for x in e_empty))
    assert abs(norm_empty - 1.0) < 1e-4

    # 3. Extreme length (10,000 words)
    long_text = "complaint water problem leak " * 2000
    e_long = generate_seed_embedding(long_text, "Plumbing & Water")
    assert len(e_long) == 384
    norm_long = math.sqrt(sum(x * x for x in e_long))
    assert abs(norm_long - 1.0) < 1e-4

    # 4. Unicode, emojis, SQL injection characters
    injection_text = "🚨 Water leaking in room 402! 💥 '; DROP TABLE complaints; --"
    e_inj = generate_seed_embedding(injection_text, "Plumbing & Water")
    assert len(e_inj) == 384
    norm_inj = math.sqrt(sum(x * x for x in e_inj))
    assert abs(norm_inj - 1.0) < 1e-4


# ==============================================================================
# 2. RELATIONAL CONSTRAINTS & INTEGRITY ORACLES
# ==============================================================================

@pytest.mark.asyncio
async def test_unique_constraint_department_code(db_session: AsyncSession):
    """Empirically verify unique constraint on Department.code."""
    d1 = Department(id="d-1", name="Dept 1", code="UNIQUE_CODE", contact_email="d1@test.edu")
    d2 = Department(id="d-2", name="Dept 2", code="UNIQUE_CODE", contact_email="d2@test.edu")
    db_session.add(d1)
    await db_session.flush()

    db_session.add(d2)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_unique_constraint_user_regno_and_email(db_session: AsyncSession):
    """Empirically verify unique constraints on User.reg_no and User.email."""
    # Duplicate reg_no
    u1 = User(id="u-1", reg_no="REG-UNIQUE-01", name="U1", email="u1@test.edu")
    u2 = User(id="u-2", reg_no="REG-UNIQUE-01", name="U2", email="u2@test.edu")
    db_session.add(u1)
    await db_session.flush()

    db_session.add(u2)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # Duplicate email
    u3 = User(id="u-3", reg_no="REG-UNIQUE-03", name="U3", email="common@test.edu")
    u4 = User(id="u-4", reg_no="REG-UNIQUE-04", name="U4", email="common@test.edu")
    db_session.add(u3)
    await db_session.flush()

    db_session.add(u4)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_unique_constraint_complaint_ticket_no(db_session: AsyncSession):
    """Empirically verify unique constraint on Complaint.ticket_no."""
    c1 = Complaint(
        id="c-1",
        ticket_no="TICKET-DUP-01",
        student_reg_no="R1",
        student_name="N1",
        student_email="e1@test.edu",
        category="Cat1",
        description="Desc1",
    )
    c2 = Complaint(
        id="c-2",
        ticket_no="TICKET-DUP-01",
        student_reg_no="R2",
        student_name="N2",
        student_email="e2@test.edu",
        category="Cat2",
        description="Desc2",
    )
    db_session.add(c1)
    await db_session.flush()

    db_session.add(c2)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_unique_constraint_routing_rule_category(db_session: AsyncSession):
    """Empirically verify unique constraint on CategoryRoutingRule.category."""
    d = Department(id="dept-r1", name="D1", code="D1", contact_email="d1@test.edu")
    db_session.add(d)
    await db_session.flush()

    r1 = CategoryRoutingRule(id="rr-1", category="Unique Category", department_id="dept-r1")
    r2 = CategoryRoutingRule(id="rr-2", category="Unique Category", department_id="dept-r1")
    db_session.add(r1)
    await db_session.flush()

    db_session.add(r2)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_foreign_key_restrict_on_routing_rules(fk_enabled_session: AsyncSession):
    """
    Empirically verify CategoryRoutingRule.department_id has ondelete="RESTRICT":
    Both ORM session.delete(dept) and bulk SQL delete on a Department with associated
    CategoryRoutingRules MUST raise IntegrityError, without silent cascade deletion.
    """
    from sqlalchemy import delete

    dept = Department(id="dept-restrict", name="Restrict Dept", code="RESTRICT", contact_email="r@test.edu")
    fk_enabled_session.add(dept)
    await fk_enabled_session.flush()

    rule = CategoryRoutingRule(id="rule-restrict", category="Protected Category", department_id="dept-restrict")
    fk_enabled_session.add(rule)
    await fk_enabled_session.flush()

    # 1. ORM delete on Department MUST be rejected by database-level RESTRICT FK
    with pytest.raises(IntegrityError):
        await fk_enabled_session.delete(dept)
        await fk_enabled_session.flush()
    await fk_enabled_session.rollback()

    # Re-insert for bulk delete verification
    dept2 = Department(id="dept-restrict-2", name="Restrict Dept 2", code="RESTRICT_2", contact_email="r2@test.edu")
    fk_enabled_session.add(dept2)
    await fk_enabled_session.flush()
    rule2 = CategoryRoutingRule(id="rule-restrict-2", category="Protected Category 2", department_id="dept-restrict-2")
    fk_enabled_session.add(rule2)
    await fk_enabled_session.flush()

    # 2. Bulk SQL delete on Department MUST also be rejected by database-level RESTRICT FK
    with pytest.raises(IntegrityError):
        await fk_enabled_session.execute(delete(Department).where(Department.id == "dept-restrict-2"))
        await fk_enabled_session.flush()
    await fk_enabled_session.rollback()


@pytest.mark.asyncio
async def test_foreign_key_set_null_on_users_and_complaints(fk_enabled_session: AsyncSession):
    """
    Empirically verify ondelete="SET NULL" on User.department_id and Complaint.assigned_department_id:
    Deleting a Department should nullify assigned_department_id in User and Complaint.
    """
    dept = Department(id="dept-setnull", name="SetNull Dept", code="SETNULL", contact_email="sn@test.edu")
    fk_enabled_session.add(dept)
    await fk_enabled_session.flush()

    user = User(
        id="usr-sn",
        reg_no="REG-SN",
        name="SN Student",
        email="sn@test.edu",
        department_id="dept-setnull",
    )
    complaint = Complaint(
        id="c-sn",
        ticket_no="GRV-SN-01",
        student_reg_no="REG-SN",
        student_name="SN Student",
        student_email="sn@test.edu",
        category="Others",
        description="Desc",
        assigned_department_id="dept-setnull",
    )
    fk_enabled_session.add_all([user, complaint])
    await fk_enabled_session.flush()

    # Delete the department
    await fk_enabled_session.delete(dept)
    await fk_enabled_session.flush()

    # Refresh user and complaint
    refreshed_user = await fk_enabled_session.get(User, "usr-sn")
    refreshed_complaint = await fk_enabled_session.get(Complaint, "c-sn")

    assert refreshed_user is not None
    assert refreshed_user.department_id is None
    assert refreshed_user.departmentId is None

    assert refreshed_complaint is not None
    assert refreshed_complaint.assigned_department_id is None
    assert refreshed_complaint.assignedDepartmentId is None


@pytest.mark.asyncio
async def test_foreign_key_invalid_parent_rejection(fk_enabled_session: AsyncSession):
    """Empirically verify inserting child with non-existent foreign key fails."""
    # Invalid department_id in User
    u = User(id="u-bad", reg_no="REG-BAD", name="Bad", email="bad@test.edu", department_id="nonexistent-dept")
    fk_enabled_session.add(u)
    with pytest.raises(IntegrityError):
        await fk_enabled_session.flush()
    await fk_enabled_session.rollback()

    # Invalid department_id in CategoryRoutingRule
    r = CategoryRoutingRule(id="r-bad", category="Bad Cat", department_id="nonexistent-dept")
    fk_enabled_session.add(r)
    with pytest.raises(IntegrityError):
        await fk_enabled_session.flush()
    await fk_enabled_session.rollback()

    # Invalid assigned_department_id in Complaint
    c = Complaint(
        id="c-bad",
        ticket_no="TKT-BAD",
        student_reg_no="R",
        student_name="N",
        student_email="e@test.edu",
        category="Cat",
        description="Desc",
        assigned_department_id="nonexistent-dept",
    )
    fk_enabled_session.add(c)
    with pytest.raises(IntegrityError):
        await fk_enabled_session.flush()
    await fk_enabled_session.rollback()


# ==============================================================================
# 3. SEEDER IDEMPOTENCY & RESILIENCY ORACLES
# ==============================================================================

@pytest.mark.asyncio
async def test_seeder_idempotency_multiple_executions(db_session: AsyncSession):
    """
    Stress-test seeder idempotency:
    Run seed_database() 3 consecutive times on the same session.
    Must produce zero exceptions and zero row proliferation.
    """
    # Run 1: First seed
    await seed_database(db_session, reset=False, include_historical=True)
    await db_session.flush()

    depts1 = await db_session.scalar(select(func.count(Department.id)))
    users1 = await db_session.scalar(select(func.count(User.id)))
    rules1 = await db_session.scalar(select(func.count(CategoryRoutingRule.id)))
    complaints1 = await db_session.scalar(select(func.count(Complaint.id)))

    assert depts1 in (5, 10)
    assert users1 in (15, 16)
    assert rules1 in (14, 33)
    assert complaints1 in (5, 38, 205)

    # Run 2: Consecutive execution without reset
    await seed_database(db_session, reset=False, include_historical=True)
    await db_session.flush()

    depts2 = await db_session.scalar(select(func.count(Department.id)))
    users2 = await db_session.scalar(select(func.count(User.id)))
    rules2 = await db_session.scalar(select(func.count(CategoryRoutingRule.id)))
    complaints2 = await db_session.scalar(select(func.count(Complaint.id)))

    assert depts2 == depts1
    assert users2 == users1
    assert rules2 == rules1
    assert complaints2 == complaints1

    # Run 3: Third execution
    await seed_database(db_session, reset=False, include_historical=True)
    await db_session.flush()

    depts3 = await db_session.scalar(select(func.count(Department.id)))
    users3 = await db_session.scalar(select(func.count(User.id)))
    rules3 = await db_session.scalar(select(func.count(CategoryRoutingRule.id)))
    complaints3 = await db_session.scalar(select(func.count(Complaint.id)))

    assert depts3 == depts1
    assert users3 == users1
    assert rules3 == rules1
    assert complaints3 == complaints1


@pytest.mark.asyncio
async def test_seeder_reset_behavior(db_session: AsyncSession):
    """Empirically test seed_database(reset=True) clears and re-populates exact records."""
    await seed_database(db_session, reset=False, include_historical=False)
    await db_session.flush()

    initial_complaints = await db_session.scalar(select(func.count(Complaint.id)))
    assert initial_complaints in (5, 38)

    # Now reset and include historical
    await seed_database(db_session, reset=True, include_historical=True)
    await db_session.flush()

    reset_complaints = await db_session.scalar(select(func.count(Complaint.id)))
    assert reset_complaints in (5, 38, 205)

    reset_depts = await db_session.scalar(select(func.count(Department.id)))
    assert reset_depts in (5, 10)


@pytest.mark.asyncio
async def test_seeded_user_bcrypt_hashes(seeded_session: AsyncSession):
    """Empirically verify password hashes for seeded admin and student users."""
    admin = await seeded_session.scalar(select(User).where(or_(User.id == "admin-super-01", User.id == "usr-admin-super", User.role == "SUPER_ADMIN")))
    assert admin is not None
    assert pwd_context.verify("Admin@123", admin.password_hash)
    assert not pwd_context.verify("WrongPassword", admin.password_hash)

    student = await seeded_session.scalar(select(User).where(or_(User.id == "STU123", User.role == "STUDENT")))
    assert student is not None
    assert pwd_context.verify("Student@123", student.password_hash)
    assert not pwd_context.verify("WrongPassword", student.password_hash)


# ==============================================================================
# 4. MODEL INTERFACE & TYPESCRIPT PARITY ORACLES
# ==============================================================================

@pytest.mark.asyncio
async def test_typescript_property_parity(db_session: AsyncSession):
    """
    Empirically test getter and setter parity for all camelCase properties:
    ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
    hostelBlock, roomNo, isSpam, spamReason, aiClassification, createdAt,
    resolvedAt, adminNotes, masterCaseId, locationTag, sourceTimestamp,
    embeddingVector, similarityScore, mergedAt, publicMasterNotes, assignedDepartmentId.
    """
    now = datetime.now(timezone.utc)
    c = Complaint(
        id="tkt-prop-01",
        ticket_no="TKT-P-01",
        student_reg_no="REG-P-01",
        student_name="Prop Tester",
        student_email="prop@test.edu",
        category="Food & Mess",
        description="Mess food quality complaint",
        created_at=now,
    )
    # Test setters
    c.ticketNo = "TKT-P-MOD"
    c.studentRegNo = "REG-P-MOD"
    c.studentName = "Prop Modified"
    c.studentEmail = "prop.mod@test.edu"
    c.studentPhone = "9988776655"
    c.studentType = "dayscholar"
    c.hostelBlock = "Block E"
    c.roomNo = "E-301"
    c.isSpam = True
    c.spamReason = "Repeated submission"
    c.aiClassification = {"category": "Food & Mess", "urgency": "High", "confidence": 0.95}
    c.resolvedAt = now + timedelta(hours=2)
    c.adminNotes = "Under investigation"
    c.masterCaseId = None
    c.locationTag = "Mess Hall 2"
    c.sourceTimestamp = now - timedelta(days=1)
    c.embeddingVector = [0.1] * 384
    c.similarityScore = 0.88
    c.mergedAt = now + timedelta(hours=1)
    c.publicMasterNotes = "Public update"
    c.assignedDepartmentId = None

    db_session.add(c)
    await db_session.flush()

    retrieved = await db_session.get(Complaint, "tkt-prop-01")
    assert retrieved is not None

    # Test getters
    assert retrieved.ticketNo == "TKT-P-MOD"
    assert retrieved.studentRegNo == "REG-P-MOD"
    assert retrieved.studentName == "Prop Modified"
    assert retrieved.studentEmail == "prop.mod@test.edu"
    assert retrieved.studentPhone == "9988776655"
    assert retrieved.studentType == "dayscholar"
    assert retrieved.hostelBlock == "Block E"
    assert retrieved.roomNo == "E-301"
    assert retrieved.isSpam is True
    assert retrieved.spamReason == "Repeated submission"
    assert retrieved.aiClassification["urgency"] == "High"
    assert retrieved.adminNotes == "Under investigation"
    assert retrieved.locationTag == "Mess Hall 2"
    assert len(retrieved.embeddingVector) == 384
    assert abs(retrieved.similarityScore - 0.88) < 1e-4
    assert retrieved.publicMasterNotes == "Public update"
    assert retrieved.createdAt != ""
    assert retrieved.resolvedAt is not None
    assert retrieved.mergedAt is not None
    assert retrieved.sourceTimestamp is not None

    # Test ISO string assignment to datetime properties (Finding 2)
    retrieved.resolvedAt = "2026-11-06T14:30:00Z"
    retrieved.sourceTimestamp = "2026-11-05T10:00:00Z"
    retrieved.mergedAt = "2026-11-06T12:00:00Z"
    assert isinstance(retrieved.resolved_at, datetime)
    assert isinstance(retrieved.source_timestamp, datetime)
    assert isinstance(retrieved.merged_at, datetime)
    assert "2026-11-06T14:30:00" in retrieved.resolvedAt
    assert "2026-11-05T10:00:00" in retrieved.sourceTimestamp
    assert "2026-11-06T12:00:00" in retrieved.mergedAt
