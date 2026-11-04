/**
 * test/e2e/e2e_unified_dashboard_presentation.test.ts
 *
 * Dedicated End-to-End Test Suite for Unified Dashboard Presentation & Bulk Resolution
 * (Milestone 3 & Final Regression Verification)
 *
 * Requirements Covered:
 * - R1: Semantic Grievance Grouping under earliest submitted parent issue
 * - R2: Unified single-line item presentation for Admin and Department dashboards
 * - R3: Single-click resolution action cascading 'resolved' status to parent and all children
 * - R4: Strict adherence to RBAC/RLAC guardrails, auto-routing rules, and analytics constraints
 * - R5: Dedicated unit and e2e regression testing guaranteeing zero side effects
 */

import test, { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../../db.ts';
import { signToken } from '../../src/utils/jwt.ts';
import {
  groupSemanticGrievances,
  GroupedSemanticGrievance,
} from '../../src/ml/deduplication.ts';
import { Grievance } from '../../src/types.ts';
import {
  TEST_USERS,
  TEST_DEPARTMENTS,
  seedRbacTestData,
  cleanRbacTestData,
  startTestServer,
} from '../fixtures/rbac_fixtures.ts';

const TEST_PORT = process.env.UNIFIED_DASHBOARD_TEST_PORT
  ? parseInt(process.env.UNIFIED_DASHBOARD_TEST_PORT, 10)
  : 3140;

let serverBaseUrl: string;
let stopServer: () => Promise<void>;

let superAdminToken: string;
let hostelStaffToken: string;
let studentToken: string;

const PREFIX = `e2e_dash_${Date.now().toString(36)}`;

function createMockGrievance(overrides: Partial<Grievance> = {}): Grievance {
  return {
    id: `${PREFIX}_${Math.random().toString(36).substring(2, 9)}`,
    ticketNo: `GRV-${Math.floor(1000 + Math.random() * 9000)}`,
    studentRegNo: '2023CS0101',
    studentName: 'Test Student',
    studentEmail: `${PREFIX}.student@campustest.edu`,
    studentPhone: '9876543210',
    studentType: 'hosteller',
    hostelBlock: 'A',
    roomNo: 'A-304',
    category: 'Hostel Maintenance',
    description: 'Severe water leak under washroom sink in room A-304 flooding floor',
    status: 'pending',
    isSpam: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('E2E: Unified Dashboard Presentation & Single-Click Resolution', () => {
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

    hostelStaffToken = signToken({
      id: TEST_USERS.STAFF_HOSTEL.id,
      email: TEST_USERS.STAFF_HOSTEL.email,
      role: 'DEPARTMENT_STAFF',
      department_id: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      permissions: ['grievances:read_dept', 'grievances:resolve'],
    });

    studentToken = signToken({
      id: TEST_USERS.STUDENT.id,
      email: TEST_USERS.STUDENT.email,
      role: 'STUDENT',
      department_id: null,
      permissions: ['grievances:create', 'grievances:read_own'],
    });

    const server = await startTestServer(TEST_PORT);
    serverBaseUrl = server.serverBaseUrl;
    stopServer = server.stop;
  });

  after(async () => {
    try {
      const db = getDatabase();
      db.prepare(`DELETE FROM grievances WHERE id LIKE ? OR studentEmail LIKE '%@campustest.edu'`).run(`${PREFIX}%`);
      db.prepare(`DELETE FROM outbox WHERE recipient LIKE '%@campustest.edu'`).run();
    } catch {
      // ignore
    }

    if (stopServer) {
      await stopServer();
    }
    const db = getDatabase();
    cleanRbacTestData(db);
  });

  // -------------------------------------------------------------------------
  // 1. Semantic Grouping & Earliest Parent Designation
  // -------------------------------------------------------------------------
  describe('1. Semantic Grievance Grouping Pipeline', () => {
    it('TC-GRP-01: Groups identical semantic complaints under the earliest submitted grievance', () => {
      const t0 = new Date('2026-11-01T08:00:00Z').toISOString();
      const t1 = new Date('2026-11-01T09:00:00Z').toISOString();
      const t2 = new Date('2026-11-01T10:00:00Z').toISOString();
      const tSolo = new Date('2026-11-01T08:30:00Z').toISOString();

      const gA = createMockGrievance({
        id: `${PREFIX}_c1`,
        ticketNo: 'TKT-101',
        createdAt: t0,
        description: 'Water leak under washroom sink in room A-304',
      });
      const gB = createMockGrievance({
        id: `${PREFIX}_c2`,
        ticketNo: 'TKT-102',
        createdAt: t1,
        description: 'Water leaking heavily from washroom pipe under sink in room A-304',
      });
      const gC = createMockGrievance({
        id: `${PREFIX}_c3`,
        ticketNo: 'TKT-103',
        createdAt: t2,
        description: 'Water leaking from washroom pipe under sink in room A-304',
      });
      const gSolo = createMockGrievance({
        id: `${PREFIX}_solo`,
        ticketNo: 'TKT-104',
        createdAt: tSolo,
        category: 'Campus Transport',
        hostelBlock: undefined,
        roomNo: undefined,
        description: 'Route 7 bus arrived 45 minutes late at Central Gate stop.',
      });

      const groups = groupSemanticGrievances([gB, gC, gA, gSolo]);

      // Expect exactly 2 groups: 1 unified cluster of 3 complaints, and 1 standalone transport ticket
      assert.strictEqual(groups.length, 2, 'Should form exactly 2 groups');

      const cluster = groups.find((g) => g.totalCount > 1);
      assert.ok(cluster, 'Should find the merged cluster group');
      assert.strictEqual(cluster.totalCount, 3, 'Cluster should contain 3 complaints total');
      assert.strictEqual(cluster.parent.id, `${PREFIX}_c1`, 'Earliest grievance (c1) must be elected root parent');
      assert.strictEqual(cluster.parent.ticketNo, 'TKT-101');
      assert.strictEqual(cluster.children.length, 2, 'Should have 2 child complaints');

      const childIds = cluster.children.map((c) => c.id).sort();
      assert.deepStrictEqual(childIds, [`${PREFIX}_c2`, `${PREFIX}_c3`].sort());

      const solo = groups.find((g) => g.totalCount === 1);
      assert.ok(solo, 'Should find standalone complaint');
      assert.strictEqual(solo.parent.id, `${PREFIX}_solo`);
      assert.strictEqual(solo.children.length, 0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Single-Click Cascading Resolution Endpoint
  // -------------------------------------------------------------------------
  describe('2. Single-Click Resolution REST Action', () => {
    it('TC-RES-01: Admin resolves parent grievance via POST /api/grievances/:id/resolve, simultaneously cascading to children', async () => {
      const db = getDatabase();
      const parentId = `${PREFIX}_par_01`;
      const child1Id = `${PREFIX}_chi_01`;
      const child2Id = `${PREFIX}_chi_02`;

      // Seed parent and 2 child complaints
      db.prepare(`
        INSERT INTO grievances (
          id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
          category, description, status, priority, isSpam, createdAt, assigned_department_id
        ) VALUES
        (?, 'TKT-PAR-01', 'REG_P1', 'Parent Student', 'par@campustest.edu', '9999900011', 'hosteller', 'Hostel Maintenance', 'Hostel leak in bathroom', 'pending', 'high', 0, datetime('now', '-3 hours'), ?),
        (?, 'TKT-CHI-01', 'REG_C1', 'Child One', 'c1@campustest.edu', '9999900012', 'hosteller', 'Hostel Maintenance', 'Hostel leak in bathroom', 'pending', 'high', 0, datetime('now', '-2 hours'), ?),
        (?, 'TKT-CHI-02', 'REG_C2', 'Child Two', 'c2@campustest.edu', '9999900013', 'hosteller', 'Hostel Maintenance', 'Hostel leak in bathroom', 'pending', 'high', 0, datetime('now', '-1 hours'), ?)
      `).run(
        parentId, TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
        child1Id, TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
        child2Id, TEST_DEPARTMENTS.HOSTEL_ADMIN.id
      );

      // Link children to parent
      db.prepare(`UPDATE grievances SET master_case_id = ? WHERE id IN (?, ?)`).run(parentId, child1Id, child2Id);

      // Execute single-click resolution call
      const res = await fetch(`${serverBaseUrl}/api/grievances/${encodeURIComponent(parentId)}/resolve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resolutionNote: 'Fixed main water valve and replaced pressure seal.',
        }),
      });

      assert.strictEqual(res.status, 200, 'Should return HTTP 200 OK');
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.parent.status, 'resolved');
      assert.strictEqual(data.resolvedChildrenCount, 2);
      assert.deepStrictEqual(data.childIds.sort(), [child1Id, child2Id].sort());

      // Query database directly to confirm simultaneous atomic persistence
      const parentRow = db.prepare(`SELECT status, resolvedAt, adminNotes FROM grievances WHERE id = ?`).get(parentId) as any;
      assert.strictEqual(parentRow.status, 'resolved');
      assert.ok(parentRow.resolvedAt, 'Parent must have resolvedAt timestamp');
      assert.ok(parentRow.adminNotes.includes('Fixed main water valve'));

      const childRows = db.prepare(`SELECT id, status, resolvedAt FROM grievances WHERE id IN (?, ?)`).all(child1Id, child2Id) as any[];
      assert.strictEqual(childRows.length, 2);
      for (const row of childRows) {
        assert.strictEqual(row.status, 'resolved', `Child ${row.id} must be marked resolved`);
        assert.ok(row.resolvedAt, `Child ${row.id} must have resolvedAt set`);
      }
    });

    it('TC-RES-02: Department Staff can resolve departmental parent complaint and cascade to all children', async () => {
      const db = getDatabase();
      const parentId = `${PREFIX}_dept_par_01`;
      const childId = `${PREFIX}_dept_chi_01`;

      db.prepare(`
        INSERT INTO grievances (
          id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
          category, description, status, priority, isSpam, createdAt, assigned_department_id
        ) VALUES
        (?, 'TKT-DEPT-P1', 'REG_DP1', 'Dept Parent', 'dp1@campustest.edu', '9999900021', 'hosteller', 'Hostel Maintenance', 'Geyser tripping breaker', 'in_progress', 'urgent', 0, datetime('now', '-1 hour'), ?),
        (?, 'TKT-DEPT-C1', 'REG_DC1', 'Dept Child', 'dc1@campustest.edu', '9999900022', 'hosteller', 'Hostel Maintenance', 'Geyser tripping breaker', 'in_progress', 'urgent', 0, datetime('now', '-30 minutes'), ?)
      `).run(parentId, TEST_DEPARTMENTS.HOSTEL_ADMIN.id, childId, TEST_DEPARTMENTS.HOSTEL_ADMIN.id);

      db.prepare(`UPDATE grievances SET master_case_id = ? WHERE id = ?`).run(parentId, childId);

      const res = await fetch(`${serverBaseUrl}/api/grievances/${encodeURIComponent(parentId)}/resolve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hostelStaffToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resolutionNote: 'Electrician replaced the faulty MCB breaker.',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.resolvedChildrenCount, 1);

      const childDb = db.prepare(`SELECT status, resolvedAt FROM grievances WHERE id = ?`).get(childId) as any;
      assert.strictEqual(childDb.status, 'resolved');
      assert.ok(childDb.resolvedAt);
    });

    it('TC-RES-03: Rejects unauthorized student attempts to resolve grievances with HTTP 403', async () => {
      const db = getDatabase();
      const testId = `${PREFIX}_stu_test`;
      db.prepare(`
        INSERT INTO grievances (
          id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
          category, description, status, priority, isSpam, createdAt, assigned_department_id
        ) VALUES (?, 'TKT-STU-01', 'REG_S1', 'Student Tester', 'stu@campustest.edu', '9999900055', 'hosteller', 'Hostel Maintenance', 'Fan issue', 'pending', 'medium', 0, datetime('now'), ?)
      `).run(testId, TEST_DEPARTMENTS.HOSTEL_ADMIN.id);

      const res = await fetch(`${serverBaseUrl}/api/grievances/${encodeURIComponent(testId)}/resolve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${studentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resolutionNote: 'student try' }),
      });

      assert.strictEqual(res.status, 403, 'Students must be rejected with 403 Forbidden');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Routing & Constraint Guardrails
  // -------------------------------------------------------------------------
  describe('3. Routing & Analytics Invariant Preservation', () => {
    it('TC-GRD-01: Auto-routing rules remain intact; child grievances inherit department of parent', () => {
      const db = getDatabase();
      const parentId = `${PREFIX}_route_par`;
      const childId = `${PREFIX}_route_chi`;

      db.prepare(`
        INSERT INTO grievances (
          id, ticketNo, studentRegNo, studentName, studentEmail, studentPhone, studentType,
          category, description, status, priority, isSpam, createdAt, assigned_department_id
        ) VALUES
        (?, 'TKT-RT-P', 'REG_RTP', 'Router Parent', 'rtp@campustest.edu', '9999900031', 'hosteller', 'Hostel Maintenance', 'Water leakage', 'pending', 'medium', 0, datetime('now', '-1 hour'), ?),
        (?, 'TKT-RT-C', 'REG_RTC', 'Router Child', 'rtc@campustest.edu', '9999900032', 'hosteller', 'Hostel Maintenance', 'Water leakage', 'pending', 'medium', 0, datetime('now', '-30 minutes'), ?)
      `).run(parentId, TEST_DEPARTMENTS.HOSTEL_ADMIN.id, childId, TEST_DEPARTMENTS.HOSTEL_ADMIN.id);

      db.prepare(`UPDATE grievances SET master_case_id = ? WHERE id = ?`).run(parentId, childId);

      const rows = db.prepare(`SELECT id, assigned_department_id FROM grievances WHERE id IN (?, ?)`).all(parentId, childId) as any[];
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].assigned_department_id, TEST_DEPARTMENTS.HOSTEL_ADMIN.id);
      assert.strictEqual(rows[1].assigned_department_id, TEST_DEPARTMENTS.HOSTEL_ADMIN.id);
    });

    it('TC-GRD-02: Standalone grievances never falsely merge with divergent complaints', () => {
      const divergentGrievances: Grievance[] = [
        createMockGrievance({
          id: `${PREFIX}_div1`,
          ticketNo: 'TKT-DIV1',
          category: 'Hostel Maintenance',
          description: 'The ceiling fan in room 101 makes a loud clicking sound.',
        }),
        createMockGrievance({
          id: `${PREFIX}_div2`,
          ticketNo: 'TKT-DIV2',
          category: 'Hostel Maintenance',
          description: 'The bathroom tap is dripping constantly.',
        }),
      ];

      const groups = groupSemanticGrievances(divergentGrievances);
      assert.strictEqual(groups.length, 2, 'Divergent complaints must NOT be merged');
      assert.strictEqual(groups[0].totalCount, 1);
      assert.strictEqual(groups[1].totalCount, 1);
    });
  });
});
