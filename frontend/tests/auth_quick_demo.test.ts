import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEPARTMENTS_10, DEMO_ACCOUNTS } from '../data/constants';

describe('Auth & Quick Demo Login Verification Suite', () => {
  test('TC-AUTH-01: DEPARTMENTS_10 contains exactly 10 operational departments matching CREDENTIALS.md', () => {
    assert.equal(DEPARTMENTS_10.length, 10, 'Expected exactly 10 departments in DEPARTMENTS_10');
    
    const requiredCodes = [
      'HOSTEL',
      'MESS',
      'IT_ERP',
      'ACADEMICS',
      'INFRA',
      'TRANSPORT',
      'SECURITY',
      'MEDICAL',
      'ACCOUNTS',
      'STUDENTLIFE',
    ];

    const codes = DEPARTMENTS_10.map((d) => d.code);
    for (const code of requiredCodes) {
      assert.ok(codes.includes(code), `Missing required department code: ${code}`);
    }

    // Verify all departments have id, name, code, contactEmail, and staffId
    for (const dept of DEPARTMENTS_10) {
      assert.ok(dept.id, `Department ${dept.code} must have an id`);
      assert.ok(dept.name, `Department ${dept.code} must have a name`);
      assert.ok(dept.contactEmail.includes('@campus.edu'), `Department ${dept.code} must have a valid email`);
      assert.ok(dept.staffId, `Department ${dept.code} must have a staffId`);
    }
  });

  test('TC-AUTH-02: DEMO_ACCOUNTS contains all 15 credentials matching CREDENTIALS.md', () => {
    assert.equal(DEMO_ACCOUNTS.length, 15, 'Expected exactly 15 demo accounts in DEMO_ACCOUNTS');

    // 1 Super Admin
    const superAdmin = DEMO_ACCOUNTS.find((a) => a.role === 'super_admin' && a.email === 'admin@campus.edu');
    assert.ok(superAdmin, 'Super Admin (admin@campus.edu) must exist');
    assert.equal(superAdmin.password, 'Admin@123', 'Super Admin password must match CREDENTIALS.md');
    assert.equal(superAdmin.devOtp, '123456', 'Dev OTP must be 123456');

    // 10 Department Admins
    const deptAdmins = DEMO_ACCOUNTS.filter((a) => a.role === 'department_admin');
    assert.equal(deptAdmins.length, 10, 'Must have exactly 10 department admin accounts');

    for (const dept of DEPARTMENTS_10) {
      const admin = deptAdmins.find((a) => a.departmentId === dept.id);
      assert.ok(admin, `Must have an admin account for department ${dept.name} (${dept.code})`);
      assert.equal(admin.password, 'Dept@123', `Dept Admin ${admin.email} password must be Dept@123`);
      assert.equal(admin.devOtp, '123456', 'Dev OTP must be 123456');
      assert.ok(admin.email.endsWith('@campus.edu'), `Dept Admin email must end with @campus.edu`);
    }

    // 4 Students
    const students = DEMO_ACCOUNTS.filter((a) => a.role === 'student');
    assert.equal(students.length, 4, 'Must have exactly 4 student accounts');

    const expectedStudents = [
      { email: 'kavin@student.campus.edu', regNo: '2023CSE042', studentType: 'hosteller' },
      { email: 'ananya@student.campus.edu', regNo: '2023ECE015', studentType: 'hosteller' },
      { email: 'rahul@student.campus.edu', regNo: '2022MECH088', studentType: 'dayscholar' },
      { email: 'priya@student.campus.edu', regNo: '2024IT021', studentType: 'hosteller' },
    ];

    for (const exp of expectedStudents) {
      const student = students.find((s) => s.email === exp.email);
      assert.ok(student, `Student ${exp.email} must exist in DEMO_ACCOUNTS`);
      assert.equal(student.regNo, exp.regNo, `Registration number mismatch for ${exp.email}`);
      assert.equal(student.studentType, exp.studentType, `Student type mismatch for ${exp.email}`);
      assert.equal(student.password, 'Student@123', `Password must match CREDENTIALS.md`);
      assert.equal(student.devOtp, '123456', 'Dev OTP must be 123456');
    }
  });

  test('TC-AUTH-03: Quick Demo Login role differentiation', () => {
    for (const acc of DEMO_ACCOUNTS) {
      assert.ok(acc.name, 'Every account must have a name');
      assert.ok(acc.roleTitle, 'Every account must have a roleTitle');
      assert.ok(['super_admin', 'department_admin', 'student'].includes(acc.role), `Valid role required for ${acc.email}`);
      assert.equal(acc.devOtp, '123456', 'Universal dev OTP must be 123456');
    }
  });
});
