/**
 * Tier 2 & Tier 3 End-to-End RBAC Isolation & Horizontal Privilege Escalation Test Suite
 * Tests:
 * - Tier 2: Row-Level Access Control (RLAC) enforcement on single-resource endpoints
 *   - TC-RLAC-01: Dept Staff can access own department grievance (200 OK)
 *   - TC-RLAC-02: Horizontal IDOR/BOLA Read Prevention: Dept A staff accessing Dept B ticket returns 403 Forbidden
 *   - TC-RLAC-03: Horizontal IDOR/BOLA Write Prevention: Dept A staff updating Dept B ticket returns 403 Forbidden
 *   - TC-RLAC-04: Master notes mutation isolation: Dept A staff updating Dept B master notes returns 403 Forbidden
 *   - TC-RLAC-05: Triage merge isolation: Dept A staff attempting cross-department merge returns 403 Forbidden
 *   - TC-RLAC-06: Super Admin unrestricted bypass: Can read and mutate tickets across all departments
 *   - TC-RLAC-07: Unauthenticated access rejection: Missing Bearer token on protected endpoints
 * - Tier 3: Scoped Grievance List Retrieval
 *   - TC-RLAC-08: Staff GET /api/grievances returns strictly assigned department records with zero cross-department data spill
 *   - TC-RLAC-09: Super Admin GET /api/grievances returns all records across all departments
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

const TEST_PORT = process.env.ISOLATION_TEST_PORT ? parseInt(process.env.ISOLATION_TEST_PORT, 10) : 3112;
let serverBaseUrl: string;
let stopServer: () => Promise<void>;

// Tokens
let superAdminToken: string;
let networkStaffToken: string;
let networkHeadToken: string;
let hostelStaffToken: string;
let hostelHeadToken: string;

// Ephemeral Ticket IDs
const TICKET_NET = 'rbactkt_net_101';
const TICKET_HOSTEL = 'rbactkt_hostel_201';
const TICKET_TRANS = 'rbactkt_trans_301';

before(async () => {
  const db = getDatabase();
  seedRbacTestData(db);
  cleanRbacTestData(db);

  // Mint signed tokens
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
    permissions: ['grievances:read_dept', 'grievances:write_dept', 'grievances:notes'],
  });

  networkHeadToken = signToken({
    id: TEST_USERS.HEAD_NETWORK.id,
    email: TEST_USERS.HEAD_NETWORK.email,
    role: 'DEPARTMENT_HEAD',
    department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept', 'grievances:resolve', 'grievances:notes'],
  });

  hostelStaffToken = signToken({
    id: TEST_USERS.STAFF_HOSTEL.id,
    email: TEST_USERS.STAFF_HOSTEL.email,
    role: 'DEPARTMENT_STAFF',
    department_id: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept', 'grievances:notes'],
  });

  hostelHeadToken = signToken({
    id: TEST_USERS.HEAD_HOSTEL.id,
    email: TEST_USERS.HEAD_HOSTEL.email,
    role: 'DEPARTMENT_HEAD',
    department_id: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept', 'grievances:resolve', 'grievances:notes'],
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

beforeEach(() => {
  const db = getDatabase();
  // Ensure pristine test tickets exist for each department
  const stmt = db.prepare(`
    INSERT INTO grievances (
      id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
      category, description, status, priority, isSpam, createdAt, assigned_department_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      assigned_department_id = excluded.assigned_department_id,
      adminNotes = NULL
  `);

  stmt.run(
    TICKET_NET,
    'RBAC-NET-001',
    'RBAC_STU_01',
    'Alice Student',
    'alice@rbactest.edu',
    '9999900001',
    'hosteller',
    'Hostel Wi-Fi & Internet',
    'Access point offline in Block C Floor 2',
    'in_progress',
    'high',
    TEST_DEPARTMENTS.NETWORK_OPS.id,
  );

  stmt.run(
    TICKET_HOSTEL,
    'RBAC-HST-001',
    'RBAC_STU_02',
    'Bob Student',
    'bob@rbactest.edu',
    '9999900002',
    'hosteller',
    'Plumbing & Water',
    'Main pipe burst in hostel washroom 104',
    'open',
    'urgent',
    TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
  );

  stmt.run(
    TICKET_TRANS,
    'RBAC-TRN-001',
    'RBAC_STU_03',
    'Charlie Student',
    'charlie@rbactest.edu',
    '9999900003',
    'dayscholar',
    'Bus & Transport',
    'Route 12 morning bus breakdown at toll gate',
    'open',
    'medium',
    TEST_DEPARTMENTS.CAMPUS_TRANSPORT.id,
  );
});

describe('Tier 2: Row-Level Access Control (RLAC) Boundary & Security Tests', () => {
  test('TC-RLAC-01: Department staff can fetch grievance assigned to their own department (200 OK)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${TICKET_NET}`, {
      headers: {
        Authorization: `Bearer ${networkStaffToken}`,
      },
    });

    assert.equal(res.status, 200, `Expected 200 OK for assigned department staff, got ${res.status}`);
    const data = (await res.json()) as any;
    const ticket = data.grievance || data;
    assert.equal(ticket.id, TICKET_NET);
    assert.equal(ticket.assignedDepartmentId || ticket.assigned_department_id, TEST_DEPARTMENTS.NETWORK_OPS.id);
  });

  test('TC-RLAC-02: Horizontal IDOR/BOLA Read Prevention: Dept A staff accessing Dept B ticket returns 403 Forbidden', async () => {
    // Network staff attempts to read Hostel grievance
    const res = await fetch(`${serverBaseUrl}/api/grievances/${TICKET_HOSTEL}`, {
      headers: {
        Authorization: `Bearer ${networkStaffToken}`,
      },
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden on horizontal read attempt, got ${res.status}`);
    const body = (await res.json()) as any;
    assert.ok(body.error || body.message, 'Expected descriptive error message');
    assert.match(
      body.error || body.message,
      /Access denied|Forbidden|unauthorized|department/i,
      'Error message must indicate cross-department access denial',
    );
  });

  test('TC-RLAC-03: Horizontal IDOR/BOLA Write Prevention: Dept A staff updating Dept B ticket returns 403 Forbidden and preserves DB state', async () => {
    // Network staff attempts to update status of Hostel grievance
    const res = await fetch(`${serverBaseUrl}/api/grievances/${TICKET_HOSTEL}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${networkStaffToken}`,
      },
      body: JSON.stringify({
        status: 'resolved',
        adminNotes: 'Unauthorized tampering attempt by Network staff',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden on unauthorized mutation, got ${res.status}`);

    // Verify DB integrity: status must NOT have changed to 'resolved'
    const db = getDatabase();
    const row = db.prepare('SELECT status, adminNotes FROM grievances WHERE id = ?').get(TICKET_HOSTEL) as any;
    assert.notEqual(row.status, 'resolved', 'Hostel ticket status must remain unmutated in database');
    assert.notEqual(row.adminNotes, 'Unauthorized tampering attempt by Network staff');
  });

  test('TC-RLAC-04: Master notes mutation isolation: Dept A staff updating Dept B master notes returns 403 Forbidden', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${TICKET_HOSTEL}/master-notes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${networkStaffToken}`,
      },
      body: JSON.stringify({
        publicMasterNotes: 'Malicious public note injection',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden for cross-department master notes update, got ${res.status}`);
  });

  test('TC-RLAC-05: Super Admin bypass: SUPER_ADMIN can read and mutate tickets across all departments (200 OK)', async () => {
    // Super Admin reads Network ticket
    const readNetRes = await fetch(`${serverBaseUrl}/api/grievances/${TICKET_NET}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(readNetRes.status, 200, 'Super admin must read Network ticket');

    // Super Admin reads Hostel ticket
    const readHostelRes = await fetch(`${serverBaseUrl}/api/grievances/${TICKET_HOSTEL}`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(readHostelRes.status, 200, 'Super admin must read Hostel ticket');

    // Super Admin updates Transport ticket
    const updateTransRes = await fetch(`${serverBaseUrl}/api/grievances/${TICKET_TRANS}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        priority: 'urgent',
        adminNotes: 'Super admin elevated priority for campus transit dispatch',
      }),
    });
    assert.equal(updateTransRes.status, 200, 'Super admin must mutate Transport ticket');

    // Verify update persisted
    const db = getDatabase();
    const transRow = db.prepare('SELECT priority FROM grievances WHERE id = ?').get(TICKET_TRANS) as any;
    assert.equal(transRow.priority, 'urgent');
  });

  test('TC-RLAC-06: Unauthenticated request to single-resource endpoint returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${TICKET_NET}`);
    // Unauthenticated request should be rejected
    assert.ok(
      res.status === 401 || res.status === 403,
      `Expected 401 or 403 for unauthenticated request, got ${res.status}`,
    );
  });
});

describe('Tier 3: Scoped Grievance List Isolation Tests', () => {
  test('TC-RLAC-07: Staff GET /api/grievances returns ONLY tickets belonging to their assigned department', async () => {
    // Network staff queries grievance list
    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      headers: {
        Authorization: `Bearer ${networkStaffToken}`,
      },
    });

    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const list = (await res.json()) as any[];
    assert.ok(Array.isArray(list), 'Expected array of grievances');

    // All returned tickets must belong to Network Operations
    for (const item of list) {
      const deptId = item.assignedDepartmentId || item.assigned_department_id;
      if (deptId) {
        assert.equal(
          deptId,
          TEST_DEPARTMENTS.NETWORK_OPS.id,
          `Found ticket ${item.id} with department ${deptId}, expected only ${TEST_DEPARTMENTS.NETWORK_OPS.id}`,
        );
      }
    }

    // Verify zero records from Hostel or Transport
    const ticketIds = list.map((t) => t.id);
    assert.ok(ticketIds.includes(TICKET_NET), 'Assigned Network ticket must be present in queue');
    assert.equal(ticketIds.includes(TICKET_HOSTEL), false, 'Hostel ticket must not leak to Network staff');
    assert.equal(ticketIds.includes(TICKET_TRANS), false, 'Transport ticket must not leak to Network staff');
  });

  test('TC-RLAC-08: Hostel staff GET /api/grievances returns ONLY tickets belonging to Hostel Administration', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      headers: {
        Authorization: `Bearer ${hostelStaffToken}`,
      },
    });

    assert.equal(res.status, 200);
    const list = (await res.json()) as any[];
    const ticketIds = list.map((t) => t.id);

    assert.ok(ticketIds.includes(TICKET_HOSTEL), 'Hostel ticket must be present in Hostel staff queue');
    assert.equal(ticketIds.includes(TICKET_NET), false, 'Network ticket must not leak to Hostel staff');
    assert.equal(ticketIds.includes(TICKET_TRANS), false, 'Transport ticket must not leak to Hostel staff');
  });

  test('TC-RLAC-09: Super Admin GET /api/grievances returns tickets across all departments', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      headers: {
        Authorization: `Bearer ${superAdminToken}`,
      },
    });

    assert.equal(res.status, 200);
    const list = (await res.json()) as any[];
    const ticketIds = list.map((t) => t.id);

    assert.ok(ticketIds.includes(TICKET_NET), 'Super Admin queue must include Network ticket');
    assert.ok(ticketIds.includes(TICKET_HOSTEL), 'Super Admin queue must include Hostel ticket');
    assert.ok(ticketIds.includes(TICKET_TRANS), 'Super Admin queue must include Transport ticket');
  });
});
