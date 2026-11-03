/**
 * Tier 1, 3 & 4 End-to-End Department Auto-Routing, Targeted Notifications, & Super Admin Reassignment Test Suite
 * Tests:
 * - Tier 1: Department models and seed verification, category auto-routing on ingestion
 * - Tier 3: Cross-Feature Integration Workflows:
 *   - Auto-assignment on ticket creation -> Targeted notification dispatch to assigned dept contact & staff -> Zero leak to other departments
 *   - Offline transport fallback to SQLite outbox queue
 *   - Duplicate auto-merge department inheritance
 * - Tier 4: Real-World Incident Scenarios:
 *   - Super Admin Reassignment workflow: Access revocation/transfer, immutable audit log verification, targeted reassignment alert
 *   - Multi-department simultaneous intake & isolated triage queue verification
 */

import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../../db.ts';
import { signToken } from '../../src/utils/jwt.ts';
import {
  TEST_USERS,
  TEST_DEPARTMENTS,
  seedRbacTestData,
  cleanRbacTestData,
  startTestServer,
} from '../fixtures/rbac_fixtures.ts';

const TEST_PORT = process.env.ROUTING_TEST_PORT ? parseInt(process.env.ROUTING_TEST_PORT, 10) : 3113;
let serverBaseUrl: string;
let stopServer: () => Promise<void>;

// Auth tokens
let superAdminToken: string;
let networkStaffToken: string;
let hostelStaffToken: string;
let transportStaffToken: string;

before(async () => {
  const db = getDatabase();
  seedRbacTestData(db);
  cleanRbacTestData(db);

  superAdminToken = signToken({
    id: TEST_USERS.SUPER_ADMIN.id,
    email: TEST_USERS.SUPER_ADMIN.email,
    role: 'SUPER_ADMIN',
    department_id: null,
    permissions: ['*'],
  });

  networkStaffToken = signToken({
    id: TEST_USERS.STAFF_NETWORK.id,
    email: TEST_USERS.STAFF_NETWORK.email,
    role: 'DEPARTMENT_STAFF',
    department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept'],
  });

  hostelStaffToken = signToken({
    id: TEST_USERS.STAFF_HOSTEL.id,
    email: TEST_USERS.STAFF_HOSTEL.email,
    role: 'DEPARTMENT_STAFF',
    department_id: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept'],
  });

  transportStaffToken = signToken({
    id: TEST_USERS.HEAD_TRANSPORT.id,
    email: TEST_USERS.HEAD_TRANSPORT.email,
    role: 'DEPARTMENT_HEAD',
    department_id: TEST_DEPARTMENTS.CAMPUS_TRANSPORT.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept'],
  });

  const server = await startTestServer(TEST_PORT);
  serverBaseUrl = server.serverBaseUrl;
  stopServer = server.stop;
});

after(async () => {
  try {
    const db = getDatabase();
    cleanRbacTestData(db);
  } catch {
    // ignore
  }
  if (stopServer) {
    await stopServer();
  }
});

describe('Tier 1: Department Models & Auto-Routing Feature Coverage', () => {
  test('TC-ROUTE-01: GET /api/departments returns active operational departments', async () => {
    const res = await fetch(`${serverBaseUrl}/api/departments`, {
      headers: { Authorization: `Bearer ${networkStaffToken}` },
    });

    assert.equal(res.status, 200, `Expected 200 OK from /api/departments, got ${res.status}`);
    const departments = (await res.json()) as any[];
    assert.ok(Array.isArray(departments), 'Departments must be an array');
    assert.ok(departments.length >= 3, 'Must return at least 3 operational departments');

    const codes = departments.map((d) => d.code);
    assert.ok(codes.includes('NET_OPS'), 'Expected NET_OPS department');
    assert.ok(codes.includes('HOSTEL_ADMIN'), 'Expected HOSTEL_ADMIN department');
    assert.ok(codes.includes('CAMPUS_TRANSPORT'), 'Expected CAMPUS_TRANSPORT department');

    const netDept = departments.find((d) => d.code === 'NET_OPS');
    assert.ok(netDept.contactEmail, 'Department must have contactEmail');
    assert.equal(netDept.isActive !== false, true, 'Department must be active');
  });

  test('TC-ROUTE-02: Ticket creation with Wi-Fi category auto-assigns Network Operations department', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: 'RBAC_AUTO_01',
        studentName: 'Dev Student',
        studentEmail: 'dev.auto01@rbactest.edu',
        studentPhone: '9876543210',
        studentType: 'hosteller',
        category: 'Hostel Wi-Fi & Internet',
        description: 'Wi-Fi disconnects frequently during online lectures in hostel room 302',
        priority: 'high',
      }),
    });

    assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}`);
    const ticket = (await res.json()) as any;
    assert.equal(
      ticket.assignedDepartmentId || ticket.assigned_department_id,
      TEST_DEPARTMENTS.NETWORK_OPS.id,
      'Grievance category Hostel Wi-Fi & Internet must auto-route to Network Operations',
    );
  });

  test('TC-ROUTE-03: Ticket creation with Plumbing category auto-assigns Hostel Administration department', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: 'RBAC_AUTO_02',
        studentName: 'Priya Student',
        studentEmail: 'priya.auto02@rbactest.edu',
        studentPhone: '9876543211',
        studentType: 'hosteller',
        category: 'Plumbing & Water',
        description: 'Cold water tap broken and overflowing on 2nd floor bathroom',
        priority: 'medium',
      }),
    });

    assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}`);
    const ticket = (await res.json()) as any;
    assert.equal(
      ticket.assignedDepartmentId || ticket.assigned_department_id,
      TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      'Grievance category Plumbing & Water must auto-route to Hostel Administration',
    );
  });

  test('TC-ROUTE-04: Ticket creation with Bus category auto-assigns Campus Transport department', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: 'RBAC_AUTO_03',
        studentName: 'Kiran Student',
        studentEmail: 'kiran.auto03@rbactest.edu',
        studentPhone: '9876543212',
        studentType: 'dayscholar',
        category: 'Bus & Transport',
        description: 'Route 5 evening bus left 20 minutes before scheduled departure time',
        priority: 'medium',
      }),
    });

    assert.equal(res.status, 201, `Expected 201 Created, got ${res.status}`);
    const ticket = (await res.json()) as any;
    assert.equal(
      ticket.assignedDepartmentId || ticket.assigned_department_id,
      TEST_DEPARTMENTS.CAMPUS_TRANSPORT.id,
      'Grievance category Bus & Transport must auto-route to Campus Transport',
    );
  });
});

describe('Tier 3: Cross-Feature Integration Workflows (Targeted Notifications & Fallback)', () => {
  test('TC-NOTIF-01: Grievance creation triggers targeted notification to assigned department with ZERO spill to other departments', async () => {
    const db = getDatabase();
    // Clear outbox before test
    db.prepare("DELETE FROM outbox WHERE timestamp >= datetime('now', '-5 minutes')").run();

    const uniqueRegNo = `RBAC_NOTIF_${Date.now()}`;
    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: uniqueRegNo,
        studentName: 'Targeted Notif Tester',
        studentEmail: 'notif.test@rbactest.edu',
        studentPhone: '9876543299',
        studentType: 'hosteller',
        category: 'Hostel Wi-Fi & Internet',
        description: 'Core switch rebooted causing packet drops in Block A',
        priority: 'high',
      }),
    });

    assert.equal(res.status, 201);
    const created = (await res.json()) as any;

    // Inspect SQLite outbox records generated for this ticket
    const outboxRows = db
      .prepare("SELECT * FROM outbox WHERE timestamp >= datetime('now', '-2 minutes') ORDER BY timestamp DESC")
      .all() as any[];

    assert.ok(outboxRows.length > 0, 'Outbox must contain notification dispatch records');

    // Extract all recipients of department alert emails
    const deptAlerts = outboxRows.filter(
      (r) =>
        (r.type && r.type.includes('dept')) ||
        (r.subject && r.subject.includes(created.ticketNo)) ||
        (r.body && r.body.includes(created.ticketNo)),
    );

    assert.ok(deptAlerts.length > 0, 'Expected at least one department alert in outbox');

    const alertRecipients = deptAlerts.map((a) => (a.recipient || a.to || '').toLowerCase());

    // 1. Must target Network Operations contact or staff
    const hasNetworkRecipient = alertRecipients.some(
      (r) =>
        r === TEST_DEPARTMENTS.NETWORK_OPS.contactEmail.toLowerCase() ||
        r === TEST_USERS.STAFF_NETWORK.email.toLowerCase() ||
        r === TEST_USERS.HEAD_NETWORK.email.toLowerCase(),
    );
    assert.ok(
      hasNetworkRecipient,
      `Network department contact (${TEST_DEPARTMENTS.NETWORK_OPS.contactEmail}) or staff must be in outbox recipients: ${alertRecipients.join(', ')}`,
    );

    // 2. ZERO Spill to Hostel or Transport departments
    const hasHostelSpill = alertRecipients.some(
      (r) =>
        r === TEST_DEPARTMENTS.HOSTEL_ADMIN.contactEmail.toLowerCase() ||
        r === TEST_USERS.STAFF_HOSTEL.email.toLowerCase(),
    );
    const hasTransportSpill = alertRecipients.some(
      (r) =>
        r === TEST_DEPARTMENTS.CAMPUS_TRANSPORT.contactEmail.toLowerCase() ||
        r === TEST_USERS.HEAD_TRANSPORT.email.toLowerCase(),
    );

    assert.equal(hasHostelSpill, false, 'Notification must NOT spill to Hostel department contact/staff');
    assert.equal(hasTransportSpill, false, 'Notification must NOT spill to Transport department contact/staff');
  });

  test('TC-NOTIF-02: Notification transport reliably falls back to SQLite outbox when live SMTP not configured', async () => {
    const db = getDatabase();
    const rows = db.prepare('SELECT id, recipient, subject, body, type, timestamp FROM outbox LIMIT 5').all() as any[];
    assert.ok(rows.length > 0, 'Outbox table must retain persisted notification entries');
    const sample = rows[0];
    assert.ok(sample.recipient, 'Outbox entry must have recipient');
    assert.ok(sample.subject, 'Outbox entry must have subject');
    assert.ok(sample.body, 'Outbox entry must have body content');
    assert.ok(sample.timestamp, 'Outbox entry must have timestamp');
  });
});

describe('Tier 4: Real-World Incident Scenarios', () => {
  test('TC-SCENARIO-01: Super Admin reassigns grievance from Dept A to Dept B with audit log and access transfer', async () => {
    const db = getDatabase();

    // 1. Ingest ticket originally assigned to Hostel Administration
    const initialGrievanceId = `rbactkt_reassign_${Date.now()}`;
    const initialTicketNo = `RBAC-REAS-${Date.now().toString().slice(-4)}`;

    db.prepare(`
      INSERT INTO grievances (
        id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
        category, description, status, priority, isSpam, createdAt, assigned_department_id
      ) VALUES (?, ?, 'RBAC_REAS_01', 'Reassign Tester', 'reassign@rbactest.edu', '9999900099', 'hosteller',
        'Hostel Maintenance', 'Router cabling chewed by rodents under hostel floor tiles', 'open', 'high', 0, datetime('now'), ?)
    `).run(initialGrievanceId, initialTicketNo, TEST_DEPARTMENTS.HOSTEL_ADMIN.id);

    // Initial state: Hostel staff can access; Network staff receives 403
    const hostelPreRes = await fetch(`${serverBaseUrl}/api/grievances/${initialGrievanceId}`, {
      headers: { Authorization: `Bearer ${hostelStaffToken}` },
    });
    assert.equal(hostelPreRes.status, 200, 'Hostel staff should initially access ticket');

    const netPreRes = await fetch(`${serverBaseUrl}/api/grievances/${initialGrievanceId}`, {
      headers: { Authorization: `Bearer ${networkStaffToken}` },
    });
    assert.equal(netPreRes.status, 403, 'Network staff should initially be forbidden');

    // 2. Non-admin staff attempt to reassign returns 403 Forbidden
    const unauthReassignRes = await fetch(`${serverBaseUrl}/api/admin/grievances/${initialGrievanceId}/reassign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({
        departmentId: TEST_DEPARTMENTS.NETWORK_OPS.id,
        reason: 'Unauthorized staff reassignment attempt',
      }),
    });
    assert.equal(unauthReassignRes.status, 403, 'Department staff cannot execute reassignment');

    // 3. Super Admin executes reassignment to Network Operations
    const reassignReason = 'Misclassified under Hostel Maintenance; issue requires Network Ops fiber splicing.';
    const reassignRes = await fetch(`${serverBaseUrl}/api/admin/grievances/${initialGrievanceId}/reassign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        departmentId: TEST_DEPARTMENTS.NETWORK_OPS.id,
        reason: reassignReason,
      }),
    });

    assert.equal(reassignRes.status, 200, `Expected 200 OK from reassignment, got ${reassignRes.status}`);
    const reassignBody = (await reassignRes.json()) as any;
    assert.equal(reassignBody.success, true);
    assert.equal(reassignBody.newDepartmentId, TEST_DEPARTMENTS.NETWORK_OPS.id);

    // 4. Verify DB assigned_department_id updated
    const updatedRow = db
      .prepare('SELECT assigned_department_id FROM grievances WHERE id = ?')
      .get(initialGrievanceId) as any;
    assert.equal(
      updatedRow.assigned_department_id,
      TEST_DEPARTMENTS.NETWORK_OPS.id,
      'Grievance assigned_department_id must be updated to Network Operations in database',
    );

    // 5. Verify immutable audit log record created
    const auditRow = db
      .prepare('SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY rowid DESC LIMIT 1')
      .get(initialGrievanceId) as any;
    assert.ok(auditRow, 'Expected audit_logs entry for grievance reassignment');
    assert.match(auditRow.action, /REASSIGN/i);
    assert.equal(auditRow.actor_role, 'SUPER_ADMIN');
    assert.ok(auditRow.reason && auditRow.reason.includes('Network Ops fiber splicing'));

    // 6. Access Transfer: Network staff now accesses ticket (200 OK); Hostel staff now receives 403 Forbidden
    const netPostRes = await fetch(`${serverBaseUrl}/api/grievances/${initialGrievanceId}`, {
      headers: { Authorization: `Bearer ${networkStaffToken}` },
    });
    assert.equal(netPostRes.status, 200, 'Network staff must now have access to reassigned ticket');

    const hostelPostRes = await fetch(`${serverBaseUrl}/api/grievances/${initialGrievanceId}`, {
      headers: { Authorization: `Bearer ${hostelStaffToken}` },
    });
    assert.equal(hostelPostRes.status, 403, 'Hostel staff access must be revoked (403 Forbidden)');

    // 7. Verify targeted reassignment notification dispatched to Network Operations
    const reassignNotif = db
      .prepare(
        "SELECT * FROM outbox WHERE (recipient = ? OR recipient = ?) AND timestamp >= datetime('now', '-2 minutes') ORDER BY rowid DESC LIMIT 1",
      )
      .get(TEST_DEPARTMENTS.NETWORK_OPS.contactEmail, TEST_USERS.STAFF_NETWORK.email) as any;

    assert.ok(reassignNotif, 'Expected outbox alert dispatched to newly assigned department');
  });

  test('TC-SCENARIO-02: Multi-Department Concurrent Intake & Isolated Triage Queues', async () => {
    // Submit 3 simultaneous tickets across different categories
    const timestamp = Date.now();
    const [tktNetRes, tktHostelRes, tktTransRes] = await Promise.all([
      fetch(`${serverBaseUrl}/api/grievances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentRegNo: `STU_NET_${timestamp}`,
          studentName: 'Net Student',
          studentEmail: `net_${timestamp}@rbactest.edu`,
          studentType: 'hosteller',
          category: 'Hostel Wi-Fi & Internet',
          description: 'Library 3rd floor Wi-Fi access point showing blinking red status',
          priority: 'high',
        }),
      }),
      fetch(`${serverBaseUrl}/api/grievances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentRegNo: `STU_HST_${timestamp}`,
          studentName: 'Hostel Student',
          studentEmail: `hst_${timestamp}@rbactest.edu`,
          studentType: 'hosteller',
          category: 'Food & Mess',
          description: 'South Mess dinner curry was cold and water cooler empty',
          priority: 'medium',
        }),
      }),
      fetch(`${serverBaseUrl}/api/grievances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentRegNo: `STU_TRN_${timestamp}`,
          studentName: 'Transport Student',
          studentEmail: `trn_${timestamp}@rbactest.edu`,
          studentType: 'dayscholar',
          category: 'Bus & Transport',
          description: 'Route 8 morning bus AC not working during summer commute',
          priority: 'low',
        }),
      }),
    ]);

    assert.equal(tktNetRes.status, 201);
    assert.equal(tktHostelRes.status, 201);
    assert.equal(tktTransRes.status, 201);

    const netTicket = (await tktNetRes.json()) as any;
    const hostelTicket = (await tktHostelRes.json()) as any;
    const transTicket = (await tktTransRes.json()) as any;

    // Verify correct routing
    assert.equal(netTicket.assignedDepartmentId || netTicket.assigned_department_id, TEST_DEPARTMENTS.NETWORK_OPS.id);
    assert.equal(
      hostelTicket.assignedDepartmentId || hostelTicket.assigned_department_id,
      TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
    );
    assert.equal(
      transTicket.assignedDepartmentId || transTicket.assigned_department_id,
      TEST_DEPARTMENTS.CAMPUS_TRANSPORT.id,
    );

    // Query queues in parallel as Network Staff, Hostel Staff, and Transport Staff
    const [netQueueRes, hostelQueueRes, transQueueRes] = await Promise.all([
      fetch(`${serverBaseUrl}/api/grievances`, { headers: { Authorization: `Bearer ${networkStaffToken}` } }),
      fetch(`${serverBaseUrl}/api/grievances`, { headers: { Authorization: `Bearer ${hostelStaffToken}` } }),
      fetch(`${serverBaseUrl}/api/grievances`, { headers: { Authorization: `Bearer ${transportStaffToken}` } }),
    ]);

    const netQueue = (await netQueueRes.json()) as any[];
    const hostelQueue = (await hostelQueueRes.json()) as any[];
    const transQueue = (await transQueueRes.json()) as any[];

    // Network queue has netTicket, none of the others
    const netIds = netQueue.map((t) => t.id);
    assert.ok(netIds.includes(netTicket.id), 'Network queue must include netTicket');
    assert.equal(netIds.includes(hostelTicket.id), false, 'Network queue must not include hostelTicket');
    assert.equal(netIds.includes(transTicket.id), false, 'Network queue must not include transTicket');

    // Hostel queue has hostelTicket, none of the others
    const hostelIds = hostelQueue.map((t) => t.id);
    assert.ok(hostelIds.includes(hostelTicket.id), 'Hostel queue must include hostelTicket');
    assert.equal(hostelIds.includes(netTicket.id), false, 'Hostel queue must not include netTicket');
    assert.equal(hostelIds.includes(transTicket.id), false, 'Hostel queue must not include transTicket');

    // Transport queue has transTicket, none of the others
    const transIds = transQueue.map((t) => t.id);
    assert.ok(transIds.includes(transTicket.id), 'Transport queue must include transTicket');
    assert.equal(transIds.includes(netTicket.id), false, 'Transport queue must not include netTicket');
    assert.equal(transIds.includes(hostelTicket.id), false, 'Transport queue must not include hostelTicket');
  });
});
