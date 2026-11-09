"""
Adversarial Challenger Verification Suite for Milestone 1:
Database Models, Vector Persistence (Vector(384)), Foreign Key / Unique Constraints,
and CamelCase Property Parity.
"""

import math
import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError, StatementError

from backend.db.models import (
    Department,
    User,
    Complaint,
    CategoryRoutingRule,
)
from backend.db.seed import generate_seed_embedding


# ============================================================================
# 1. VECTOR PERSISTENCE & MATHEMATICAL CONSISTENCY
# ============================================================================

@pytest.mark.asyncio
async def test_vector_384_exact_dimension_persistence(db_session: AsyncSession):
    """Verify embedding stores exact 384-dimensional float array and preserves precision."""
    vec = [float(i) / 384.0 for i in range(384)]
    complaint = Complaint(
        id="tkt-chal-vec-01",
        ticket_no="GRV-CHAL-001",
        student_reg_no="2023CS999",
        student_name="Vector Challenger",
        student_email="chal.vec@college.edu",
        category="Network",
        description="Wi-Fi signal degradation in library",
        embedding=vec,
    )
    db_session.add(complaint)
    await db_session.flush()

    fetched = await db_session.get(Complaint, "tkt-chal-vec-01")
    assert fetched is not None
    assert fetched.embedding is not None
    assert len(fetched.embedding) == 384
    assert abs(fetched.embedding[0] - 0.0) < 1e-6
    assert abs(fetched.embedding[192] - (192.0 / 384.0)) < 1e-6
    assert abs(fetched.embedding[383] - (383.0 / 384.0)) < 1e-6


@pytest.mark.asyncio
async def test_vector_rejects_non_float_elements(db_session: AsyncSession):
    """Verify embedding rejects list containing invalid non-float types."""
    invalid_vec = [1.0] * 383 + ["not_a_float"]
    complaint = Complaint(
        id="tkt-chal-vec-02",
        ticket_no="GRV-CHAL-002",
        student_reg_no="2023CS999",
        student_name="Vector Challenger",
        student_email="chal.vec@college.edu",
        category="Network",
        description="Testing invalid vector elements",
        embedding=invalid_vec,
    )
    db_session.add(complaint)
    with pytest.raises(StatementError) as exc_info:
        await db_session.flush()
    assert "could not convert string to float" in str(exc_info.value) or "ValueError" in str(exc_info.value)
    await db_session.rollback()


@pytest.mark.asyncio
async def test_vector_rejects_raw_string(db_session: AsyncSession):
    """Verify embedding rejects raw string rather than list/ndarray."""
    complaint = Complaint(
        id="tkt-chal-vec-03",
        ticket_no="GRV-CHAL-003",
        student_reg_no="2023CS999",
        student_name="Vector Challenger",
        student_email="chal.vec@college.edu",
        category="Network",
        description="Testing raw string embedding",
        embedding="[0.1, 0.2, 0.3]",
    )
    db_session.add(complaint)
    with pytest.raises(StatementError) as exc_info:
        await db_session.flush()
    assert "expected list or ndarray" in str(exc_info.value) or "ValueError" in str(exc_info.value)
    await db_session.rollback()


def test_cosine_similarity_mathematical_consistency():
    """
    Empirically verify cosine similarity & distance invariants on 384-d vectors:
    - Identical unit vectors: dot product == 1.0, cosine distance == 0.0
    - Orthogonal unit vectors: dot product == 0.0, cosine distance == 1.0
    - Opposite unit vectors: dot product == -1.0, cosine distance == 2.0
    - Zero vector: handled safely without division by zero
    """
    dim = 384

    def dot_product(v1, v2):
        return sum(x * y for x, y in zip(v1, v2))

    def cosine_distance(v1, v2):
        n1 = math.sqrt(sum(x * x for x in v1))
        n2 = math.sqrt(sum(y * y for y in v2))
        if n1 == 0 or n2 == 0:
            return 1.0
        return 1.0 - (dot_product(v1, v2) / (n1 * n2))

    # 1. Identical
    v_a = [1.0 if i == 0 else 0.0 for i in range(dim)]
    v_b = [1.0 if i == 0 else 0.0 for i in range(dim)]
    assert abs(dot_product(v_a, v_b) - 1.0) < 1e-7
    assert abs(cosine_distance(v_a, v_b) - 0.0) < 1e-7

    # 2. Orthogonal
    v_c = [1.0 if i == 1 else 0.0 for i in range(dim)]
    assert abs(dot_product(v_a, v_c) - 0.0) < 1e-7
    assert abs(cosine_distance(v_a, v_c) - 1.0) < 1e-7

    # 3. Opposite
    v_d = [-1.0 if i == 0 else 0.0 for i in range(dim)]
    assert abs(dot_product(v_a, v_d) - (-1.0)) < 1e-7
    assert abs(cosine_distance(v_a, v_d) - 2.0) < 1e-7

    # 4. Zero vector edge case
    v_zero = [0.0] * dim
    assert dot_product(v_a, v_zero) == 0.0
    assert cosine_distance(v_a, v_zero) == 1.0


def test_adversarial_embedding_generator_unit_norm():
    """Verify generate_seed_embedding always generates 384-d unit norm vectors under stress."""
    payloads = [
        "",
        "   \n\t  ",
        "!@#$%^&*()_+{}[]:;<>,.?/~`",
        "Water leak " * 500,
        "a",
        "1234567890",
    ]
    for text_input in payloads:
        emb = generate_seed_embedding(text_input)
        assert len(emb) == 384, f"Dimension was {len(emb)}, expected 384"
        norm = math.sqrt(sum(x * x for x in emb))
        assert abs(norm - 1.0) < 1e-5, f"Norm was {norm}, expected 1.0"
        for val in emb:
            assert not math.isnan(val), "Embedding contained NaN"
            assert not math.isinf(val), "Embedding contained Inf"


# ============================================================================
# 2. DATABASE CONSTRAINTS: UNIQUE KEYS & FOREIGN KEYS
# ============================================================================

@pytest.mark.asyncio
async def test_unique_constraint_user_reg_no(db_session: AsyncSession):
    """Verify unique constraint on users.reg_no."""
    u1 = User(id="u-uniq-1", reg_no="REG-UNIQ-01", name="User 1", email="u1@test.com")
    u2 = User(id="u-uniq-2", reg_no="REG-UNIQ-01", name="User 2", email="u2@test.com")
    db_session.add(u1)
    await db_session.flush()

    db_session.add(u2)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_unique_constraint_user_email(db_session: AsyncSession):
    """Verify unique constraint on users.email."""
    u1 = User(id="u-uniq-3", reg_no="REG-UNIQ-03", name="User 3", email="common@test.com")
    u2 = User(id="u-uniq-4", reg_no="REG-UNIQ-04", name="User 4", email="common@test.com")
    db_session.add(u1)
    await db_session.flush()

    db_session.add(u2)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_unique_constraint_department_code(db_session: AsyncSession):
    """Verify unique constraint on departments.code."""
    d1 = Department(id="d-uniq-1", name="Dept 1", code="DCODE_UNIQ", contact_email="d1@test.com")
    d2 = Department(id="d-uniq-2", name="Dept 2", code="DCODE_UNIQ", contact_email="d2@test.com")
    db_session.add(d1)
    await db_session.flush()

    db_session.add(d2)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_unique_constraint_complaint_ticket_no(db_session: AsyncSession):
    """Verify unique constraint on complaints.ticket_no."""
    c1 = Complaint(
        id="c-uniq-1",
        ticket_no="GRV-UNIQ-001",
        student_reg_no="REG-01",
        student_name="Student 1",
        student_email="s1@test.com",
        category="Hostel",
        description="First ticket",
    )
    c2 = Complaint(
        id="c-uniq-2",
        ticket_no="GRV-UNIQ-001",
        student_reg_no="REG-02",
        student_name="Student 2",
        student_email="s2@test.com",
        category="Hostel",
        description="Second ticket with duplicate ticket_no",
    )
    db_session.add(c1)
    await db_session.flush()

    db_session.add(c2)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_unique_constraint_routing_rule_category(db_session: AsyncSession):
    """Verify unique constraint on category_routing_rules.category."""
    dept = Department(id="d-rule-dept", name="Rule Dept", code="R_DEPT", contact_email="rd@test.com")
    db_session.add(dept)
    await db_session.flush()

    r1 = CategoryRoutingRule(id="rule-uniq-1", category="Plumbing", department_id="d-rule-dept")
    r2 = CategoryRoutingRule(id="rule-uniq-2", category="Plumbing", department_id="d-rule-dept")
    db_session.add(r1)
    await db_session.flush()

    db_session.add(r2)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_foreign_key_assigned_department_enforcement(db_session: AsyncSession):
    """Verify foreign key on complaints.assigned_department_id rejects non-existent department."""
    await db_session.execute(text("PRAGMA foreign_keys = ON;"))
    bad_complaint = Complaint(
        id="c-fk-bad-1",
        ticket_no="GRV-FK-BAD-01",
        student_reg_no="REG-01",
        student_name="FK Tester",
        student_email="fk@test.com",
        category="Hostel",
        description="Testing foreign key enforcement",
        assigned_department_id="non-existent-dept-id",
    )
    db_session.add(bad_complaint)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_foreign_key_master_case_id_enforcement(db_session: AsyncSession):
    """Verify self-referencing foreign key on complaints.master_case_id rejects non-existent master."""
    await db_session.execute(text("PRAGMA foreign_keys = ON;"))
    bad_child = Complaint(
        id="c-fk-bad-2",
        ticket_no="GRV-FK-BAD-02",
        student_reg_no="REG-01",
        student_name="FK Tester",
        student_email="fk@test.com",
        category="Hostel",
        description="Testing self-referencing master_case_id FK",
        master_case_id="non-existent-master-id",
    )
    db_session.add(bad_child)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_foreign_key_cascading_on_delete_set_null(db_session: AsyncSession):
    """Verify ON DELETE SET NULL behavior on self-referencing master_case_id and assigned_department_id."""
    await db_session.execute(text("PRAGMA foreign_keys = ON;"))

    dept = Department(id="d-casc", name="Casc Dept", code="CASC_DEPT", contact_email="casc@test.com")
    master = Complaint(
        id="c-master-01",
        ticket_no="GRV-MASTER-01",
        student_reg_no="REG-01",
        student_name="Master",
        student_email="m@test.com",
        category="Hostel",
        description="Primary master complaint",
        assigned_department_id="d-casc",
    )
    child = Complaint(
        id="c-child-01",
        ticket_no="GRV-CHILD-01",
        student_reg_no="REG-02",
        student_name="Child",
        student_email="c@test.com",
        category="Hostel",
        description="Duplicate child complaint",
        master_case_id="c-master-01",
        assigned_department_id="d-casc",
    )
    db_session.add_all([dept, master, child])
    await db_session.commit()

    # Delete master case -> child.master_case_id should become NULL
    await db_session.delete(master)
    await db_session.commit()

    db_session.expire_all()
    reloaded_child = await db_session.get(Complaint, "c-child-01")
    assert reloaded_child is not None
    assert reloaded_child.master_case_id is None
    assert reloaded_child.masterCaseId is None

    # Delete department -> child.assigned_department_id should become NULL
    await db_session.delete(dept)
    await db_session.commit()

    db_session.expire_all()
    reloaded_child = await db_session.get(Complaint, "c-child-01")
    assert reloaded_child.assigned_department_id is None
    assert reloaded_child.assignedDepartmentId is None


# ============================================================================
# 3. CAMELCASE PROPERTY PARITY & KWARGS
# ============================================================================

def test_department_camelcase_property_parity():
    """Verify Department camelCase getters, setters, and constructor kwargs."""
    dept = Department(
        id="d-camel",
        name="Dept Camel",
        code="D_CAMEL",
        contactEmail="original@college.edu",
        isActive=True,
    )
    assert dept.contactEmail == "original@college.edu"
    assert dept.isActive is True

    dept.contactEmail = "updated@college.edu"
    dept.isActive = False
    assert dept.contact_email == "updated@college.edu"
    assert dept.contactEmail == "updated@college.edu"
    assert dept.is_active is False
    assert dept.isActive is False


def test_user_camelcase_property_parity():
    """Verify User camelCase getters, setters, and constructor kwargs."""
    user = User(
        id="u-camel",
        regNo="2023CS001",
        name="User Camel",
        studentType="hosteller",
        email="user.camel@college.edu",
        hostelBlock="Block D",
        roomNo="404",
        isEmailVerified=True,
        passwordHash="bcrypt_hash",
        departmentId="dept-hostel",
    )
    assert user.regNo == "2023CS001"
    assert user.studentType == "hosteller"
    assert user.hostelBlock == "Block D"
    assert user.roomNo == "404"
    assert user.isEmailVerified is True
    assert user.passwordHash == "bcrypt_hash"
    assert user.departmentId == "dept-hostel"

    # Setter mutation
    user.regNo = "2023CS002"
    user.studentType = "dayscholar"
    user.hostelBlock = None
    user.roomNo = None
    user.isEmailVerified = False
    user.passwordHash = "new_hash"
    user.departmentId = "dept-academic"

    assert user.reg_no == "2023CS002"
    assert user.student_type == "dayscholar"
    assert user.hostel_block is None
    assert user.room_no is None
    assert user.is_email_verified is False
    assert user.password_hash == "new_hash"
    assert user.department_id == "dept-academic"


def test_complaint_camelcase_property_parity():
    """Verify Complaint camelCase getters and setters across all 21 camelCase properties."""
    c = Complaint(
        id="c-camel",
        ticketNo="GRV-2026-9000",
        studentRegNo="2023CS100",
        studentName="Aarav Sharma",
        studentEmail="aarav@college.edu",
        studentPhone="9876543210",
        studentType="hosteller",
        hostelBlock="Block A",
        roomNo="101",
        category="Plumbing & Water",
        description="Water tap broken in 1st floor washroom",
        isSpam=False,
        spamReason=None,
        aiClassification={"isSpam": False, "confidence": 0.99},
        adminNotes="Assigned to warden",
        masterCaseId=None,
        locationTag="Block A Floor 1",
        embeddingVector=[0.0] * 384,
        similarityScore=0.94,
        publicMasterNotes="Under repair",
        assignedDepartmentId="dept-hostel",
    )

    assert c.ticketNo == "GRV-2026-9000"
    assert c.studentRegNo == "2023CS100"
    assert c.studentName == "Aarav Sharma"
    assert c.studentEmail == "aarav@college.edu"
    assert c.studentPhone == "9876543210"
    assert c.studentType == "hosteller"
    assert c.hostelBlock == "Block A"
    assert c.roomNo == "101"
    assert c.isSpam is False
    assert c.aiClassification == {"isSpam": False, "confidence": 0.99}
    assert c.adminNotes == "Assigned to warden"
    assert c.locationTag == "Block A Floor 1"
    assert len(c.embeddingVector) == 384
    assert c.similarityScore == 0.94
    assert c.publicMasterNotes == "Under repair"
    assert c.assignedDepartmentId == "dept-hostel"

    # Setter test
    c.ticketNo = "GRV-2026-9001"
    c.isSpam = True
    c.spamReason = "Duplicate spam"
    c.similarityScore = 0.98
    assert c.ticket_no == "GRV-2026-9001"
    assert c.is_spam is True
    assert c.spam_reason == "Duplicate spam"
    assert c.similarity_score == 0.98


def test_category_routing_rule_camelcase_property_parity():
    """
    CRITICAL CHALLENGE: Verify CategoryRoutingRule camelCase getters, setters,
    and constructor kwargs for departmentId, priorityOverride, locationTagPattern,
    priorityOrder, and isActive.
    """
    # 1. Constructor kwargs parity test
    try:
        rule = CategoryRoutingRule(
            id="rule-chal-01",
            category="Hostel Wi-Fi",
            departmentId="dept-net",
            priorityOverride="high",
            locationTagPattern="Hostel*",
            priorityOrder=1,
            isActive=True,
        )
    except AttributeError as e:
        pytest.fail(f"CategoryRoutingRule constructor kwargs failed: {e}")

    assert rule.departmentId == "dept-net"
    assert rule.priorityOverride == "high"
    assert rule.locationTagPattern == "Hostel*"
    assert rule.priorityOrder == 1
    assert rule.isActive is True

    # 2. Setter mutation test
    try:
        rule.departmentId = "dept-net-ops"
        rule.priorityOverride = "urgent"
        rule.locationTagPattern = "Hostel Block A*"
        rule.priorityOrder = 2
        rule.isActive = False
    except AttributeError as e:
        pytest.fail(f"CategoryRoutingRule setter failed: {e}")

    assert rule.department_id == "dept-net-ops"
    assert rule.priority_override == "urgent"
    assert rule.location_tag_pattern == "Hostel Block A*"
    assert rule.priority_order == 2
    assert rule.is_active is False
