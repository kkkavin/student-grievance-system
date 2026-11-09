"""
FastAPI Integration Test Suite.
Tests all routers and business logic endpoints against test client and async session fixtures.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession

from backend.main import app
from backend.db.session import get_db_session
from backend.db.models import Department, User, Complaint
from backend.utils.jwt import sign_token


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db_session] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient):
    response = await async_client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "student-grievance-fastapi"


@pytest.mark.asyncio
async def test_ai_classify_valid(async_client: AsyncClient):
    payload = {
        "text": "Water tap in room 204 Block A is continuously leaking and flooding the floor",
        "studentType": "Hosteller",
    }
    response = await async_client.post("/api/ai/classify-complaint", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["isValidComplaint"] is True
    assert data["suggestedCategory"] == "Plumbing & Water"
    assert data["departmentId"] == "dept-hostel-admin"


@pytest.mark.asyncio
async def test_ai_classify_off_campus_veto(async_client: AsyncClient):
    payload = {
        "text": "There is not seat in the cinema theatre",
    }
    response = await async_client.post("/api/ai/classify-complaint", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["isValidComplaint"] is False
    assert data["isCampusRelevant"] is False
    assert data["rejectionReason"] == "OFF_CAMPUS_DOMAIN"


@pytest.mark.asyncio
async def test_ai_classify_gibberish(async_client: AsyncClient):
    payload = {
        "text": "asdfghjkl zxcvbnm qwertyp",
    }
    response = await async_client.post("/api/ai/classify-complaint", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["isValidComplaint"] is False
    assert data["rejectionReason"] in ("GIBBERISH", "EMPTY_OR_TOO_SHORT")


@pytest.mark.asyncio
async def test_ml_model_info(async_client: AsyncClient):
    response = await async_client.get("/api/ai/ml-model-info")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "OPERATIONAL"
    assert data["categoriesCount"] == 14


@pytest.mark.asyncio
async def test_admin_login_student_forbidden(async_client: AsyncClient, db_session: AsyncSession):
    # Seed student user
    student = User(
        id="user-stu-test-01",
        reg_no="STU-TEST-01",
        name="Test Student",
        email="student@test.edu",
        role="student",
        password_hash="pass123",
    )
    db_session.add(student)
    await db_session.commit()

    payload = {"identifier": "STU-TEST-01", "password": "pass123"}
    response = await async_client.post("/api/auth/admin/login", json=payload)
    assert response.status_code == 403
    data = response.json()
    assert data["success"] is False
    assert "STUDENT accounts are not permitted" in data["error"]


@pytest.mark.asyncio
async def test_admin_login_success(async_client: AsyncClient, db_session: AsyncSession):
    admin = User(
        id="user-admin-test-01",
        reg_no="ADMIN-PROCTOR",
        name="Chief Proctor",
        email="proctor@campus.edu",
        role="super_admin",
        password_hash="admin123",
    )
    db_session.add(admin)
    await db_session.commit()

    payload = {"identifier": "ADMIN-PROCTOR", "password": "admin123"}
    response = await async_client.post("/api/auth/admin/login", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "token" in data
    assert data["role"] == "SUPER_ADMIN"


@pytest.mark.asyncio
async def test_departments_list(async_client: AsyncClient, db_session: AsyncSession):
    dept = Department(
        id="dept-test-net",
        name="Test Network Ops",
        code="NET-TEST",
        contact_email="net@campus.edu",
        is_active=True,
    )
    db_session.add(dept)
    await db_session.commit()

    response = await async_client.get("/api/departments")
    assert response.status_code == 200
    depts = response.json()
    assert len(depts) >= 1
    assert any(d["code"] == "NET-TEST" for d in depts)


@pytest.mark.asyncio
async def test_analytics_trends_and_forecast(async_client: AsyncClient):
    trends_resp = await async_client.get("/api/analytics/trends")
    assert trends_resp.status_code == 200
    trends_data = trends_resp.json()
    assert "hostelMaintenance" in trends_data
    assert "campusTransport" in trends_data

    risk_resp = await async_client.get("/api/analytics/risk-forecast")
    assert risk_resp.status_code == 200
    risk_data = risk_resp.json()
    assert "overallCampusRiskScore" in risk_data
    assert "forecasts" in risk_data


@pytest.mark.asyncio
async def test_grievance_rejection_on_invalid_text(async_client: AsyncClient):
    payload = {
        "title": "Movie ticket issue",
        "description": "There is not seat in the cinema theatre",
    }
    response = await async_client.post("/api/grievances", json=payload)
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert "rejected" in data["error"].lower()


@pytest.mark.asyncio
async def test_grievance_lifecycle_and_cascading_resolve(async_client: AsyncClient, db_session: AsyncSession):
    # Ensure department exists for foreign key constraint
    dept = Department(
        id="dept-network-ops",
        name="Network Operations",
        code="NET_OPS",
        contact_email="network.admin@college.edu",
        is_active=True,
    )
    db_session.add(dept)
    await db_session.commit()

    # 1. Create complaint
    create_payload = {
        "title": "No internet connection in Block B",
        "description": "The wifi in Block B room 302 is completely disconnected and not working",
        "studentType": "Hosteller",
        "category": "Hostel Wi-Fi & Internet",
    }
    create_resp = await async_client.post("/api/grievances", json=create_payload)
    assert create_resp.status_code == 201
    created = create_resp.json()
    parent_id = created["id"]

    # 2. Add duplicate child complaint
    child = Complaint(
        id=f"tkt-child-{parent_id}",
        ticket_no=f"tkt-child-{parent_id}",
        student_reg_no="STU-CHILD-01",
        student_name="Student Child",
        student_email="child@college.edu",
        description="Wifi dead in block B",
        category="Hostel Wi-Fi & Internet",
        assigned_department_id="dept-network-ops",
        status="MERGED_AUTOMATIC",
        master_case_id=parent_id,
        embedding=[0.0] * 384,
    )
    db_session.add(child)
    await db_session.commit()

    # 3. Resolve parent with admin token
    admin_token = sign_token({"id": "admin-1", "email": "admin@campus.edu", "role": "super_admin"})
    resolve_resp = await async_client.put(
        f"/api/grievances/{parent_id}/resolve",
        json={"resolutionNote": "Router replaced and signal restored."},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resolve_resp.status_code == 200
    res_data = resolve_resp.json()
    assert res_data["success"] is True
    assert res_data["resolvedCount"] >= 2
    assert child.id in res_data["childIds"]
