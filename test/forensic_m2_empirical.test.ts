import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDatabase,
  withTransaction,
  resolveDepartmentForCategory,
  createRoutingRule,
  deleteRoutingRule,
  recordAuditLog,
  getAuditLogs,
  getAllDepartments,
  createDepartment,
  updateDepartment,
  updateUserDepartment,
  getUserByEmail,
  saveOutboxEmail,
  getOutboxEmails,
} from '../db.ts';

describe('Forensic Auditor Empirical Verification: Milestone 2', () => {
  test('FA-01: withTransaction guarantees atomic rollback on failure', () => {
    const db = getDatabase();
    const testDeptId = `abort_dept_${Date.now()}`;
    assert.throws(
      () => {
        withTransaction(() => {
          db.prepare(`
            INSERT INTO departments (id, name, code, contact_email, is_active, created_at, updated_at)
            VALUES (?, 'Rollback Test', ?, 'abort@test.edu', 1, datetime('now'), datetime('now'))
          `).run(testDeptId, `ABORT_${Date.now()}`);
          throw new Error('Simulated atomic rollback exception');
        });
      },
      /Simulated atomic rollback exception/
    );

    const abortedRow = db.prepare('SELECT * FROM departments WHERE id = ?').get(testDeptId);
    assert.equal(abortedRow, undefined, 'Database must have rolled back the department insertion');
  });

  test('FA-02: Dynamic category and locationTag routing rule resolution is authentic and non-hardcoded', () => {
    const customCat = `Custom Forensic Category ${Date.now()}`;
    const customLoc = `Forensic Lab Wing ${Date.now()}`;
    const rule = createRoutingRule({
      category: customCat,
      departmentId: 'dept-facilities',
      locationTagPattern: customLoc,
      priorityOrder: 0,
      isActive: true,
    });

    try {
      // 1. Resolve by location tag
      const resLoc = resolveDepartmentForCategory('Unrelated Category', `Building 4 - ${customLoc}`);
      assert.equal(resLoc, 'dept-facilities', 'Location pattern matching must resolve to dept-facilities');

      // 2. Resolve by exact category
      const resCat = resolveDepartmentForCategory(customCat, null);
      assert.equal(resCat, 'dept-facilities', 'Category matching must resolve to dept-facilities');
    } finally {
      deleteRoutingRule(rule.id);
    }
  });

  test('FA-03: Immutable audit logs are genuinely persisted and queryable by actor and entity', () => {
    const testEntityId = `audit_ent_${Date.now()}`;
    const entry = recordAuditLog({
      entityType: 'grievance',
      entityId: testEntityId,
      action: 'FORENSIC_AUDIT_ACTION',
      actorId: 'super-admin-01',
      actorEmail: 'superadmin@college.edu',
      actorRole: 'SUPER_ADMIN',
      previousState: JSON.stringify({ assignedDepartmentId: 'dept-network-ops' }),
      newState: JSON.stringify({ assignedDepartmentId: 'dept-hostel-admin' }),
      reason: 'Empirical verification by forensic auditor',
    });

    assert.ok(entry.id.startsWith('aud_'), 'Audit log entry ID must start with aud_');
    assert.ok(entry.timestamp, 'Audit log entry must contain timestamp');

    const retrieved = getAuditLogs({ entityType: 'grievance', entityId: testEntityId });
    assert.ok(retrieved.length >= 1, 'Querying audit logs by entity must return the entry');
    assert.equal(retrieved[0].action, 'FORENSIC_AUDIT_ACTION');
    assert.equal(retrieved[0].actorRole, 'SUPER_ADMIN');
    assert.equal(retrieved[0].reason, 'Empirical verification by forensic auditor');
  });

  test('FA-04: Department CRUD and user credential provisioning mutate real SQLite records', () => {
    const testCode = `FA_DEPT_${Date.now().toString().slice(-4)}`;
    const createdDept = createDepartment({
      name: 'Forensic Department',
      code: testCode,
      contactEmail: 'forensic.dept@college.edu',
      isActive: true,
    });

    assert.ok(createdDept.id);
    assert.equal(createdDept.code, testCode);

    const updatedDept = updateDepartment(createdDept.id, {
      contactEmail: 'updated.forensic@college.edu',
    });
    assert.equal(updatedDept?.contactEmail, 'updated.forensic@college.edu');

    // Test user credential provisioning
    const provisionedUser = updateUserDepartment('STAFF-NET-01', createdDept.id, 'DEPARTMENT_HEAD');
    assert.ok(provisionedUser);
    assert.equal(provisionedUser?.departmentId, createdDept.id);
    assert.equal(provisionedUser?.role, 'DEPARTMENT_HEAD');

    // Restore user
    updateUserDepartment('STAFF-NET-01', 'dept-network-ops', 'DEPARTMENT_STAFF');
  });

  test('FA-05: Outbox email queue persistence and schema fidelity', () => {
    const emailId = `eml_fa_${Date.now()}`;
    const testRecipient = `recipient_${Date.now()}@college.edu`;
    saveOutboxEmail({
      id: emailId,
      recipient: testRecipient,
      subject: 'Forensic Notification Verification',
      body: 'Testing outbox table durability',
      type: 'dept_alert',
      timestamp: new Date().toISOString(),
    });

    const outboxItems = getOutboxEmails(testRecipient);
    assert.ok(outboxItems.length >= 1, 'Saved outbox item must be retrievable by recipient');
    assert.equal(outboxItems[0].id, emailId);
    assert.equal(outboxItems[0].subject, 'Forensic Notification Verification');
    assert.equal(outboxItems[0].type, 'dept_alert');
  });
});
