/**
 * Adversarial Row-Level Access Control (RLAC) & Horizontal Privilege Escalation Challenger Suite
 *
 * Empirically challenges and stress-tests:
 * 1. Cross-department IDOR/BOLA read attempts across full department matrix (assert 403 Forbidden)
 * 2. Cross-department IDOR write & privilege-escalation/hijacking attempts (assert 403 Forbidden & verify DB pristine)
 * 3. Cross-department master-notes tampering (assert 403 Forbidden & verify DB pristine)
 * 4. Unauthorized student mutations (assert 403 Forbidden)
 * 5. Corrupted, expired, and tampered token mutations (assert 401 Unauthorized)
 * 6. Scoped queue isolation & query parameter tampering resistance (GET /api/grievances)
 * 7. Super Admin unconstrained global operations (200 OK)
 * 8. High-concurrency race condition bursts (50 concurrent requests attempting IDOR bypass)
 */

import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../db.ts';
import { signToken } from '../src/utils/jwt.ts';
import {
  TEST_DEPARTMENTS,
  seedRbacTestData,
  cleanRbacTestData,
  startTestServer,
} from './fixtures/rbac_fixtures.ts';

const TEST_PORT = process.env.ADVERSARIAL_RLAC_PORT ? parseInt(process.env.ADVERSARIAL_RLAC_PORT, 10) : 3125;
let serverBaseUrl: string;
let stopServer: () => Promise<void>;

// Tokens
let superAdminToken: string;
let networkStaffToken: string;
let networkHeadToken: string;
let hostelStaffToken: string;
let hostelHeadToken: string;
let transportStaffToken: string;
let facilitiesStaffToken: string;
let studentToken1: string;
let studentToken2: string;

// Spoofed & Tampered Tokens
let nullDeptStaffToken: string;
let phantomDeptStaffToken: string;
let expiredStaffToken: string;
let tamperedSignatureToken: string;

// Adversarial Test Ticket IDs
const ADV_TKT_NET = 'adv_tkt_net_101';
const ADV_TKT_HOSTEL = 'adv_tkt_hostel_201';
const ADV_TKT_TRANS = 'adv_tkt_trans_301';
const ADV_TKT_FAC = 'adv_tkt_fac_401';
const ADV_TKT_UNASSIGNED = 'adv_tkt_unassigned_501';
const ADV_TKT_STUDENT_1 = 'adv_tkt_stu_601';
const ADV_TKT_STUDENT_2 = 'adv_tkt_stu_602';

before(async () => {
  const db = getDatabase();
  seedRbacTestData(db);
  cleanRbacTestData(db);

  // Mint standard test tokens
  superAdminToken = signToken({
    id: 'usr_adv_superadmin',
    email: 'adv.superadmin@college.edu',
    role: 'SUPER_ADMIN',
    department_id: null,
    permissions: ['*'],
  });

  networkStaffToken = signToken({
    id: 'usr_adv_net_staff',
    email: 'adv.net.staff@college.edu',
    role: 'DEPARTMENT_STAFF',
    department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept'],
  });

  networkHeadToken = signToken({
    id: 'usr_adv_net_head',
    email: 'adv.net.head@college.edu',
    role: 'DEPARTMENT_HEAD',
    department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept', 'grievances:resolve'],
  });

  hostelStaffToken = signToken({
    id: 'usr_adv_hostel_staff',
    email: 'adv.hostel.staff@college.edu',
    role: 'DEPARTMENT_STAFF',
    department_id: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept'],
  });

  hostelHeadToken = signToken({
    id: 'usr_adv_hostel_head',
    email: 'adv.hostel.head@college.edu',
    role: 'DEPARTMENT_HEAD',
    department_id: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept', 'grievances:resolve'],
  });

  transportStaffToken = signToken({
    id: 'usr_adv_trans_staff',
    email: 'adv.trans.staff@college.edu',
    role: 'DEPARTMENT_STAFF',
    department_id: TEST_DEPARTMENTS.CAMPUS_TRANSPORT.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept'],
  });

  facilitiesStaffToken = signToken({
    id: 'usr_adv_fac_staff',
    email: 'adv.fac.staff@college.edu',
    role: 'DEPARTMENT_STAFF',
    department_id: TEST_DEPARTMENTS.FACILITIES.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept'],
  });

  studentToken1 = signToken({
    id: 'ADV_STU_01',
    email: 'alice.adv@advchallenger.edu',
    role: 'STUDENT',
    department_id: null,
    permissions: ['grievances:create', 'grievances:read_own'],
  });

  studentToken2 = signToken({
    id: 'ADV_STU_02',
    email: 'bob.adv@advchallenger.edu',
    role: 'STUDENT',
    department_id: null,
    permissions: ['grievances:create', 'grievances:read_own'],
  });

  // Spoofed & Tampered Tokens
  nullDeptStaffToken = signToken({
    id: 'usr_adv_null_dept',
    email: 'adv.nulldept@college.edu',
    role: 'DEPARTMENT_STAFF',
    department_id: null,
    permissions: ['grievances:read_dept'],
  });

  phantomDeptStaffToken = signToken({
    id: 'usr_adv_phantom_dept',
    email: 'adv.phantom@college.edu',
    role: 'DEPARTMENT_STAFF',
    department_id: 'dept-phantom-nonexistent-999',
    permissions: ['grievances:read_dept'],
  });

  expiredStaffToken = signToken(
    {
      id: 'usr_adv_expired',
      email: 'adv.expired@college.edu',
      role: 'DEPARTMENT_STAFF',
      department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
      permissions: ['grievances:read_dept'],
    },
    undefined,
    -3600, // Expired 1 hour ago
  );

  // Generate valid token then tamper with its signature portion
  const validTokenForTamper = signToken({
    id: 'usr_adv_tampered',
    email: 'adv.tampered@college.edu',
    role: 'DEPARTMENT_STAFF',
    department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
    permissions: ['grievances:read_dept'],
  });
  const tokenParts = validTokenForTamper.split('.');
  tamperedSignatureToken = `${tokenParts[0]}.${tokenParts[1]}.tampered_invalid_signature_bits`;

  const server = await startTestServer(TEST_PORT);
  serverBaseUrl = server.serverBaseUrl;
  stopServer = server.stop;
});

after(async () => {
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM grievances WHERE id LIKE 'adv_tkt_%'").run();
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

  const insertStmt = db.prepare(`
    INSERT INTO grievances (
      id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
      category, description, status, priority, isSpam, createdAt, assigned_department_id,
      adminNotes, public_master_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), ?, NULL, NULL)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      priority = excluded.priority,
      assigned_department_id = excluded.assigned_department_id,
      adminNotes = NULL,
      public_master_notes = NULL
  `);

  // Network ticket
  insertStmt.run(
    ADV_TKT_NET,
    'ADV-NET-101',
    'ADV_STU_01',
    'Alice Student',
    'alice.adv@advchallenger.edu',
    '9999911111',
    'hosteller',
    'Hostel Wi-Fi & Internet',
    'Network AP switch offline',
    'in_progress',
    'high',
    TEST_DEPARTMENTS.NETWORK_OPS.id,
  );

  // Hostel ticket
  insertStmt.run(
    ADV_TKT_HOSTEL,
    'ADV-HST-201',
    'ADV_STU_02',
    'Bob Student',
    'bob.adv@advchallenger.edu',
    '9999922222',
    'hosteller',
    'Plumbing & Water',
    'Overhead tank valve leaking',
    'open',
    'medium',
    TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
  );

  // Transport ticket
  insertStmt.run(
    ADV_TKT_TRANS,
    'ADV-TRN-301',
    'ADV_STU_03',
    'Charlie Student',
    'charlie.adv@advchallenger.edu',
    '9999933333',
    'dayscholar',
    'Bus & Transport',
    'Bus route 8 tyre punctured',
    'open',
    'low',
    TEST_DEPARTMENTS.CAMPUS_TRANSPORT.id,
  );

  // Facilities ticket
  insertStmt.run(
    ADV_TKT_FAC,
    'ADV-FAC-401',
    'ADV_STU_04',
    'Dana Student',
    'dana.adv@advchallenger.edu',
    '9999944444',
    'hosteller',
    'Electrical & AC',
    'Block B generator tripped',
    'open',
    'urgent',
    TEST_DEPARTMENTS.FACILITIES.id,
  );

  // Unassigned ticket
  insertStmt.run(
    ADV_TKT_UNASSIGNED,
    'ADV-UNA-501',
    'ADV_STU_05',
    'Eve Student',
    'eve.adv@advchallenger.edu',
    '9999955555',
    'hosteller',
    'General Inquiry',
    'General inquiry about schedule',
    'open',
    'low',
    null,
  );

  // Student 1 ticket
  insertStmt.run(
    ADV_TKT_STUDENT_1,
    'ADV-STU-601',
    'ADV_STU_01',
    'Alice Student',
    'alice.adv@advchallenger.edu',
    '9999911111',
    'hosteller',
    'Hostel Wi-Fi & Internet',
    'Alice personal ticket',
    'open',
    'medium',
    TEST_DEPARTMENTS.NETWORK_OPS.id,
  );

  // Student 2 ticket
  insertStmt.run(
    ADV_TKT_STUDENT_2,
    'ADV-STU-602',
    'ADV_STU_02',
    'Bob Student',
    'bob.adv@advchallenger.edu',
    '9999922222',
    'hosteller',
    'Plumbing & Water',
    'Bob personal ticket',
    'open',
    'medium',
    TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
  );
});

describe('Adversarial RLAC Challenge 1: Cross-Department IDOR Read Matrix (GET /api/grievances/:id)', () => {
  test('ADV-READ-01: Dept A staff cannot read Dept B ticket (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}`, {
      headers: { Authorization: `Bearer ${networkStaffToken}` },
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
    const body = await res.json() as any;
    assert.match(body.error, /Unauthorized cross-department grievance access/i);
  });

  test('ADV-READ-02: Dept B staff cannot read Dept C ticket (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_TRANS}`, {
      headers: { Authorization: `Bearer ${hostelStaffToken}` },
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
    const body = await res.json() as any;
    assert.match(body.error, /Unauthorized cross-department grievance access/i);
  });

  test('ADV-READ-03: Dept C staff cannot read Dept A ticket (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_NET}`, {
      headers: { Authorization: `Bearer ${transportStaffToken}` },
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  test('ADV-READ-04: Dept Head A cannot read Dept B ticket (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}`, {
      headers: { Authorization: `Bearer ${networkHeadToken}` },
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  test('ADV-READ-05: Staff with phantom department ID cannot read any grievance (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_NET}`, {
      headers: { Authorization: `Bearer ${phantomDeptStaffToken}` },
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  test('ADV-READ-06: Staff with null department ID in token cannot read grievance (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_NET}`, {
      headers: { Authorization: `Bearer ${nullDeptStaffToken}` },
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);
  });

  test('ADV-READ-07: Staff cannot read unassigned grievance (assigned_department_id = null) (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_UNASSIGNED}`, {
      headers: { Authorization: `Bearer ${networkStaffToken}` },
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden for unassigned ticket, got ${res.status}`);
  });

  test('ADV-READ-08: Student A cannot read Student B personal grievance (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_STUDENT_2}`, {
      headers: { Authorization: `Bearer ${studentToken1}` },
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden on student cross-read, got ${res.status}`);
  });

  test('ADV-READ-09: Student A CAN read own personal grievance (200 OK)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_STUDENT_1}`, {
      headers: { Authorization: `Bearer ${studentToken1}` },
    });
    assert.equal(res.status, 200, `Expected 200 OK on own ticket read, got ${res.status}`);
  });

  test('ADV-READ-10: Super Admin can read all tickets across all departments (200 OK)', async () => {
    for (const ticketId of [ADV_TKT_NET, ADV_TKT_HOSTEL, ADV_TKT_TRANS, ADV_TKT_FAC, ADV_TKT_UNASSIGNED]) {
      const res = await fetch(`${serverBaseUrl}/api/grievances/${ticketId}`, {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      assert.equal(res.status, 200, `Super Admin must be able to read ticket ${ticketId}`);
    }
  });
});

describe('Adversarial RLAC Challenge 2: Cross-Department IDOR Write & Database Integrity (PUT /api/grievances/:id)', () => {
  test('ADV-WRITE-01: Dept A staff cannot update status of Dept B ticket (assert 403 & verify DB untouched)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${networkStaffToken}`,
      },
      body: JSON.stringify({
        status: 'resolved',
        adminNotes: 'TAMPERED: Network staff resolving Hostel grievance',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);

    // Verify DB integrity
    const db = getDatabase();
    const row = db.prepare('SELECT status, adminNotes FROM grievances WHERE id = ?').get(ADV_TKT_HOSTEL) as any;
    assert.equal(row.status, 'open', 'Database status must remain unchanged at "open"');
    assert.equal(row.adminNotes, null, 'Database adminNotes must remain null');
  });

  test('ADV-WRITE-02: Dept A staff cannot hijack / reassign Dept B ticket to Dept A (assert 403 & verify DB untouched)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${networkStaffToken}`,
      },
      body: JSON.stringify({
        assigned_department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
        assignedDepartmentId: TEST_DEPARTMENTS.NETWORK_OPS.id,
        description: 'HIJACKED: Reassigned to Network Ops',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden on department hijacking attempt, got ${res.status}`);

    // Verify DB department assignment was not changed
    const db = getDatabase();
    const row = db.prepare('SELECT assigned_department_id, description FROM grievances WHERE id = ?').get(ADV_TKT_HOSTEL) as any;
    assert.equal(row.assigned_department_id, TEST_DEPARTMENTS.HOSTEL_ADMIN.id, 'Assigned department must remain Hostel Admin');
    assert.notEqual(row.description, 'HIJACKED: Reassigned to Network Ops', 'Description must not be modified');
  });

  test('ADV-WRITE-03: Dept Head A cannot resolve Dept C ticket (assert 403 & verify DB untouched)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_TRANS}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${networkHeadToken}`,
      },
      body: JSON.stringify({
        status: 'resolved',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);

    const db = getDatabase();
    const row = db.prepare('SELECT status FROM grievances WHERE id = ?').get(ADV_TKT_TRANS) as any;
    assert.equal(row.status, 'open', 'Transport ticket status must remain "open"');
  });

  test('ADV-WRITE-04: Super Admin can legitimately mutate any grievance across departments (200 OK)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_FAC}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        status: 'in_progress',
        adminNotes: 'Super Admin escalated to Facilities Contractor',
      }),
    });

    assert.equal(res.status, 200, `Expected 200 OK for Super Admin mutation, got ${res.status}`);

    const db = getDatabase();
    const row = db.prepare('SELECT status, adminNotes FROM grievances WHERE id = ?').get(ADV_TKT_FAC) as any;
    assert.equal(row.status, 'in_progress');
    assert.equal(row.adminNotes, 'Super Admin escalated to Facilities Contractor');
  });
});

describe('Adversarial RLAC Challenge 3: Cross-Department Master Notes Mutation (PUT /api/grievances/:id/master-notes)', () => {
  test('ADV-NOTES-01: Dept A staff cannot update master notes on Dept B ticket (assert 403 & verify DB untouched)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}/master-notes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${networkStaffToken}`,
      },
      body: JSON.stringify({
        publicMasterNotes: 'TAMPERED: Fake master notes injected by Network staff',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);

    const db = getDatabase();
    const row = db.prepare('SELECT public_master_notes FROM grievances WHERE id = ?').get(ADV_TKT_HOSTEL) as any;
    assert.equal(row.public_master_notes, null, 'public_master_notes must remain null');
  });

  test('ADV-NOTES-02: Dept B staff cannot update master notes on Dept A ticket (assert 403 & verify DB untouched)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_NET}/master-notes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hostelStaffToken}`,
      },
      body: JSON.stringify({
        publicMasterNotes: 'TAMPERED: Fake master notes injected by Hostel staff',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden, got ${res.status}`);

    const db = getDatabase();
    const row = db.prepare('SELECT public_master_notes FROM grievances WHERE id = ?').get(ADV_TKT_NET) as any;
    assert.equal(row.public_master_notes, null);
  });

  test('ADV-NOTES-03: Super Admin can update master notes on any department ticket (200 OK)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_TRANS}/master-notes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        publicMasterNotes: 'OFFICIAL: Replacement bus deployed for Route 8',
      }),
    });

    assert.equal(res.status, 200, `Expected 200 OK for Super Admin master note update, got ${res.status}`);

    const db = getDatabase();
    const row = db.prepare('SELECT public_master_notes FROM grievances WHERE id = ?').get(ADV_TKT_TRANS) as any;
    assert.equal(row.public_master_notes, 'OFFICIAL: Replacement bus deployed for Route 8');
  });
});

describe('Adversarial RLAC Challenge 4: Unauthorized Student & Header Spoofing Mutation Prevention', () => {
  test('ADV-STU-01: Authenticated Student cannot mutate grievance via PUT /api/grievances/:id (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_STUDENT_1}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken1}`,
      },
      body: JSON.stringify({
        status: 'resolved',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden on student mutation, got ${res.status}`);
    const body = await res.json() as any;
    assert.match(body.error, /STUDENT accounts cannot modify grievances/i);

    const db = getDatabase();
    const row = db.prepare('SELECT status FROM grievances WHERE id = ?').get(ADV_TKT_STUDENT_1) as any;
    assert.equal(row.status, 'open', 'Ticket status must remain unmodified');
  });

  test('ADV-STU-02: Authenticated Student cannot mutate master-notes (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_STUDENT_1}/master-notes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken1}`,
      },
      body: JSON.stringify({
        publicMasterNotes: 'Student injection attempt',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden on student master notes mutation, got ${res.status}`);
  });

  test('ADV-STU-03: Unauthenticated request with x-user-role: student cannot mutate grievance (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'student',
      },
      body: JSON.stringify({
        status: 'resolved',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden for legacy student header mutation, got ${res.status}`);

    const db = getDatabase();
    const row = db.prepare('SELECT status FROM grievances WHERE id = ?').get(ADV_TKT_HOSTEL) as any;
    assert.equal(row.status, 'open');
  });

  test('ADV-STU-04: Unauthenticated request with x-user-role: student cannot mutate master-notes (assert 403 Forbidden)', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}/master-notes`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'student',
      },
      body: JSON.stringify({
        publicMasterNotes: 'Student header spoofing injection',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden for student header master notes mutation, got ${res.status}`);
  });
});

describe('Adversarial RLAC Challenge 5: Malformed, Expired & Tampered Token Mutations', () => {
  test('ADV-AUTH-01: Missing authentication token on GET /api/grievances/:id returns 401 Unauthorized', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_NET}`);
    assert.equal(res.status, 401, `Expected 401 Unauthorized for missing token, got ${res.status}`);
  });

  test('ADV-AUTH-02: Expired JWT token on GET /api/grievances/:id returns 401 Unauthorized', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_NET}`, {
      headers: { Authorization: `Bearer ${expiredStaffToken}` },
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for expired token, got ${res.status}`);
  });

  test('ADV-AUTH-03: Expired JWT token on PUT /api/grievances/:id returns 401 Unauthorized', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_NET}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expiredStaffToken}`,
      },
      body: JSON.stringify({ status: 'resolved' }),
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for expired token on mutation, got ${res.status}`);
  });

  test('ADV-AUTH-04: Tampered signature JWT token on GET returns 401 Unauthorized', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_NET}`, {
      headers: { Authorization: `Bearer ${tamperedSignatureToken}` },
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for tampered token signature, got ${res.status}`);
  });

  test('ADV-AUTH-05: Tampered signature JWT token on PUT returns 401 Unauthorized', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_NET}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tamperedSignatureToken}`,
      },
      body: JSON.stringify({ status: 'resolved' }),
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for tampered token on mutation, got ${res.status}`);
  });

  test('ADV-AUTH-06: Malformed garbage token on PUT returns 401 Unauthorized', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_NET}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer totally.not.a.valid.jwt',
      },
      body: JSON.stringify({ status: 'resolved' }),
    });
    assert.equal(res.status, 401, `Expected 401 Unauthorized for garbage token, got ${res.status}`);
  });
});

describe('Adversarial RLAC Challenge 6: Department-Scoped Grievance Queue & Query Parameter Tampering Resistance', () => {
  test('ADV-QUEUE-01: Dept A staff query returns exclusively Dept A tickets with zero cross-department data spill', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      headers: { Authorization: `Bearer ${networkStaffToken}` },
    });
    assert.equal(res.status, 200);
    const list = await res.json() as any[];
    assert.ok(Array.isArray(list));

    const returnedIds = list.map((g) => g.id);
    assert.ok(returnedIds.includes(ADV_TKT_NET), 'Must include assigned Network ticket');
    assert.equal(returnedIds.includes(ADV_TKT_HOSTEL), false, 'Must NOT leak Hostel ticket');
    assert.equal(returnedIds.includes(ADV_TKT_TRANS), false, 'Must NOT leak Transport ticket');
    assert.equal(returnedIds.includes(ADV_TKT_FAC), false, 'Must NOT leak Facilities ticket');

    for (const item of list) {
      const dept = item.assignedDepartmentId || item.assigned_department_id;
      assert.equal(dept, TEST_DEPARTMENTS.NETWORK_OPS.id, `Ticket ${item.id} has mismatched department ${dept}`);
    }
  });

  test('ADV-QUEUE-02: Query parameter poisoning (?department_id=dept-hostel-admin) does not leak foreign department data', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances?department_id=${TEST_DEPARTMENTS.HOSTEL_ADMIN.id}`, {
      headers: { Authorization: `Bearer ${networkStaffToken}` },
    });
    assert.equal(res.status, 200);
    const list = await res.json() as any[];

    const returnedIds = list.map((g) => g.id);
    assert.equal(returnedIds.includes(ADV_TKT_HOSTEL), false, 'Poisoned query param must not leak Hostel tickets');
  });

  test('ADV-QUEUE-03: Role spoofing query parameter (?role=SUPER_ADMIN) does not elevate department staff privileges', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances?role=SUPER_ADMIN`, {
      headers: { Authorization: `Bearer ${networkStaffToken}` },
    });
    assert.equal(res.status, 200);
    const list = await res.json() as any[];

    const returnedIds = list.map((g) => g.id);
    assert.equal(returnedIds.includes(ADV_TKT_HOSTEL), false, 'Spoofed query role must not bypass department isolation');
    assert.equal(returnedIds.includes(ADV_TKT_TRANS), false, 'Spoofed query role must not leak Transport tickets');
  });

  test('ADV-QUEUE-04: Super Admin query returns complete inventory across all departments', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(res.status, 200);
    const list = await res.json() as any[];

    const returnedIds = list.map((g) => g.id);
    assert.ok(returnedIds.includes(ADV_TKT_NET));
    assert.ok(returnedIds.includes(ADV_TKT_HOSTEL));
    assert.ok(returnedIds.includes(ADV_TKT_TRANS));
    assert.ok(returnedIds.includes(ADV_TKT_FAC));
  });
});

describe('Adversarial RLAC Challenge 7: High-Concurrency Burst & Race Condition Stress Test', () => {
  test('ADV-BURST-01: 50 concurrent requests attempting cross-department IDOR read, write, and student mutations are 100% repelled with 0% bypass rate', async () => {
    const burstPromises: Array<Promise<{ type: string; status: number }>> = [];

    // 1. 15 concurrent cross-department IDOR reads (Network staff -> Hostel ticket)
    for (let i = 0; i < 15; i++) {
      burstPromises.push(
        fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}`, {
          headers: { Authorization: `Bearer ${networkStaffToken}` },
        }).then((res) => ({ type: 'cross_dept_read', status: res.status })),
      );
    }

    // 2. 15 concurrent cross-department IDOR writes (Network staff -> Hostel ticket mutation)
    for (let i = 0; i < 15; i++) {
      burstPromises.push(
        fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${networkStaffToken}`,
          },
          body: JSON.stringify({
            status: 'resolved',
            adminNotes: `CONCURRENCY_BURST_ATTACK_${i}`,
          }),
        }).then((res) => ({ type: 'cross_dept_write', status: res.status })),
      );
    }

    // 3. 10 concurrent student mutation attempts (Student 1 -> Hostel ticket mutation)
    for (let i = 0; i < 10; i++) {
      burstPromises.push(
        fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken1}`,
          },
          body: JSON.stringify({
            status: 'resolved',
            adminNotes: `STUDENT_BURST_ATTACK_${i}`,
          }),
        }).then((res) => ({ type: 'student_write', status: res.status })),
      );
    }

    // 4. 10 concurrent legitimate Super Admin read requests
    for (let i = 0; i < 10; i++) {
      burstPromises.push(
        fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}`, {
          headers: { Authorization: `Bearer ${superAdminToken}` },
        }).then((res) => ({ type: 'superadmin_read', status: res.status })),
      );
    }

    // Await all 50 concurrent requests simultaneously
    const results = await Promise.all(burstPromises);

    assert.equal(results.length, 50, 'All 50 burst requests must complete');

    // Categorize results
    const crossDeptReads = results.filter((r) => r.type === 'cross_dept_read');
    const crossDeptWrites = results.filter((r) => r.type === 'cross_dept_write');
    const studentWrites = results.filter((r) => r.type === 'student_write');
    const superAdminReads = results.filter((r) => r.type === 'superadmin_read');

    // Assertions on unauthorized requests: 100% must return 403 Forbidden
    for (const r of crossDeptReads) {
      assert.equal(r.status, 403, `Cross-department read burst returned status ${r.status}, expected 403`);
    }
    for (const r of crossDeptWrites) {
      assert.equal(r.status, 403, `Cross-department write burst returned status ${r.status}, expected 403`);
    }
    for (const r of studentWrites) {
      assert.equal(r.status, 403, `Student write burst returned status ${r.status}, expected 403`);
    }

    // Super Admin requests must succeed
    for (const r of superAdminReads) {
      assert.equal(r.status, 200, `Super Admin read burst returned status ${r.status}, expected 200`);
    }

    // Post-burst Database Integrity Verification
    const db = getDatabase();
    const targetRow = db.prepare('SELECT status, adminNotes, assigned_department_id FROM grievances WHERE id = ?').get(ADV_TKT_HOSTEL) as any;
    assert.equal(targetRow.status, 'open', 'Hostel ticket status must remain pristine "open" after concurrency burst');
    assert.equal(targetRow.adminNotes, null, 'Hostel ticket adminNotes must remain pristine null after concurrency burst');
    assert.equal(targetRow.assigned_department_id, TEST_DEPARTMENTS.HOSTEL_ADMIN.id, 'Hostel ticket department mapping must remain untouched');
  });
});

describe('Adversarial RLAC Challenge 8: Resource Injection, Boundary Values & Non-Existent IDs', () => {
  test('ADV-INJ-01: SQL injection in grievance ID does not leak data or crash server (returns 404)', async () => {
    const maliciousId = encodeURIComponent(`${ADV_TKT_NET}' OR '1'='1`);
    const res = await fetch(`${serverBaseUrl}/api/grievances/${maliciousId}`, {
      headers: { Authorization: `Bearer ${networkStaffToken}` },
    });
    assert.equal(res.status, 404, `Expected 404 Not Found for SQL injection ID, got ${res.status}`);
  });

  test('ADV-INJ-02: Non-existent grievance ID returns 404 Not Found without leaking schema', async () => {
    const res = await fetch(`${serverBaseUrl}/api/grievances/non_existent_uuid_99999`, {
      headers: { Authorization: `Bearer ${networkStaffToken}` },
    });
    assert.equal(res.status, 404, `Expected 404 for non-existent ticket, got ${res.status}`);
  });

  test('ADV-INJ-03: Contradictory auth headers (valid Dept A in Authorization vs invalid in x-auth-token)', async () => {
    // When both headers are present, verify RLAC still enforces isolation for Dept B ticket
    const res = await fetch(`${serverBaseUrl}/api/grievances/${ADV_TKT_HOSTEL}`, {
      headers: {
        Authorization: `Bearer ${networkStaffToken}`,
        'x-auth-token': 'Bearer invalid.token.spoof',
      },
    });
    assert.equal(res.status, 403, `Expected 403 Forbidden on conflicting header cross-department attempt, got ${res.status}`);
  });
});

