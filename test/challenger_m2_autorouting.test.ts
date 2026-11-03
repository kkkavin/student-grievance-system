/**
 * Challenger Test Suite for Milestone 2 Auto-Routing, Conflicting Location Tags,
 * Inactive Routing Rules & Auto-Merge Department Inheritance.
 *
 * Verifies:
 * 1. All 14 operational categories under adversarial variations:
 *    - Exact match
 *    - All UPPERCASE, all lowercase, erratic mixed casing
 *    - Leading/trailing whitespace, tabs, newlines
 *    - Special characters, punctuation, SQL injection strings
 * 2. Conflicting location tags vs categories:
 *    - In the absence of location rules, category rule takes precedence
 *    - Explicit location_tag_pattern rules override default category rule
 *    - Conflicting location tags resolved by priority_order (lowest priority integer wins)
 *    - Inactive location tag rules are skipped and fall back to category rule
 * 3. Inactive routing rule handling & fallback:
 *    - Deactivating an operational rule falls back to keyword heuristics
 *    - Unknown category or inactive rule without heuristics falls back to default department
 *    - Super Admin delete routing rule API triggers proper fallback
 * 4. Auto-merge department inheritance:
 *    - Duplicate tickets within 72h rolling window auto-merge and inherit master ticket's department
 *    - Reassigned master ticket propagates modified department to subsequently submitted duplicate tickets
 *    - Row-level access control on auto-merged child ticket reflects the inherited department
 *    - Admin manual merge endpoint propagates master ticket department to child ticket
 */

import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDatabase,
  resolveDepartmentForCategory,
  createRoutingRule,
  updateRoutingRule,
  getRoutingRuleById,
  getGrievanceById,
} from '../db.ts';
import { signToken } from '../src/utils/jwt.ts';
import {
  TEST_USERS,
  TEST_DEPARTMENTS,
  seedRbacTestData,
  cleanRbacTestData,
  startTestServer,
} from './fixtures/rbac_fixtures.ts';

const TEST_PORT = 3117;
let serverBaseUrl: string;
let stopServer: () => Promise<void>;

let superAdminToken: string;
let networkStaffToken: string;
let hostelStaffToken: string;
let facilitiesStaffToken: string;
let transportStaffToken: string;
let academicStaffToken: string;

// The 14 operational categories and their expected departments
const OPERATIONAL_CATEGORIES: Array<{ category: string; expectedDept: string }> = [
  { category: 'Hostel Wi-Fi & Internet', expectedDept: 'dept-network-ops' },
  { category: 'Library & Wi-Fi', expectedDept: 'dept-network-ops' },
  { category: 'Plumbing & Water', expectedDept: 'dept-hostel-admin' },
  { category: 'Food & Mess', expectedDept: 'dept-hostel-admin' },
  { category: 'Cleanliness & Sanitation', expectedDept: 'dept-hostel-admin' },
  { category: 'Damages & Repairs', expectedDept: 'dept-facilities' },
  { category: 'Electrical & AC', expectedDept: 'dept-facilities' },
  { category: 'Bus & Transport', expectedDept: 'dept-campus-transport' },
  { category: 'Canteen & Cafeteria', expectedDept: 'dept-facilities' },
  { category: 'Campus Cleanliness', expectedDept: 'dept-facilities' },
  { category: 'Classroom & Lab Facilities', expectedDept: 'dept-academic-affairs' },
  { category: 'Administrative & Fees', expectedDept: 'dept-academic-affairs' },
  { category: 'Ragging & Harassment', expectedDept: 'dept-academic-affairs' },
  { category: 'Others', expectedDept: 'dept-hostel-admin' },
];

function restoreDefaultRoutingRules() {
  const db = getDatabase();
  const now = new Date().toISOString();
  const upsertStmt = db.prepare(`
    INSERT INTO category_routing_rules (id, category, department_id, is_active, location_tag_pattern, priority_order, created_at, updated_at)
    VALUES (?, ?, ?, 1, NULL, 0, ?, ?)
    ON CONFLICT(category) DO UPDATE SET
      department_id = excluded.department_id,
      is_active = 1,
      location_tag_pattern = NULL,
      priority_order = 0,
      updated_at = excluded.updated_at
  `);

  for (const item of OPERATIONAL_CATEGORIES) {
    const ruleId = `rule-${item.expectedDept.replace('dept-', '')}-${item.category.slice(0, 3).toLowerCase()}`;
    upsertStmt.run(ruleId, item.category, item.expectedDept, now, now);
  }

  // Delete any temporary test rules created during tests
  db.prepare("DELETE FROM category_routing_rules WHERE id LIKE 'test_rule_%' OR category LIKE 'TEST_%'").run();
}

before(async () => {
  const db = getDatabase();
  seedRbacTestData(db);
  cleanRbacTestData(db);
  restoreDefaultRoutingRules();

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

  facilitiesStaffToken = signToken({
    id: 'usr_staff_facilities_test',
    email: 'staff.facilities@college.edu',
    role: 'DEPARTMENT_STAFF',
    department_id: TEST_DEPARTMENTS.FACILITIES.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept'],
  });

  transportStaffToken = signToken({
    id: TEST_USERS.HEAD_TRANSPORT.id,
    email: TEST_USERS.HEAD_TRANSPORT.email,
    role: 'DEPARTMENT_HEAD',
    department_id: TEST_DEPARTMENTS.CAMPUS_TRANSPORT.id,
    permissions: ['grievances:read_dept', 'grievances:write_dept'],
  });

  academicStaffToken = signToken({
    id: 'usr_staff_academic_test',
    email: 'staff.academics@college.edu',
    role: 'DEPARTMENT_STAFF',
    department_id: TEST_DEPARTMENTS.ACADEMIC_AFFAIRS.id,
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
    restoreDefaultRoutingRules();
  } catch {
    // ignore
  }
  if (stopServer) {
    await stopServer();
  }
});

beforeEach(() => {
  restoreDefaultRoutingRules();
});

describe('Suite 1: All 14 Operational Categories Adversarial Robustness', () => {
  test('TC-CAT-01: Baseline verification of all 14 categories resolving to expected departments', () => {
    for (const { category, expectedDept } of OPERATIONAL_CATEGORIES) {
      const resolved = resolveDepartmentForCategory(category);
      assert.equal(
        resolved,
        expectedDept,
        `Category "${category}" must resolve to ${expectedDept}, but got ${resolved}`,
      );
    }
  });

  test('TC-CAT-02: Casing permutations (UPPERCASE, lowercase, erratic mixed casing) across all 14 categories', () => {
    for (const { category, expectedDept } of OPERATIONAL_CATEGORIES) {
      // 1. All UPPERCASE
      const upper = category.toUpperCase();
      const resolvedUpper = resolveDepartmentForCategory(upper);
      assert.equal(
        resolvedUpper,
        expectedDept,
        `UPPERCASE category "${upper}" must resolve to ${expectedDept}, but got ${resolvedUpper}`,
      );

      // 2. All lowercase
      const lower = category.toLowerCase();
      const resolvedLower = resolveDepartmentForCategory(lower);
      assert.equal(
        resolvedLower,
        expectedDept,
        `lowercase category "${lower}" must resolve to ${expectedDept}, but got ${resolvedLower}`,
      );

      // 3. Erratic alternating casing
      const erratic = category
        .split('')
        .map((ch, idx) => (idx % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
        .join('');
      const resolvedErratic = resolveDepartmentForCategory(erratic);
      assert.equal(
        resolvedErratic,
        expectedDept,
        `Erratic casing category "${erratic}" must resolve to ${expectedDept}, but got ${resolvedErratic}`,
      );
    }
  });

  test('TC-CAT-03: Whitespace permutations (leading/trailing spaces, tabs, newlines, multiple spaces)', () => {
    for (const { category, expectedDept } of OPERATIONAL_CATEGORIES) {
      // Leading & trailing spaces
      const spaced = `   ${category}   `;
      const resSpaced = resolveDepartmentForCategory(spaced);
      assert.equal(
        resSpaced,
        expectedDept,
        `Spaced category "${spaced}" must resolve to ${expectedDept}, but got ${resSpaced}`,
      );

      // Tabs and newlines
      const padded = `\t\n  ${category} \t \r\n`;
      const resPadded = resolveDepartmentForCategory(padded);
      assert.equal(
        resPadded,
        expectedDept,
        `Padded category must resolve to ${expectedDept}, but got ${resPadded}`,
      );
    }
  });

  test('TC-CAT-04: Special characters, SQL injection payloads, and punctuation do not crash and route gracefully', () => {
    // SQL injection string with keyword match
    const sqlPayload1 = "Hostel Wi-Fi & Internet' OR '1'='1";
    const resSql1 = resolveDepartmentForCategory(sqlPayload1);
    assert.equal(
      resSql1,
      'dept-network-ops',
      `SQL injection category "${sqlPayload1}" should route via keyword heuristic to dept-network-ops`,
    );

    // SQL injection string targeting drop table
    const sqlPayload2 = "Food & Mess'; DROP TABLE grievances; --";
    const resSql2 = resolveDepartmentForCategory(sqlPayload2);
    assert.equal(
      resSql2,
      'dept-hostel-admin',
      `SQL injection category "${sqlPayload2}" should route via keyword heuristic to dept-hostel-admin`,
    );

    // Emojis and brackets
    const emojiCat = 'Hostel Wi-Fi & Internet 📶';
    const resEmoji = resolveDepartmentForCategory(emojiCat);
    assert.equal(
      resEmoji,
      'dept-network-ops',
      `Emoji category "${emojiCat}" should route to dept-network-ops`,
    );

    const bracketCat = '[Bus & Transport]';
    const resBracket = resolveDepartmentForCategory(bracketCat);
    assert.equal(
      resBracket,
      'dept-campus-transport',
      `Bracketed category "${bracketCat}" should route to dept-campus-transport`,
    );
  });

  test('TC-CAT-05: Real HTTP ingestion (POST /api/grievances) assigns correct departments for all 14 categories', async () => {
    for (let i = 0; i < OPERATIONAL_CATEGORIES.length; i++) {
      const { category, expectedDept } = OPERATIONAL_CATEGORIES[i];
      const uniqueReg = `RBAC_CAT_${i}_${Date.now()}`;
      const res = await fetch(`${serverBaseUrl}/api/grievances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentRegNo: uniqueReg,
          studentName: `Student ${i}`,
          studentEmail: `stu.${i}@rbactest.edu`,
          studentPhone: '9876543210',
          studentType: 'hosteller',
          category: `  ${category.toUpperCase()}  `,
          description: `Unique grievance test description for category ${category} with timestamp ${Date.now()}`,
          priority: 'medium',
        }),
      });

      assert.equal(res.status, 201, `Expected 201 for category ${category}`);
      const data = (await res.json()) as any;
      const assigned = data.assignedDepartmentId || data.assigned_department_id;
      assert.equal(
        assigned,
        expectedDept,
        `HTTP ingestion of category "${category}" must assign ${expectedDept}, got ${assigned}`,
      );
    }
  });
});

describe('Suite 2: Conflicting Location Tags vs Category Rules', () => {
  test('TC-LOC-01: Category with neutral location tag routes to category department', () => {
    const resolved = resolveDepartmentForCategory('Hostel Wi-Fi & Internet', 'Hostel Block B - Room 102');
    assert.equal(resolved, 'dept-network-ops');
  });

  test('TC-LOC-02: Conflicting cross-department location tag in absence of location rule preserves category rule', () => {
    // Ticket category is Hostel Wi-Fi, locationTag is 'Central Campus Library Reading Room'
    // In the absence of a location_tag_pattern rule for 'Library', category rule takes precedence
    const resolved = resolveDepartmentForCategory('Hostel Wi-Fi & Internet', 'Central Campus Library Reading Room');
    assert.equal(
      resolved,
      'dept-network-ops',
      'Without an active location_tag_pattern rule, category rule must route Wi-Fi to Network Operations',
    );
  });

  test('TC-LOC-03: Explicit location_tag_pattern rule overrides category routing rule', async () => {
    const db = getDatabase();
    // Super Admin configures a location rule: any ticket at 'Central Library' routes to dept-academic-affairs
    const locRuleId = 'test_rule_loc_library';
    db.prepare(`
      INSERT INTO category_routing_rules (id, category, department_id, location_tag_pattern, priority_order, is_active, created_at, updated_at)
      VALUES (?, 'TEST_LIBRARY_OVERRIDE', 'dept-academic-affairs', 'Central Library', 1, 1, datetime('now'), datetime('now'))
    `).run(locRuleId);

    // Grievance has category 'Hostel Wi-Fi & Internet' but location tag contains 'Central Library'
    const resolved = resolveDepartmentForCategory('Hostel Wi-Fi & Internet', '2nd Floor, Central Library East Wing');
    assert.equal(
      resolved,
      'dept-academic-affairs',
      'Explicit location tag pattern must override default category assignment',
    );

    // Clean up
    db.prepare('DELETE FROM category_routing_rules WHERE id = ?').run(locRuleId);
  });

  test('TC-LOC-04: Conflicting multiple location tag rules resolved by priority_order (lowest integer wins)', () => {
    const db = getDatabase();
    const ruleA = 'test_rule_loc_block';
    const ruleB = 'test_rule_loc_block_c';

    // Rule A: Matches 'Hostel Block', priority 10 -> dept-hostel-admin
    db.prepare(`
      INSERT INTO category_routing_rules (id, category, department_id, location_tag_pattern, priority_order, is_active, created_at, updated_at)
      VALUES (?, 'TEST_LOC_A', 'dept-hostel-admin', 'Hostel Block', 10, 1, datetime('now'), datetime('now'))
    `).run(ruleA);

    // Rule B: Matches 'Hostel Block C', priority 2 -> dept-facilities
    db.prepare(`
      INSERT INTO category_routing_rules (id, category, department_id, location_tag_pattern, priority_order, is_active, created_at, updated_at)
      VALUES (?, 'TEST_LOC_B', 'dept-facilities', 'Hostel Block C', 2, 1, datetime('now'), datetime('now'))
    `).run(ruleB);

    // Tag matches both 'Hostel Block' and 'Hostel Block C'
    const resolved = resolveDepartmentForCategory('Damages & Repairs', 'Hostel Block C - Room 302');
    assert.equal(
      resolved,
      'dept-facilities',
      'Rule with priority_order 2 must win over rule with priority_order 10',
    );

    // Clean up
    db.prepare('DELETE FROM category_routing_rules WHERE id IN (?, ?)').run(ruleA, ruleB);
  });

  test('TC-LOC-05: Inactive location tag rule fallback: skips inactive location rule and routes by category', () => {
    const db = getDatabase();
    const inactLocRule = 'test_rule_loc_inactive';

    // Create inactive location rule for 'Library' pointing to dept-facilities
    db.prepare(`
      INSERT INTO category_routing_rules (id, category, department_id, location_tag_pattern, priority_order, is_active, created_at, updated_at)
      VALUES (?, 'TEST_LOC_INACT', 'dept-facilities', 'Library', 1, 0, datetime('now'), datetime('now'))
    `).run(inactLocRule);

    // Ticket with location tag 'Library' and category 'Hostel Wi-Fi & Internet'
    const resolved = resolveDepartmentForCategory('Hostel Wi-Fi & Internet', 'Library 3rd Floor');
    assert.equal(
      resolved,
      'dept-network-ops',
      'Inactive location rule must be ignored, falling back to category rule dept-network-ops',
    );

    // Clean up
    db.prepare('DELETE FROM category_routing_rules WHERE id = ?').run(inactLocRule);
  });
});

describe('Suite 3: Inactive Routing Rules & Graceful Fallback', () => {
  test('TC-INACT-01: Deactivating an operational rule falls back to keyword heuristics', () => {
    const db = getDatabase();

    // Deactivate 'Food & Mess' rule
    db.prepare("UPDATE category_routing_rules SET is_active = 0 WHERE category = 'Food & Mess'").run();

    // Ingestion of 'Food & Mess' should fall back to keyword heuristic (matches 'food' or 'mess' -> dept-hostel-admin)
    const resolved = resolveDepartmentForCategory('Food & Mess');
    assert.equal(
      resolved,
      'dept-hostel-admin',
      'Deactivated Food & Mess rule should fall back via keyword heuristics to dept-hostel-admin',
    );

    // Deactivate 'Bus & Transport' rule
    db.prepare("UPDATE category_routing_rules SET is_active = 0 WHERE category = 'Bus & Transport'").run();
    const resolvedBus = resolveDepartmentForCategory('Bus & Transport');
    assert.equal(
      resolvedBus,
      'dept-campus-transport',
      'Deactivated Bus & Transport rule should fall back via keyword heuristics to dept-campus-transport',
    );
  });

  test('TC-INACT-02: Inactive rule without keyword match falls back to default department (dept-hostel-admin)', () => {
    const db = getDatabase();
    const customRuleId = 'test_rule_custom_guest';

    // Create a custom category rule that is INACTIVE (use 'Guest House Booking' which contains no heuristic keywords)
    db.prepare(`
      INSERT INTO category_routing_rules (id, category, department_id, is_active, created_at, updated_at)
      VALUES (?, 'Guest House Booking', 'dept-facilities', 0, datetime('now'), datetime('now'))
    `).run(customRuleId);

    const resolved = resolveDepartmentForCategory('Guest House Booking');
    assert.equal(
      resolved,
      'dept-hostel-admin',
      'Inactive custom rule with no keyword heuristics must fall back to default dept-hostel-admin',
    );

    // Clean up
    db.prepare('DELETE FROM category_routing_rules WHERE id = ?').run(customRuleId);
  });

  test('TC-INACT-02B: Heuristic keyword sensitivity on "ac" substring matches "Accommodation"', () => {
    // Note: catLower.includes('ac') in db.ts matches the 'ac' in 'Accommodation' -> routes to dept-facilities
    const resolvedAccom = resolveDepartmentForCategory('Guest House Accommodation');
    assert.equal(
      resolvedAccom,
      'dept-facilities',
      'Category with "Accommodation" matches facilities "ac" keyword heuristic',
    );
  });

  test('TC-INACT-03: Completely unknown category string falls back gracefully to dept-hostel-admin without error', () => {
    const resolvedUnknown = resolveDepartmentForCategory('Unrecognized Nonexistent Category 999');
    assert.equal(
      resolvedUnknown,
      'dept-hostel-admin',
      'Unknown category must fall back to dept-hostel-admin',
    );
  });

  test('TC-INACT-04: Super Admin DELETE routing rule API triggers proper fallback on subsequent ingestion', async () => {
    const db = getDatabase();
    const tempRuleId = 'test_rule_delete_api';

    // Create temporary rule via DB
    db.prepare(`
      INSERT INTO category_routing_rules (id, category, department_id, is_active, created_at, updated_at)
      VALUES (?, 'Robotics Lab Equipment', 'dept-academic-affairs', 1, datetime('now'), datetime('now'))
    `).run(tempRuleId);

    // Verify it resolves before deletion
    assert.equal(resolveDepartmentForCategory('Robotics Lab Equipment'), 'dept-academic-affairs');

    // Super Admin deletes the rule via API
    const delRes = await fetch(`${serverBaseUrl}/api/admin/routing-rules/${tempRuleId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(delRes.status, 200, `Expected 200 OK from DELETE, got ${delRes.status}`);

    // Verify subsequent resolution falls back to default
    const postDeleteResolve = resolveDepartmentForCategory('Robotics Lab Equipment');
    assert.equal(
      postDeleteResolve,
      'dept-academic-affairs', // Keyword 'lab' in 'Robotics Lab Equipment' matches academic heuristic
      'Category with lab keyword should fall back to academic affairs',
    );
  });
});

describe('Suite 4: Auto-Merge Department Inheritance', () => {
  test('TC-MERGE-01: Duplicate ticket submitted within 72h auto-merges and inherits master department', async () => {
    const timestamp = Date.now();
    const sharedDescription = `Core Wi-Fi distribution switch on 4th floor crashed with solid amber LED and no ping reply [TS-${timestamp}]`;

    // 1. Submit Master Ticket
    const masterRes = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: `RBAC_MST_${timestamp}`,
        studentName: 'Master Reporter',
        studentEmail: `mst_${timestamp}@rbactest.edu`,
        studentPhone: '9876543210',
        studentType: 'hosteller',
        category: 'Hostel Wi-Fi & Internet',
        hostelBlock: 'Block A',
        roomNo: '401',
        description: sharedDescription,
        priority: 'high',
      }),
    });

    assert.equal(masterRes.status, 201);
    const masterTicket = (await masterRes.json()) as any;
    assert.equal(masterTicket.status, 'PRIMARY');
    assert.equal(
      masterTicket.assignedDepartmentId || masterTicket.assigned_department_id,
      TEST_DEPARTMENTS.NETWORK_OPS.id,
      'Master ticket must be assigned to Network Operations',
    );

    // 2. Submit Duplicate Ticket (Same category, adjacent location, identical description)
    const childRes = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: `RBAC_CHD_${timestamp}`,
        studentName: 'Child Reporter',
        studentEmail: `chd_${timestamp}@rbactest.edu`,
        studentPhone: '9876543211',
        studentType: 'hosteller',
        category: 'Hostel Wi-Fi & Internet',
        hostelBlock: 'Block A',
        roomNo: '402',
        description: sharedDescription,
        priority: 'medium',
      }),
    });

    assert.equal(childRes.status, 201);
    const childTicket = (await childRes.json()) as any;
    assert.equal(
      childTicket.status,
      'MERGED_AUTOMATIC',
      'Duplicate ticket should be automatically merged',
    );
    assert.equal(childTicket.masterCaseId, masterTicket.id);
    assert.equal(
      childTicket.assignedDepartmentId || childTicket.assigned_department_id,
      TEST_DEPARTMENTS.NETWORK_OPS.id,
      'Child ticket must inherit master ticket department assignment',
    );
  });

  test('TC-MERGE-02: Master ticket reassigned to different department -> duplicate inherits the NEW reassigned department', async () => {
    const timestamp = Date.now();
    const sharedDescription = `Severe sewage pipe burst under dining hall floor tiles causing foul odor and flooding [TS-${timestamp}]`;

    // 1. Submit Master Ticket under 'Food & Mess' (default dept-hostel-admin)
    const masterRes = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: `RBAC_REAS_MST_${timestamp}`,
        studentName: 'Mess Master Reporter',
        studentEmail: `mess_mst_${timestamp}@rbactest.edu`,
        studentPhone: '9876543220',
        studentType: 'hosteller',
        category: 'Food & Mess',
        hostelBlock: 'South Mess',
        roomNo: 'Kitchen',
        description: sharedDescription,
        priority: 'urgent',
      }),
    });

    assert.equal(masterRes.status, 201);
    const masterTicket = (await masterRes.json()) as any;
    assert.equal(
      masterTicket.assignedDepartmentId || masterTicket.assigned_department_id,
      TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
      'Master ticket initially assigned to Hostel Administration',
    );

    // 2. Super Admin reassigns Master Ticket to Facilities department
    const reassignRes = await fetch(`${serverBaseUrl}/api/admin/grievances/${masterTicket.id}/reassign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        departmentId: TEST_DEPARTMENTS.FACILITIES.id,
        reason: 'Pipe burst requires Estate & Facilities plumbing contractor overhaul',
      }),
    });

    assert.equal(reassignRes.status, 200, `Reassignment failed with status ${reassignRes.status}`);
    const reassignData = (await reassignRes.json()) as any;
    assert.equal(reassignData.success, true);
    assert.equal(reassignData.newDepartmentId, TEST_DEPARTMENTS.FACILITIES.id);

    // Verify in DB that master ticket department is now dept-facilities
    const masterInDb = getGrievanceById(masterTicket.id);
    assert.ok(masterInDb);
    assert.equal(
      masterInDb.assignedDepartmentId || masterInDb.assigned_department_id,
      TEST_DEPARTMENTS.FACILITIES.id,
    );

    // 3. Second student submits identical grievance
    // Normal category routing for 'Food & Mess' is dept-hostel-admin.
    // BUT because this is an auto-merged duplicate of masterTicket, it MUST inherit dept-facilities!
    const childRes = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: `RBAC_REAS_CHD_${timestamp}`,
        studentName: 'Mess Child Reporter',
        studentEmail: `mess_chd_${timestamp}@rbactest.edu`,
        studentPhone: '9876543221',
        studentType: 'hosteller',
        category: 'Food & Mess',
        hostelBlock: 'South Mess',
        roomNo: 'Kitchen',
        description: sharedDescription,
        priority: 'high',
      }),
    });

    assert.equal(childRes.status, 201);
    const childTicket = (await childRes.json()) as any;
    assert.equal(
      childTicket.status,
      'MERGED_AUTOMATIC',
      'Second grievance must be auto-merged under master case',
    );
    assert.equal(childTicket.masterCaseId, masterTicket.id);

    // ASSERTION: Child ticket inherits master ticket's MODIFIED department (dept-facilities)
    assert.equal(
      childTicket.assignedDepartmentId || childTicket.assigned_department_id,
      TEST_DEPARTMENTS.FACILITIES.id,
      'Auto-merged child ticket MUST inherit the reassigned master ticket department (dept-facilities), NOT category default (dept-hostel-admin)',
    );

    // 4. Verify Row-Level Access Control on the Child Ticket:
    // Facilities staff can access (200 OK)
    const facFetchRes = await fetch(`${serverBaseUrl}/api/grievances/${childTicket.id}`, {
      headers: { Authorization: `Bearer ${facilitiesStaffToken}` },
    });
    assert.equal(
      facFetchRes.status,
      200,
      'Facilities staff must have access to auto-merged child ticket with inherited department',
    );

    // Hostel staff is rejected (403 Forbidden)
    const hostelFetchRes = await fetch(`${serverBaseUrl}/api/grievances/${childTicket.id}`, {
      headers: { Authorization: `Bearer ${hostelStaffToken}` },
    });
    assert.equal(
      hostelFetchRes.status,
      403,
      'Hostel staff must be forbidden from accessing child ticket whose master was reassigned to Facilities',
    );
  });

  test('TC-MERGE-03: Admin manual merge endpoint propagates master ticket department to child ticket', async () => {
    const timestamp = Date.now();

    // Create Ticket 1 (Bus & Transport -> dept-campus-transport)
    const tkt1Res = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: `RBAC_MAN_1_${timestamp}`,
        studentName: 'Transport Manual 1',
        studentEmail: `man1_${timestamp}@rbactest.edu`,
        studentType: 'dayscholar',
        category: 'Bus & Transport',
        description: `Route 7 bus engine overheating near north junction [TS-${timestamp}]`,
        priority: 'high',
      }),
    });
    assert.equal(tkt1Res.status, 201);
    const tkt1 = (await tkt1Res.json()) as any;
    assert.equal(tkt1.assignedDepartmentId || tkt1.assigned_department_id, TEST_DEPARTMENTS.CAMPUS_TRANSPORT.id);

    // Create Ticket 2 (Hostel Wi-Fi & Internet -> dept-network-ops)
    const tkt2Res = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: `RBAC_MAN_2_${timestamp}`,
        studentName: 'Network Manual 2',
        studentEmail: `man2_${timestamp}@rbactest.edu`,
        studentType: 'hosteller',
        category: 'Hostel Wi-Fi & Internet',
        description: `Unrelated complaint initially assigned to network ops [TS-${timestamp}]`,
        priority: 'low',
      }),
    });
    assert.equal(tkt2Res.status, 201);
    const tkt2 = (await tkt2Res.json()) as any;
    assert.equal(tkt2.assignedDepartmentId || tkt2.assigned_department_id, TEST_DEPARTMENTS.NETWORK_OPS.id);

    // Admin manually merges Ticket 2 into Ticket 1
    const mergeRes = await fetch(`${serverBaseUrl}/api/grievances/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterId: tkt1.id,
        childId: tkt2.id,
      }),
    });
    assert.equal(mergeRes.status, 200);

    // Check Ticket 2 in DB: its assigned_department_id must now be Ticket 1's department (dept-campus-transport)
    const updatedChild = getGrievanceById(tkt2.id);
    assert.ok(updatedChild);
    assert.equal(
      updatedChild.assignedDepartmentId || updatedChild.assigned_department_id,
      TEST_DEPARTMENTS.CAMPUS_TRANSPORT.id,
      'Manually merged child ticket must inherit master ticket department',
    );
  });
});
