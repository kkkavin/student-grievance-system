/**
 * test/e2e/e2e_cascading_resolution.test.ts
 *
 * Dedicated End-to-End Test Suite for Single-Click Cascading Resolution (Milestone 2)
 *
 * Requirements Covered:
 * - R3: Single-click resolution endpoint POST /api/grievances/:id/resolve
 * - R3: Simultaneous cascading of status='resolved' and resolvedAt=ISO string to parent + N children
 * - R3: Outbox notification fan-out to parent reporter + N child reporters (N+1 total notifications)
 * - R4: RLAC isolation (Dept A staff -> Dept A OK; Dept A staff -> Dept B 403; Student -> 403; Super Admin global OK)
 * - R4/R5: Idempotency, 404 non-existent ticket, 0-child standalone parent, concurrency safety
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

const TEST_PORT = process.env.CASCADING_TEST_PORT
  ? parseInt(process.env.CASCADING_TEST_PORT, 10)
  : 3130;

let serverBaseUrl: string;
let stopServer: () => Promise<void>;

// Authentication Tokens
let superAdminToken: string;
let hostelStaffToken: string;
let hostelHeadToken: string;
let networkStaffToken: string;
let networkHeadToken: string;
let studentToken: string;

// Unique run prefix to guarantee zero test interference
const PREFIX = `cas_${Date.now().toString(36)}`;

// ----------------------------------------------------------------------------
// Test Fixture Helper: Seeds a Parent Grievance with N Child Complaints
// ----------------------------------------------------------------------------
function seedTicketTree(options: {
  treeKey: string;
  deptId: string;
  category: string;
  childCount: number;
  parentStatus?: string;
  parentResolvedAt?: string | null;
  childStatus?: string;
  childResolvedAt?: string | null;
  parentEmail?: string;
  childEmailPrefix?: string;
}) {
  const db = getDatabase();
  const parentId = `${PREFIX}_par_${options.treeKey}`;
  const parentTicketNo = `TKT-PAR-${options.treeKey.toUpperCase()}`;
  const parentEmail = options.parentEmail || `${options.treeKey}.parent@cascadetest.edu`;

  // 1. Insert Parent Grievance
  db.prepare(`
    INSERT INTO grievances (
      id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
      category, description, status, priority, isSpam, createdAt, resolvedAt, adminNotes,
      master_case_id, assigned_department_id
    ) VALUES (?, ?, ?, ?, ?, '9999900010', 'hosteller', ?, ?, ?, 'high', 0, datetime('now', '-2 hours'), ?, NULL, NULL, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      resolvedAt = excluded.resolvedAt,
      assigned_department_id = excluded.assigned_department_id,
      adminNotes = NULL
  `).run(
    parentId,
    parentTicketNo,
    `REG_PAR_${options.treeKey}`,
    `Parent Reporter ${options.treeKey}`,
    parentEmail,
    options.category,
    `Master incident for ${options.category} at ${options.treeKey}`,
    options.parentStatus || 'PRIMARY',
    options.parentResolvedAt || null,
    options.deptId,
  );

  // 2. Insert N Child Grievances linked via master_case_id
  const childIds: string[] = [];
  const childEmails: string[] = [];

  for (let i = 1; i <= options.childCount; i++) {
    const childId = `${PREFIX}_chd_${options.treeKey}_${i}`;
    const childTicketNo = `TKT-CHD-${options.treeKey.toUpperCase()}-${i}`;
    const childEmail = options.childEmailPrefix
      ? `${options.childEmailPrefix}.${i}@cascadetest.edu`
      : `${options.treeKey}.child.${i}@cascadetest.edu`;

    db.prepare(`
      INSERT INTO grievances (
        id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
        category, description, status, priority, isSpam, createdAt, resolvedAt, adminNotes,
        master_case_id, similarity_score, assigned_department_id
      ) VALUES (?, ?, ?, ?, ?, '9999900020', 'hosteller', ?, ?, ?, 'medium', 0, datetime('now', '-1 hour'), ?, NULL, ?, 0.95, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        resolvedAt = excluded.resolvedAt,
        master_case_id = excluded.master_case_id,
        assigned_department_id = excluded.assigned_department_id,
        adminNotes = NULL
    `).run(
      childId,
      childTicketNo,
      `REG_CHD_${options.treeKey}_${i}`,
      `Child Reporter ${options.treeKey} #${i}`,
      childEmail,
      options.category,
      `Duplicate complaint #${i} for ${options.category} at ${options.treeKey}`,
      options.childStatus || 'MERGED_AUTOMATIC',
      options.childResolvedAt || null,
      parentId,
      options.deptId,
    );

    childIds.push(childId);
    childEmails.push(childEmail);
  }

  return {
    parentId,
    parentTicketNo,
    parentEmail,
    childIds,
    childEmails,
  };
}

// ----------------------------------------------------------------------------
// Suite Setup & Teardown
// ----------------------------------------------------------------------------
before(async () => {
  const db = getDatabase();
  seedRbacTestData(db);
  cleanRbacTestData(db);

  // Mint signed JWT tokens for testing
  superAdminToken = signToken({
    id: TEST_USERS.SUPER_ADMIN.id,
    email: TEST_USERS.SUPER_ADMIN.email,
    role: 'SUPER_ADMIN',
    department_id: null,
    permissions: ['*'],
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

  studentToken = signToken({
    id: TEST_USERS.STUDENT.id,
    email: TEST_USERS.STUDENT.email,
    role: 'STUDENT',
    department_id: null,
    permissions: ['grievances:create', 'grievances:read_own'],
  });

  // Start test server instance
  const server = await startTestServer(TEST_PORT);
  serverBaseUrl = server.serverBaseUrl;
  stopServer = server.stop;
});

after(async () => {
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM grievances WHERE id LIKE ? OR studentEmail LIKE '%@cascadetest.edu'").run(`${PREFIX}%`);
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@cascadetest.edu'").run();
  } catch {
    // ignore
  }

  if (stopServer) {
    await stopServer();
  }
});

beforeEach(() => {
  // Clean outbox before each test to guarantee precise count assertions
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@cascadetest.edu'").run();
  } catch {
    // ignore
  }
});

// ============================================================================
// SUITE 1: Single-Click Cascading Resolution Core Happy Paths
// ============================================================================
describe('Suite 1: Single-Click Cascading Resolution Core Functionality', () => {
  test('TC-CAS-01: Single-click resolution endpoint cascades status=resolved and resolvedAt to parent and all N=3 children simultaneously', async () => {
    const tree = seedTicketTree({
      treeKey: 't1_n3',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 3,
    });

    const resolutionNote = 'Replaced main distribution pipe and confirmed water pressure restored.';
    const res = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote }),
    });

    assert.strictEqual(res.status, 200, `Expected 200 OK from /resolve endpoint, got ${res.status}`);
    const data = (await res.json()) as any;

    // 1. Verify Response Payload Shape
    assert.strictEqual(data.success, true, 'Response must indicate success: true');
    assert.ok(data.parent, 'Response must contain parent object');
    assert.strictEqual(data.parent.id, tree.parentId);
    assert.strictEqual(data.parent.status, 'resolved', 'Parent ticket status must be resolved');
    assert.ok(data.parent.resolvedAt, 'Parent must have non-null resolvedAt timestamp');
    assert.strictEqual(data.resolvedChildrenCount, 3, 'Must report exactly 3 resolved children');
    assert.strictEqual(Array.isArray(data.childIds), true, 'childIds must be an array');
    assert.strictEqual(data.childIds.length, 3);
    for (const cid of tree.childIds) {
      assert.ok(data.childIds.includes(cid), `childIds must contain child ${cid}`);
    }

    // 2. Direct Database Inspection: Parent Invariants
    const db = getDatabase();
    const parentRow = db
      .prepare('SELECT status, resolvedAt, adminNotes FROM grievances WHERE id = ?')
      .get(tree.parentId) as any;

    assert.strictEqual(parentRow.status, 'resolved');
    assert.ok(parentRow.resolvedAt, 'Parent resolvedAt must be set in database');
    assert.ok(
      parentRow.adminNotes && parentRow.adminNotes.includes('Replaced main distribution pipe'),
      'Parent adminNotes must record the resolution note',
    );

    // 3. Direct Database Inspection: Child Invariants
    const childRows = db
      .prepare('SELECT id, status, resolvedAt, master_case_id FROM grievances WHERE master_case_id = ?')
      .all(tree.parentId) as any[];

    assert.strictEqual(childRows.length, 3, 'Database must have 3 children referencing parent');
    const parentTimestamp = new Date(parentRow.resolvedAt).getTime();

    for (const child of childRows) {
      assert.strictEqual(child.status, 'resolved', `Child ${child.id} status must be resolved in database`);
      assert.ok(child.resolvedAt, `Child ${child.id} resolvedAt must not be null`);

      // Verify simultaneous resolution timestamp (within 2 seconds)
      const childTimestamp = new Date(child.resolvedAt).getTime();
      const deltaMs = Math.abs(parentTimestamp - childTimestamp);
      assert.ok(
        deltaMs <= 2000,
        `Child resolvedAt (${child.resolvedAt}) must be within 2s of parent (${parentRow.resolvedAt}), delta: ${deltaMs}ms`,
      );
    }
  });

  test('TC-CAS-02: Scaled burst tree resolution - cascades atomically to parent and N=10 children', async () => {
    const tree = seedTicketTree({
      treeKey: 't2_n10',
      deptId: TEST_DEPARTMENTS.NETWORK_OPS.id,
      category: 'Hostel Wi-Fi & Internet',
      childCount: 10,
    });

    const res = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${networkStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Rebooted core switch SW-Zone-F3 and updated firmware' }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.resolvedChildrenCount, 10);
    assert.strictEqual(data.childIds.length, 10);

    // Verify all 10 children in DB have status = 'resolved'
    const db = getDatabase();
    const children = db
      .prepare('SELECT status, resolvedAt FROM grievances WHERE master_case_id = ?')
      .all(tree.parentId) as any[];

    assert.strictEqual(children.length, 10);
    for (const c of children) {
      assert.strictEqual(c.status, 'resolved');
      assert.ok(c.resolvedAt);
    }
  });
});

// ============================================================================
// SUITE 2: Standalone Parent Resolution (N = 0 Children)
// ============================================================================
describe('Suite 2: Standalone Parent Resolution (0 Children)', () => {
  test('TC-CAS-03: Resolving standalone grievance (0 children) succeeds with resolvedChildrenCount=0 and empty childIds', async () => {
    const tree = seedTicketTree({
      treeKey: 't3_n0',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Food & Mess',
      childCount: 0,
    });

    const res = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Mess contractor warned, fresh food prepared' }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.resolvedChildrenCount, 0);
    assert.deepStrictEqual(data.childIds, []);
    assert.strictEqual(data.parent.status, 'resolved');

    // DB state check
    const db = getDatabase();
    const row = db.prepare('SELECT status, resolvedAt FROM grievances WHERE id = ?').get(tree.parentId) as any;
    assert.strictEqual(row.status, 'resolved');
    assert.ok(row.resolvedAt);
  });
});

// ============================================================================
// SUITE 3: Outbox Email Fan-Out Verification (N + 1 Notifications)
// ============================================================================
describe('Suite 3: Outbox Notification Fan-Out Verification', () => {
  test('TC-CAS-04: Outbox fan-out creates exactly N+1 notification rows (1 parent + N children) with correct recipients and content', async () => {
    const tree = seedTicketTree({
      treeKey: 't4_fanout',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Cleanliness & Sanitation',
      childCount: 3,
      parentEmail: 'parent.tc4@cascadetest.edu',
      childEmailPrefix: 'child.tc4',
    });

    const note = 'Corridor sanitation and disinfectant spray completed by housekeeping staff.';
    const res = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: note }),
    });

    assert.strictEqual(res.status, 200);

    // Verify Outbox Database Records
    const db = getDatabase();
    const outboxRows = db
      .prepare(`
        SELECT recipient, subject, body, type, timestamp
        FROM outbox
        WHERE recipient LIKE '%tc4%@cascadetest.edu'
        ORDER BY timestamp ASC
      `)
      .all() as any[];

    // Invariant: Exactly N + 1 = 4 notification rows
    assert.strictEqual(
      outboxRows.length,
      4,
      `Expected exactly 4 outbox emails (1 parent + 3 children), found ${outboxRows.length}`,
    );

    // 1. Verify Parent Notification
    const parentEmail = outboxRows.find((r) => r.recipient === 'parent.tc4@cascadetest.edu');
    assert.ok(parentEmail, 'Parent email recipient must exist in outbox');
    assert.strictEqual(parentEmail.type, 'resolution', 'Notification type must be resolution');
    assert.ok(
      parentEmail.body.includes(tree.parentTicketNo) || parentEmail.subject.includes(tree.parentTicketNo),
      'Parent email must reference parent ticket number',
    );
    assert.ok(
      parentEmail.body.includes(note),
      'Parent email body must include resolution notes',
    );

    // 2. Verify All Child Notifications
    for (let i = 1; i <= 3; i++) {
      const expectedRecipient = `child.tc4.${i}@cascadetest.edu`;
      const childEmail = outboxRows.find((r) => r.recipient === expectedRecipient);
      assert.ok(childEmail, `Child ${i} (${expectedRecipient}) must receive an email in outbox`);
      assert.strictEqual(childEmail.type, 'resolution');
      assert.ok(
        childEmail.body.includes(tree.parentTicketNo) || childEmail.subject.includes(tree.parentTicketNo),
        'Child notification must reference Master Case ticket number',
      );
      assert.ok(
        childEmail.body.includes(note),
        'Child notification must include resolution notes',
      );
    }
  });

  test('TC-CAS-05: Standalone parent resolution queues exactly 1 resolution notification in outbox', async () => {
    const tree = seedTicketTree({
      treeKey: 't5_standalone_outbox',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 0,
      parentEmail: 'standalone.tc5@cascadetest.edu',
    });

    const res = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Leak repaired' }),
    });

    assert.strictEqual(res.status, 200);

    const db = getDatabase();
    const rows = db
      .prepare("SELECT recipient, type FROM outbox WHERE recipient = 'standalone.tc5@cascadetest.edu'")
      .all() as any[];

    assert.strictEqual(rows.length, 1, 'Expected exactly 1 outbox notification for standalone parent');
    assert.strictEqual(rows[0].type, 'resolution');
  });
});

// ============================================================================
// SUITE 4: Row-Level Access Control (RLAC) Security & Authorization
// ============================================================================
describe('Suite 4: Row-Level Access Control (RLAC) Boundaries', () => {
  test('TC-CAS-06: Department A staff can resolve Department A parent grievance (200 OK)', async () => {
    const tree = seedTicketTree({
      treeKey: 't6_staff_own',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 2,
    });

    const res = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Resolved by own department staff' }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.resolvedChildrenCount, 2);
  });

  test('TC-CAS-07: Department A head can resolve Department A parent grievance (200 OK)', async () => {
    const tree = seedTicketTree({
      treeKey: 't7_head_own',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Food & Mess',
      childCount: 1,
    });

    const res = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelHeadToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Resolved by department head' }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.resolvedChildrenCount, 1);
  });

  test('TC-CAS-08: Cross-Department IDOR/BOLA Prevention: Dept A staff attempting to resolve Dept B parent returns 403 Forbidden', async () => {
    // Parent belongs to Network Operations (Dept B)
    const tree = seedTicketTree({
      treeKey: 't8_cross_dept',
      deptId: TEST_DEPARTMENTS.NETWORK_OPS.id,
      category: 'Hostel Wi-Fi & Internet',
      childCount: 2,
    });

    // Hostel staff (Dept A) attempts to resolve Network Operations parent
    const res = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Unauthorized tampering attempt by Hostel staff' }),
    });

    assert.strictEqual(res.status, 403, `Expected 403 Forbidden for cross-department resolution, got ${res.status}`);
    const body = (await res.json()) as any;
    assert.match(
      body.error || body.message,
      /Access denied|Forbidden|unauthorized|department/i,
      'Error message must indicate cross-department access denial',
    );

    // Verify Database Integrity: Records MUST REMAIN UNMUTATED
    const db = getDatabase();
    const parentRow = db.prepare('SELECT status, resolvedAt FROM grievances WHERE id = ?').get(tree.parentId) as any;
    assert.notStrictEqual(parentRow.status, 'resolved', 'Parent ticket status must NOT have changed to resolved');
    assert.strictEqual(parentRow.resolvedAt, null, 'Parent resolvedAt must remain NULL');

    const childRows = db
      .prepare('SELECT status, resolvedAt FROM grievances WHERE master_case_id = ?')
      .all(tree.parentId) as any[];
    for (const c of childRows) {
      assert.notStrictEqual(c.status, 'resolved', 'Child ticket status must NOT have changed to resolved');
      assert.strictEqual(c.resolvedAt, null, 'Child resolvedAt must remain NULL');
    }

    // Verify 0 notification emails queued in outbox
    const outboxRows = db
      .prepare("SELECT * FROM outbox WHERE recipient LIKE '%t8_cross_dept%'")
      .all();
    assert.strictEqual(outboxRows.length, 0, 'Zero notification emails should be queued on 403 rejection');
  });

  test('TC-CAS-09: Student accounts are rejected with 403 Forbidden when attempting to resolve grievances', async () => {
    const tree = seedTicketTree({
      treeKey: 't9_student_forbidden',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 1,
    });

    const res = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Student trying to resolve ticket' }),
    });

    assert.strictEqual(res.status, 403, `Expected 403 Forbidden for student account, got ${res.status}`);

    // Verify DB integrity
    const db = getDatabase();
    const parent = db.prepare('SELECT status FROM grievances WHERE id = ?').get(tree.parentId) as any;
    assert.notStrictEqual(parent.status, 'resolved');
  });

  test('TC-CAS-10: Super Admin unrestricted bypass - can resolve parent tickets across all departments (200 OK)', async () => {
    // Ticket 1: Network Operations
    const treeNet = seedTicketTree({
      treeKey: 't10_sa_net',
      deptId: TEST_DEPARTMENTS.NETWORK_OPS.id,
      category: 'Hostel Wi-Fi & Internet',
      childCount: 2,
    });

    // Ticket 2: Hostel Administration
    const treeHostel = seedTicketTree({
      treeKey: 't10_sa_hostel',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 2,
    });

    // Super admin resolves Network ticket
    const resNet = await fetch(`${serverBaseUrl}/api/grievances/${treeNet.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Super admin global resolution for Network' }),
    });
    assert.strictEqual(resNet.status, 200);

    // Super admin resolves Hostel ticket
    const resHostel = await fetch(`${serverBaseUrl}/api/grievances/${treeHostel.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Super admin global resolution for Hostel' }),
    });
    assert.strictEqual(resHostel.status, 200);

    // Verify both trees fully resolved in DB
    const db = getDatabase();
    const rowNet = db.prepare('SELECT status FROM grievances WHERE id = ?').get(treeNet.parentId) as any;
    const rowHostel = db.prepare('SELECT status FROM grievances WHERE id = ?').get(treeHostel.parentId) as any;
    assert.strictEqual(rowNet.status, 'resolved');
    assert.strictEqual(rowHostel.status, 'resolved');
  });

  test('TC-CAS-11: Unauthenticated request to /resolve returns 401 Unauthorized', async () => {
    const tree = seedTicketTree({
      treeKey: 't11_unauth',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 1,
    });

    // Missing token
    const res1 = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolutionNote: 'No token' }),
    });
    assert.strictEqual(res1.status, 401);

    // Invalid token
    const res2 = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid.token.payload',
      },
      body: JSON.stringify({ resolutionNote: 'Invalid token' }),
    });
    assert.strictEqual(res2.status, 401);
  });
});

// ============================================================================
// SUITE 5: Idempotency, Concurrency & Edge Cases
// ============================================================================
describe('Suite 5: Idempotency, Concurrency & Edge Cases', () => {
  test('TC-CAS-12: Idempotent resolution - resolving already resolved parent returns 200 OK without corrupting state or duplicating child links', async () => {
    const tree = seedTicketTree({
      treeKey: 't12_idempotent',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 2,
    });

    // First resolution
    const res1 = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Initial resolution note' }),
    });
    assert.strictEqual(res1.status, 200);

    // Second resolution on already resolved ticket
    const res2 = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Second idempotent call' }),
    });
    assert.strictEqual(res2.status, 200, `Expected 200 OK on idempotent resolve call, got ${res2.status}`);
    const data2 = (await res2.json()) as any;
    assert.strictEqual(data2.success, true);
    assert.strictEqual(data2.parent.status, 'resolved');

    // DB state must be sound
    const db = getDatabase();
    const children = db
      .prepare('SELECT id, status FROM grievances WHERE master_case_id = ?')
      .all(tree.parentId) as any[];
    assert.strictEqual(children.length, 2);
    for (const c of children) {
      assert.strictEqual(c.status, 'resolved');
    }
  });

  test('TC-CAS-13: Non-existent parent grievance returns 404 Not Found', async () => {
    const nonExistentId = `non_existent_${Date.now()}`;
    const res = await fetch(`${serverBaseUrl}/api/grievances/${nonExistentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Resolving ghost ticket' }),
    });

    assert.strictEqual(res.status, 404, `Expected 404 Not Found for non-existent ticket, got ${res.status}`);
    const data = (await res.json()) as any;
    assert.strictEqual(data.success, false);
    assert.match(data.error || data.message, /not found/i);
  });

  test('TC-CAS-14: Resolving a child ticket directly resolves only that child and does not cascade upwards to parent', async () => {
    const tree = seedTicketTree({
      treeKey: 't14_direct_child',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 2,
    });

    const targetChildId = tree.childIds[0];

    // Resolve Child 0 directly
    const res = await fetch(`${serverBaseUrl}/api/grievances/${targetChildId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Resolving single child complaint' }),
    });

    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.resolvedChildrenCount, 0, 'Resolving a child directly has 0 sub-children');

    // Verify parent is STILL OPEN/PRIMARY (not resolved)
    const db = getDatabase();
    const parent = db.prepare('SELECT status FROM grievances WHERE id = ?').get(tree.parentId) as any;
    assert.strictEqual(parent.status, 'PRIMARY', 'Parent ticket must remain unmutated when resolving single child');

    // Sibling child is STILL MERGED_AUTOMATIC
    const sibling = db.prepare('SELECT status FROM grievances WHERE id = ?').get(tree.childIds[1]) as any;
    assert.strictEqual(sibling.status, 'MERGED_AUTOMATIC', 'Sibling child must remain unmutated');

    // Target child is resolved
    const child = db.prepare('SELECT status, resolvedAt FROM grievances WHERE id = ?').get(targetChildId) as any;
    assert.strictEqual(child.status, 'resolved');
    assert.ok(child.resolvedAt);
  });

  test('TC-CAS-15: High-concurrency burst resolution - 5 parallel resolution calls serialize safely under SQLite WAL mode with zero crashes', async () => {
    const tree = seedTicketTree({
      treeKey: 't15_concurrent',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 4,
    });

    // Fire 5 simultaneous requests via Promise.all
    const requests = Array.from({ length: 5 }, (_, idx) =>
      fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hostelStaffToken}`,
        },
        body: JSON.stringify({ resolutionNote: `Concurrent resolution attempt #${idx + 1}` }),
      }),
    );

    const responses = await Promise.all(requests);
    for (const res of responses) {
      assert.strictEqual(
        res.status,
        200,
        `All concurrent requests must succeed without SQLITE_BUSY crash, got ${res.status}`,
      );
    }

    // Invariant: Exactly 1 parent resolved, all 4 children resolved
    const db = getDatabase();
    const parent = db.prepare('SELECT status, resolvedAt FROM grievances WHERE id = ?').get(tree.parentId) as any;
    assert.strictEqual(parent.status, 'resolved');
    assert.ok(parent.resolvedAt);

    const children = db
      .prepare('SELECT status, resolvedAt FROM grievances WHERE master_case_id = ?')
      .all(tree.parentId) as any[];
    assert.strictEqual(children.length, 4);
    for (const c of children) {
      assert.strictEqual(c.status, 'resolved');
      assert.ok(c.resolvedAt);
    }
  });

  test('TC-CAS-16: Optional resolutionNote field handling - works with empty body and unicode characters', async () => {
    // 1. Empty body
    const treeEmpty = seedTicketTree({
      treeKey: 't16_empty_body',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 1,
    });

    const resEmpty = await fetch(`${serverBaseUrl}/api/grievances/${treeEmpty.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({}),
    });
    assert.strictEqual(resEmpty.status, 200, 'Empty body should be accepted gracefully');

    // 2. Unicode and special characters in resolution note
    const treeUnicode = seedTicketTree({
      treeKey: 't16_unicode',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 1,
    });

    const unicodeNote = 'Repaired high-pressure pipe 🚰⚡! Tamil notes: பழுது பார்க்கப்பட்டது. All OK.';
    const resUnicode = await fetch(`${serverBaseUrl}/api/grievances/${treeUnicode.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: unicodeNote }),
    });
    assert.strictEqual(resUnicode.status, 200);

    const db = getDatabase();
    const parentRow = db.prepare('SELECT adminNotes FROM grievances WHERE id = ?').get(treeUnicode.parentId) as any;
    assert.ok(parentRow.adminNotes && parentRow.adminNotes.includes('பழுது பார்க்கப்பட்டது'));
  });

  test('TC-CAS-17: Partially pre-resolved children handling - parent resolution completes resolution of remaining active children', async () => {
    const tree = seedTicketTree({
      treeKey: 't17_partial',
      deptId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      category: 'Plumbing & Water',
      childCount: 3,
    });

    // Manually mark child 1 as already resolved earlier
    const db = getDatabase();
    db.prepare("UPDATE grievances SET status = 'resolved', resolvedAt = datetime('now', '-30 minutes') WHERE id = ?")
      .run(tree.childIds[0]);

    // Now call parent resolve
    const res = await fetch(`${serverBaseUrl}/api/grievances/${tree.parentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({ resolutionNote: 'Master resolution for all remaining complaints' }),
    });

    assert.strictEqual(res.status, 200);

    // Verify all 3 children are now resolved
    const childRows = db
      .prepare('SELECT id, status, resolvedAt FROM grievances WHERE master_case_id = ?')
      .all(tree.parentId) as any[];

    assert.strictEqual(childRows.length, 3);
    for (const c of childRows) {
      assert.strictEqual(c.status, 'resolved');
      assert.ok(c.resolvedAt);
    }
  });
});
