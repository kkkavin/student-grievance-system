"""
Empirical Verification Test Harness for Milestone 3:
Event Automation, BackgroundTasks, Semantic Deduplication Clusters, and Failure Resilience.
Executed via: .venv\Scripts\python.exe backend/tests/verify_m3_event_automation.py
"""

import asyncio
import os
import sys
import unittest.mock
from datetime import datetime, timezone
from pathlib import Path
import smtplib
import httpx

# Ensure project and backend directories are in sys.path
root_dir = Path(__file__).resolve().parent.parent.parent
backend_dir = Path(__file__).resolve().parent.parent
for p in (str(root_dir), str(backend_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select
from httpx import AsyncClient, ASGITransport
import starlette.background

from backend.app.main import app
from backend.app.core.config import get_settings
from backend.app.core.security import sign_token
from backend.app.db.session import Base, get_db_session, get_db, _manager
from backend.app.db.models import Department, User, Grievance, Notification
from backend.app.services.email_service import send_status_update_email
from backend.app.services.webhook_service import dispatch_webhook_alert


class TaskRecorder:
    """Spies on FastAPI/Starlette BackgroundTasks.add_task to inspect enqueued tasks."""
    def __init__(self):
        self.enqueued_tasks = []
        self._orig_add_task = starlette.background.BackgroundTasks.add_task
        self._patch = None

    def start(self):
        recorder = self
        def spy_add_task(self_bt, func, *args, **kwargs):
            recorder.enqueued_tasks.append({
                "func": func,
                "func_name": getattr(func, "__name__", str(func)),
                "args": args,
                "kwargs": kwargs,
            })
            return recorder._orig_add_task(self_bt, func, *args, **kwargs)
        self._patch = unittest.mock.patch.object(
            starlette.background.BackgroundTasks, "add_task", spy_add_task
        )
        self._patch.start()

    def stop(self):
        if self._patch:
            self._patch.stop()

    def clear(self):
        self.enqueued_tasks.clear()

    def find_tasks_by_name(self, name: str):
        return [t for t in self.enqueued_tasks if t["func_name"] == name]


async def run_empirical_verification():
    db_file = "test_empirical_m3.db"
    db_path = root_dir / db_file
    if db_path.exists():
        try:
            os.remove(db_path)
        except Exception:
            pass

    test_db_url = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    print(f"\n[SETUP] Initializing isolated empirical database: {test_db_url}")

    test_engine = create_async_engine(test_db_url, echo=False)
    session_factory = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )

    # Point session manager and app dependencies to our test engine
    _manager._engine = test_engine
    _manager._session_factory = session_factory
    _manager._is_fallback_active = True
    _manager._active_url = test_db_url

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_db_session] = override_get_db

    # Create tables
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed required reference records
    async with session_factory() as session:
        depts = [
            Department(id="dept-it", name="IT & Network Services", code="IT", is_active=True),
            Department(id="dept-hostel", name="Hostel Administration", code="HOSTEL", is_active=True),
            Department(id="dept-infra", name="Campus Infrastructure", code="INFRA", is_active=True),
            Department(id="dept-general", name="General Administration", code="GEN", is_active=True),
        ]
        session.add_all(depts)

        admin_user = User(
            id="usr-super-admin-01",
            email="admin@campus.edu",
            name="Campus Administrator",
            role="SUPER_ADMIN",
            password_hash="$2b$12$dummyhashforverification12345",
            is_active=True,
        )
        session.add(admin_user)
        await session.commit()
    print("[SETUP] Schema created and reference departments & admin user seeded successfully.")

    # Create Admin Auth Headers
    admin_token = sign_token({
        "id": "usr-super-admin-01",
        "email": "admin@campus.edu",
        "role": "SUPER_ADMIN",
    })
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    recorder = TaskRecorder()
    recorder.start()

    transport = ASGITransport(app=app)
    results = []

    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:

            # ----------------------------------------------------------------
            # TEST 1: POST /api/v1/grievances (Normal Ticket)
            # ----------------------------------------------------------------
            print("\n" + "=" * 70)
            print("TEST 1: Normal Ticket Submission -> Email Enqueued, No Webhook")
            print("=" * 70)
            recorder.clear()

            normal_payload = {
                "title": "Study Chair Broken",
                "description": "Study chair on 2nd floor library reading room has a broken armrest and wobbles",
                "category": "Classroom & Lab Facilities",
                "departmentId": "dept-infra",
                "studentEmail": "student.normal@campus.edu",
                "studentName": "Normal Student",
                "studentType": "hosteller",
                "priority": "MEDIUM",
            }

            resp = await client.post("/api/v1/grievances", json=normal_payload)
            print(f"Response Status: {resp.status_code}")
            assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
            data = resp.json()
            normal_id = data["id"]
            normal_ticket_no = data["ticket_no"]
            print(f"Created Grievance ID: {normal_id}, Ticket No: {normal_ticket_no}")
            print(f"Status: {data['status']}, Priority: {data['priority']}")

            email_tasks = recorder.find_tasks_by_name("send_status_update_email")
            webhook_tasks = recorder.find_tasks_by_name("dispatch_webhook_alert")

            print(f"Enqueued email tasks count: {len(email_tasks)}")
            print(f"Enqueued webhook tasks count: {len(webhook_tasks)}")

            assert len(email_tasks) == 1, f"Expected 1 email task enqueued, got {len(email_tasks)}"
            assert email_tasks[0]["args"][0] == normal_id, "Grievance ID mismatch in email task args"
            assert email_tasks[0]["args"][1] == "student.normal@campus.edu", "Recipient email mismatch in email task args"
            assert email_tasks[0]["args"][3] == "PRIMARY", f"Expected new_status 'PRIMARY', got {email_tasks[0]['args'][3]}"
            assert len(webhook_tasks) == 0, f"Expected 0 webhook tasks for normal ticket, got {len(webhook_tasks)}"

            print(" [PASS] TEST 1: Normal ticket correctly enqueued status email and no webhook alert.")
            results.append(("Test 1: Normal Ticket Submission", True, "Status email enqueued; 0 webhooks"))

            # ----------------------------------------------------------------
            # TEST 2: POST /api/v1/grievances (Critical Ticket)
            # ----------------------------------------------------------------
            print("\n" + "=" * 70)
            print("TEST 2: Critical Ticket Submission -> Email + Critical Webhook Alert")
            print("=" * 70)
            recorder.clear()

            crit_payload = {
                "title": "Severe Electrical Short Circuit",
                "description": "Main electrical switchboard on ground floor corridor sparking with smoke and flames",
                "category": "Electrical & AC",
                "departmentId": "dept-infra",
                "studentEmail": "student.crit@campus.edu",
                "studentName": "Alert Student",
                "studentType": "hosteller",
                "priority": "CRITICAL",
            }

            resp = await client.post("/api/v1/grievances", json=crit_payload)
            print(f"Response Status: {resp.status_code}")
            assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
            data = resp.json()
            crit_id = data["id"]
            crit_priority = data["priority"]
            print(f"Created Grievance ID: {crit_id}, Priority: {crit_priority}")

            email_tasks = recorder.find_tasks_by_name("send_status_update_email")
            webhook_tasks = recorder.find_tasks_by_name("dispatch_webhook_alert")

            print(f"Enqueued email tasks count: {len(email_tasks)}")
            print(f"Enqueued webhook tasks count: {len(webhook_tasks)}")

            assert len(email_tasks) == 1, f"Expected 1 email task, got {len(email_tasks)}"
            assert len(webhook_tasks) == 1, f"Expected 1 webhook task for CRITICAL ticket, got {len(webhook_tasks)}"
            wh_task = webhook_tasks[0]
            assert wh_task["args"][0] == "grievance.critical", f"Expected event 'grievance.critical', got {wh_task['args'][0]}"
            assert wh_task["args"][1]["id"] == crit_id, "Webhook payload grievance ID mismatch"
            assert wh_task["args"][1]["priority"] == "CRITICAL", "Webhook payload priority mismatch"

            print(" [PASS] TEST 2: Critical ticket correctly enqueued both email and critical webhook alert.")
            results.append(("Test 2: Critical Ticket Submission", True, "Email + grievance.critical webhook enqueued"))

            # ----------------------------------------------------------------
            # TEST 3: 3 Successive Duplicates -> duplicate_count = 3 & Cluster Webhook Alert
            # ----------------------------------------------------------------
            print("\n" + "=" * 70)
            print("TEST 3: Successive Duplicate Submissions & Duplicate Cluster Alert")
            print("=" * 70)
            recorder.clear()

            cluster_desc = "Wi-Fi access point in hostel block C third floor corridor is completely offline and not connecting"

            # 3.1: Submit Parent Ticket
            parent_payload = {
                "title": "Hostel Wi-Fi Down (Parent)",
                "description": cluster_desc,
                "category": "Hostel Wi-Fi & Internet",
                "departmentId": "dept-it",
                "studentEmail": "student.p@campus.edu",
                "studentName": "Parent Reporter",
                "studentType": "hosteller",
                "priority": "MEDIUM",
            }
            resp_p = await client.post("/api/v1/grievances", json=parent_payload)
            assert resp_p.status_code == 201, f"Expected 201 for parent ticket, got {resp_p.status_code}"
            parent_data = resp_p.json()
            parent_id = parent_data["id"]
            print(f"Parent Ticket Created: {parent_id}, Duplicate Count: {parent_data.get('duplicate_count', 0)}")
            assert parent_data.get("duplicate_count", 0) == 0

            # Verify no cluster webhook on parent
            wh_tasks_p = [t for t in recorder.find_tasks_by_name("dispatch_webhook_alert") if t["args"][0] == "grievance.duplicate_cluster"]
            assert len(wh_tasks_p) == 0, "No duplicate cluster alert should be triggered on parent creation"

            # 3.2: Submit Duplicate #1
            recorder.clear()
            dup1_payload = {
                "title": "Hostel Wi-Fi Down (Duplicate 1)",
                "description": cluster_desc,
                "category": "Hostel Wi-Fi & Internet",
                "departmentId": "dept-it",
                "studentEmail": "student.d1@campus.edu",
                "studentName": "Dup Reporter 1",
                "studentType": "hosteller",
            }
            resp_d1 = await client.post("/api/v1/grievances", json=dup1_payload)
            assert resp_d1.status_code == 201
            d1_data = resp_d1.json()
            print(f"Dup 1 ID: {d1_data['id']}, status: {d1_data['status']}, duplicate_of_id: {d1_data['duplicate_of_id']}")
            assert d1_data["duplicate_of_id"] == parent_id, f"Expected duplicate_of_id={parent_id}, got {d1_data['duplicate_of_id']}"
            assert d1_data["status"] == "MERGED_AUTOMATIC"
            assert d1_data["intercepted_by_dedup"] is True

            # Verify parent duplicate_count == 1 in DB
            async with session_factory() as session:
                p_row = await session.get(Grievance, parent_id)
                print(f"Parent duplicate_count in DB after Dup 1: {p_row.duplicate_count}")
                assert p_row.duplicate_count == 1, f"Expected count 1, got {p_row.duplicate_count}"

            wh_tasks_d1 = [t for t in recorder.find_tasks_by_name("dispatch_webhook_alert") if t["args"][0] == "grievance.duplicate_cluster"]
            assert len(wh_tasks_d1) == 0, "Cluster alert should NOT trigger at duplicate_count == 1"

            # 3.3: Submit Duplicate #2
            recorder.clear()
            dup2_payload = {
                "title": "Hostel Wi-Fi Down (Duplicate 2)",
                "description": cluster_desc,
                "category": "Hostel Wi-Fi & Internet",
                "departmentId": "dept-it",
                "studentEmail": "student.d2@campus.edu",
                "studentName": "Dup Reporter 2",
                "studentType": "hosteller",
            }
            resp_d2 = await client.post("/api/v1/grievances", json=dup2_payload)
            assert resp_d2.status_code == 201
            d2_data = resp_d2.json()
            assert d2_data["duplicate_of_id"] == parent_id

            async with session_factory() as session:
                p_row = await session.get(Grievance, parent_id)
                print(f"Parent duplicate_count in DB after Dup 2: {p_row.duplicate_count}")
                assert p_row.duplicate_count == 2, f"Expected count 2, got {p_row.duplicate_count}"

            wh_tasks_d2 = [t for t in recorder.find_tasks_by_name("dispatch_webhook_alert") if t["args"][0] == "grievance.duplicate_cluster"]
            assert len(wh_tasks_d2) == 0, "Cluster alert should NOT trigger at duplicate_count == 2"

            # 3.4: Submit Duplicate #3
            recorder.clear()
            dup3_payload = {
                "title": "Hostel Wi-Fi Down (Duplicate 3)",
                "description": cluster_desc,
                "category": "Hostel Wi-Fi & Internet",
                "departmentId": "dept-it",
                "studentEmail": "student.d3@campus.edu",
                "studentName": "Dup Reporter 3",
                "studentType": "hosteller",
            }
            resp_d3 = await client.post("/api/v1/grievances", json=dup3_payload)
            assert resp_d3.status_code == 201
            d3_data = resp_d3.json()
            assert d3_data["duplicate_of_id"] == parent_id

            async with session_factory() as session:
                p_row = await session.get(Grievance, parent_id)
                print(f"Parent duplicate_count in DB after Dup 3: {p_row.duplicate_count}")
                assert p_row.duplicate_count == 3, f"Expected count 3, got {p_row.duplicate_count}"

            wh_tasks_d3 = [t for t in recorder.find_tasks_by_name("dispatch_webhook_alert") if t["args"][0] == "grievance.duplicate_cluster"]
            print(f"Enqueued grievance.duplicate_cluster webhook tasks count: {len(wh_tasks_d3)}")
            assert len(wh_tasks_d3) == 1, f"Expected exactly 1 duplicate cluster alert when count reaches 3, got {len(wh_tasks_d3)}"

            cluster_alert = wh_tasks_d3[0]
            assert cluster_alert["args"][0] == "grievance.duplicate_cluster"
            cluster_parent_data = cluster_alert["args"][1]
            assert cluster_parent_data["id"] == parent_id
            assert cluster_parent_data["duplicate_count"] == 3

            print(" [PASS] TEST 3: Duplicate count incremented 0->1->2->3 and triggered grievance.duplicate_cluster webhook alert.")
            results.append(("Test 3: Duplicate Submissions & Cluster Alert", True, "duplicate_count reached 3; cluster webhook enqueued"))

            # ----------------------------------------------------------------
            # TEST 4: PATCH /api/v1/grievances/{id}/status (Normal Status Update)
            # ----------------------------------------------------------------
            print("\n" + "=" * 70)
            print("TEST 4: PATCH Status Update -> Email Enqueued, No Webhook")
            print("=" * 70)
            recorder.clear()

            patch_payload = {
                "status": "IN_PROGRESS",
                "adminNotes": "Electrician dispatched to check switchboard",
            }
            resp_patch = await client.patch(
                f"/api/v1/grievances/{normal_id}/status",
                json=patch_payload,
                headers=admin_headers,
            )
            print(f"Patch Response Status: {resp_patch.status_code}")
            assert resp_patch.status_code == 200, f"Expected 200, got {resp_patch.status_code}: {resp_patch.text}"
            patched_data = resp_patch.json()["grievance"]
            assert patched_data["status"] == "IN_PROGRESS"
            assert patched_data["admin_notes"] == "Electrician dispatched to check switchboard"

            email_tasks = recorder.find_tasks_by_name("send_status_update_email")
            webhook_tasks = recorder.find_tasks_by_name("dispatch_webhook_alert")
            print(f"Enqueued email tasks: {len(email_tasks)}")
            print(f"Enqueued webhook tasks: {len(webhook_tasks)}")

            assert len(email_tasks) == 1, "Status update email must be enqueued"
            assert email_tasks[0]["args"][0] == normal_id
            assert email_tasks[0]["args"][1] == "student.normal@campus.edu"
            assert email_tasks[0]["args"][2] == "PRIMARY"  # old_status
            assert email_tasks[0]["args"][3] == "IN_PROGRESS"  # new_status
            assert email_tasks[0]["args"][4] == "Electrician dispatched to check switchboard"  # notes
            assert len(webhook_tasks) == 0, "No webhook alert should be enqueued for normal status change"

            print(" [PASS] TEST 4: PATCH status update correctly enqueued status email with old/new status.")
            results.append(("Test 4: PATCH Status Update", True, "Email enqueued with old/new status; 0 webhooks"))

            # ----------------------------------------------------------------
            # TEST 5: PATCH /api/v1/grievances/{id}/status (Update to CRITICAL)
            # ----------------------------------------------------------------
            print("\n" + "=" * 70)
            print("TEST 5: PATCH Status to CRITICAL -> Email + Critical Webhook Alert")
            print("=" * 70)
            recorder.clear()

            crit_patch_payload = {
                "status": "CRITICAL",
                "priority": "CRITICAL",
                "adminNotes": "Immediate hazard detected, escalating priority to CRITICAL",
            }
            resp_crit_patch = await client.patch(
                f"/api/v1/grievances/{normal_id}/status",
                json=crit_patch_payload,
                headers=admin_headers,
            )
            print(f"Patch Response Status: {resp_crit_patch.status_code}")
            assert resp_crit_patch.status_code == 200, f"Expected 200, got {resp_crit_patch.status_code}: {resp_crit_patch.text}"
            crit_patched_data = resp_crit_patch.json()["grievance"]
            assert crit_patched_data["priority"] == "CRITICAL"
            assert crit_patched_data["status"] == "CRITICAL"

            email_tasks = recorder.find_tasks_by_name("send_status_update_email")
            webhook_tasks = recorder.find_tasks_by_name("dispatch_webhook_alert")
            print(f"Enqueued email tasks: {len(email_tasks)}")
            print(f"Enqueued webhook tasks: {len(webhook_tasks)}")

            assert len(email_tasks) == 1, "Status update email must be enqueued"
            assert len(webhook_tasks) == 1, "Critical webhook alert must be enqueued on escalation to CRITICAL"
            wh_task = webhook_tasks[0]
            assert wh_task["args"][0] == "grievance.critical"
            assert wh_task["args"][1]["id"] == normal_id

            print(" [PASS] TEST 5: PATCH escalation to CRITICAL enqueued both status email and critical webhook alert.")
            results.append(("Test 5: PATCH Escalation to CRITICAL", True, "Email + grievance.critical webhook enqueued"))

            # ----------------------------------------------------------------
            # TEST 6: Simulated SMTP Failures Do NOT Raise Exceptions or Fail API
            # ----------------------------------------------------------------
            print("\n" + "=" * 70)
            print("TEST 6: Simulated SMTP Failures (Direct Call & API Call Resilience)")
            print("=" * 70)

            settings = get_settings()

            # 6.1 Direct function test with SMTP error
            print("6.1 Testing send_status_update_email direct execution with simulated SMTPConnectError...")
            with unittest.mock.patch.object(settings, "gmail_user", "test_sender@campus.edu"), \
                 unittest.mock.patch.object(settings, "gmail_app_password", "test_app_pass_xyz"), \
                 unittest.mock.patch("smtplib.SMTP_SSL") as mock_smtp:
                mock_smtp.side_effect = smtplib.SMTPConnectError(111, "Connection refused: SMTP port unreachable")

                # Must not raise an exception, must return True (graceful fallback)
                email_result = await send_status_update_email(
                    grievance_id=normal_id,
                    student_email="student.test@campus.edu",
                    old_status="IN_PROGRESS",
                    new_status="RESOLVED",
                    notes="Direct SMTP failure test",
                )
                print(f"send_status_update_email returned: {email_result}")
                assert email_result is True, "Expected True on graceful fallback after SMTP error"

            # 6.2 API endpoint test with SMTP failure in background task
            print("6.2 Testing POST /api/v1/grievances while SMTP raises timeout...")
            with unittest.mock.patch.object(settings, "gmail_user", "test_sender@campus.edu"), \
                 unittest.mock.patch.object(settings, "gmail_app_password", "test_app_pass_xyz"), \
                 unittest.mock.patch("smtplib.SMTP_SSL") as mock_smtp:
                mock_smtp.side_effect = TimeoutError("SMTP socket connect timed out after 5.0s")

                smtp_fail_payload = {
                    "title": "Washroom tap dripping",
                    "description": "Washroom tap in ground floor washroom block A is dripping continuously",
                    "category": "Plumbing & Water",
                    "departmentId": "dept-infra",
                    "studentEmail": "student.smtp_fail@campus.edu",
                    "priority": "LOW",
                }

                # API call must still succeed with 201
                resp_smtp_fail = await client.post("/api/v1/grievances", json=smtp_fail_payload)
                print(f"POST API Status during SMTP failure: {resp_smtp_fail.status_code}")
                assert resp_smtp_fail.status_code == 201, f"Expected 201, got {resp_smtp_fail.status_code}: {resp_smtp_fail.text}"
                assert "ticket_no" in resp_smtp_fail.json()

            print(" [PASS] TEST 6: Simulated SMTP failures handled gracefully without raising exceptions or failing API response.")
            results.append(("Test 6: SMTP Failure Resilience", True, "send_status_update_email & POST returned 201 despite SMTP errors"))

            # ----------------------------------------------------------------
            # TEST 7: Simulated Webhook HTTP Failures Do NOT Raise Exceptions or Fail API
            # ----------------------------------------------------------------
            print("\n" + "=" * 70)
            print("TEST 7: Simulated Webhook HTTP Failures (Direct Call & API Call Resilience)")
            print("=" * 70)

            # 7.1 Direct dispatch test with httpx network error
            print("7.1 Testing dispatch_webhook_alert direct execution with simulated httpx.ConnectError...")
            test_wh_data = {
                "id": "tkt-wh-err-01",
                "ticket_no": "GRV-2026-WHERR-001",
                "category": "Electrical & AC",
                "priority": "CRITICAL",
                "description": "High voltage transformer spark",
                "assigned_department_id": "dept-infra",
                "duplicate_count": 0,
            }

            with unittest.mock.patch("httpx.AsyncClient.post") as mock_http_post:
                mock_http_post.side_effect = httpx.ConnectError("Failed to establish a new connection: [Errno 111] Connection refused")

                wh_res = await dispatch_webhook_alert("grievance.critical", test_wh_data)
                print(f"dispatch_webhook_alert returned: success={wh_res.get('success')}, event={wh_res.get('event_type')}")
                assert wh_res.get("success") is True, "Expected success=True on graceful fallback"

            # 7.2 Direct dispatch test with simulated HTTP 500 error response
            print("7.2 Testing dispatch_webhook_alert direct execution with simulated HTTP 500 server response...")
            mock_500_resp = httpx.Response(status_code=500, json={"error": "Slack/Discord webhook endpoint down"})
            with unittest.mock.patch("httpx.AsyncClient.post", return_value=mock_500_resp):
                wh_res_500 = await dispatch_webhook_alert("grievance.critical", test_wh_data)
                print(f"dispatch_webhook_alert 500 returned: success={wh_res_500.get('success')}")
                assert wh_res_500.get("success") is True

            # 7.3 API endpoint test with Webhook HTTP failure during CRITICAL creation & patch
            print("7.3 Testing POST & PATCH with priority=CRITICAL while webhook client fails...")
            with unittest.mock.patch("httpx.AsyncClient.post") as mock_http_post:
                mock_http_post.side_effect = httpx.TimeoutException("Webhook POST timed out after 3.5s")

                crit_fail_payload = {
                    "title": "Corridor Fire Alarm",
                    "description": "Fire alarm ringing continuously with burnt plastic smell on 4th floor",
                    "category": "Electrical & AC",
                    "departmentId": "dept-infra",
                    "studentEmail": "student.crit_wh_fail@campus.edu",
                    "priority": "CRITICAL",
                }

                resp_wh_fail = await client.post("/api/v1/grievances", json=crit_fail_payload)
                print(f"POST API Status during Webhook failure: {resp_wh_fail.status_code}")
                assert resp_wh_fail.status_code == 201, f"Expected 201, got {resp_wh_fail.status_code}: {resp_wh_fail.text}"
                fail_tkt_id = resp_wh_fail.json()["id"]

                # Now patch to CRITICAL while webhook fails
                resp_patch_wh_fail = await client.patch(
                    f"/api/v1/grievances/{fail_tkt_id}/status",
                    json={"status": "CRITICAL", "priority": "CRITICAL", "adminNotes": "Re-escalation test"},
                    headers=admin_headers,
                )
                print(f"PATCH API Status during Webhook failure: {resp_patch_wh_fail.status_code}")
                assert resp_patch_wh_fail.status_code == 200, f"Expected 200, got {resp_patch_wh_fail.status_code}: {resp_patch_wh_fail.text}"

            print(" [PASS] TEST 7: Simulated Webhook HTTP failures handled gracefully without raising exceptions or failing API response.")
            results.append(("Test 7: Webhook HTTP Failure Resilience", True, "dispatch_webhook_alert, POST, & PATCH returned 200/201 despite HTTP errors"))

    finally:
        recorder.stop()
        app.dependency_overrides.clear()
        await test_engine.dispose()
        # Clean up database file
        if db_path.exists():
            try:
                os.remove(db_path)
                print(f"\n[CLEANUP] Removed temporary test database: {db_path}")
            except Exception as e:
                print(f"\n[CLEANUP WARNING] Could not remove {db_path}: {e}")

    # Print summary
    print("\n" + "=" * 70)
    print("EMPIRICAL TEST SUMMARY:")
    print("=" * 70)
    all_passed = True
    for name, passed, detail in results:
        status_str = "PASS" if passed else "FAIL"
        print(f"[{status_str}] {name} -> {detail}")
        if not passed:
            all_passed = False

    print("=" * 70)
    if all_passed:
        print("ALL 7 EMPIRICAL TEST SUITES PASSED (100% SUCCESS RATE).")
        return 0
    else:
        print("SOME TESTS FAILED.")
        return 1


if __name__ == "__main__":
    code = asyncio.run(run_empirical_verification())
    sys.exit(code)
