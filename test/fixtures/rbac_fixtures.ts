/**
 * RBAC & Notification Isolation Test Fixtures and Harness
 * Provides standard test users, seed data credentials, department definitions,
 * category routing rules, and server lifecycle helpers for E2E testing.
 */

import { DatabaseSync } from 'node:sqlite';
import { spawn, ChildProcess } from 'node:child_process';
import assert from 'node:assert/strict';

export interface TestUser {
  id: string;
  regNo: string;
  name: string;
  email: string;
  password: string;
  role: 'SUPER_ADMIN' | 'DEPARTMENT_HEAD' | 'DEPARTMENT_STAFF' | 'STUDENT';
  department_id: string | null;
  departmentCode?: string;
}

export interface TestDepartment {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
  isActive: boolean;
}

export const TEST_DEPARTMENTS: Record<string, TestDepartment> = {
  NETWORK_OPS: {
    id: 'dept-network-ops',
    name: 'Network Operations',
    code: 'NET_OPS',
    contactEmail: 'network-ops@college.edu',
    isActive: true,
  },
  HOSTEL_ADMIN: {
    id: 'dept-hostel-admin',
    name: 'Hostel Administration',
    code: 'HOSTEL_ADMIN',
    contactEmail: 'hostel-admin@college.edu',
    isActive: true,
  },
  CAMPUS_TRANSPORT: {
    id: 'dept-campus-transport',
    name: 'Campus Transport',
    code: 'CAMPUS_TRANSPORT',
    contactEmail: 'transport@college.edu',
    isActive: true,
  },
  FACILITIES: {
    id: 'dept-facilities',
    name: 'Campus Facilities & Estate',
    code: 'FACILITIES',
    contactEmail: 'facilities@college.edu',
    isActive: true,
  },
  ACADEMIC_AFFAIRS: {
    id: 'dept-academic-affairs',
    name: 'Academic & Student Affairs',
    code: 'ACADEMIC_AFFAIRS',
    contactEmail: 'academics@college.edu',
    isActive: true,
  },
};

export const TEST_USERS: Record<string, TestUser> = {
  SUPER_ADMIN: {
    id: 'usr_super_admin_rbac',
    regNo: 'ADM_SA_01',
    name: 'Chief Super Administrator',
    email: 'admin.grievance@college.edu',
    password: 'adminpass123',
    role: 'SUPER_ADMIN',
    department_id: null,
  },
  HEAD_NETWORK: {
    id: 'usr_head_net_rbac',
    regNo: 'STAFF_NET_01',
    name: 'Network Operations Head',
    email: 'head.network@college.edu',
    password: 'adminpass123',
    role: 'DEPARTMENT_HEAD',
    department_id: 'dept-network-ops',
    departmentCode: 'NET_OPS',
  },
  STAFF_NETWORK: {
    id: 'usr_staff_net_rbac',
    regNo: 'STAFF_NET_02',
    name: 'Network Operations Staff',
    email: 'staff.network@college.edu',
    password: 'adminpass123',
    role: 'DEPARTMENT_STAFF',
    department_id: 'dept-network-ops',
    departmentCode: 'NET_OPS',
  },
  HEAD_HOSTEL: {
    id: 'usr_head_hostel_rbac',
    regNo: 'STAFF_HST_01',
    name: 'Hostel Warden Head',
    email: 'head.hostel@college.edu',
    password: 'adminpass123',
    role: 'DEPARTMENT_HEAD',
    department_id: 'dept-hostel-admin',
    departmentCode: 'HOSTEL_ADMIN',
  },
  STAFF_HOSTEL: {
    id: 'usr_staff_hostel_rbac',
    regNo: 'STAFF_HST_02',
    name: 'Hostel Warden Staff',
    email: 'staff.hostel@college.edu',
    password: 'adminpass123',
    role: 'DEPARTMENT_STAFF',
    department_id: 'dept-hostel-admin',
    departmentCode: 'HOSTEL_ADMIN',
  },
  HEAD_TRANSPORT: {
    id: 'usr_head_trans_rbac',
    regNo: 'STAFF_TRN_01',
    name: 'Transport Incharge Head',
    email: 'head.transport@college.edu',
    password: 'adminpass123',
    role: 'DEPARTMENT_HEAD',
    department_id: 'dept-campus-transport',
    departmentCode: 'CAMPUS_TRANSPORT',
  },
  STUDENT: {
    id: 'usr_student_rbac',
    regNo: '2023CS099',
    name: 'Rahul Student',
    email: 'rahul.cs23@college.edu',
    password: 'student123',
    role: 'STUDENT',
    department_id: null,
  },
};

export const DEFAULT_CATEGORY_ROUTING: Array<{ category: string; departmentId: string }> = [
  { category: 'Hostel Wi-Fi & Internet', departmentId: 'dept-network-ops' },
  { category: 'Library & Wi-Fi', departmentId: 'dept-network-ops' },
  { category: 'Plumbing & Water', departmentId: 'dept-hostel-admin' },
  { category: 'Food & Mess', departmentId: 'dept-hostel-admin' },
  { category: 'Cleanliness & Sanitation', departmentId: 'dept-hostel-admin' },
  { category: 'Bus & Transport', departmentId: 'dept-campus-transport' },
  { category: 'Damages & Repairs', departmentId: 'dept-facilities' },
  { category: 'Electrical & AC', departmentId: 'dept-facilities' },
  { category: 'Canteen & Cafeteria', departmentId: 'dept-facilities' },
  { category: 'Campus Cleanliness', departmentId: 'dept-facilities' },
  { category: 'Classroom & Lab Facilities', departmentId: 'dept-academic-affairs' },
  { category: 'Administrative & Fees', departmentId: 'dept-academic-affairs' },
  { category: 'Ragging & Harassment', departmentId: 'dept-academic-affairs' },
  { category: 'Others', departmentId: 'dept-hostel-admin' },
];

/**
 * Checks table existence in SQLite database
 */
export function doesTableExist(db: DatabaseSync, tableName: string): boolean {
  try {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tableName);
    return !!row;
  } catch {
    return false;
  }
}

/**
 * Seed or verify RBAC test users and departments
 */
export function seedRbacTestData(db: DatabaseSync): void {
  // 1. Ensure departments exist
  if (doesTableExist(db, 'departments')) {
    const stmt = db.prepare(`
      INSERT INTO departments (id, name, code, contact_email, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        code = excluded.code,
        contact_email = excluded.contact_email,
        is_active = excluded.is_active
    `);

    for (const dept of Object.values(TEST_DEPARTMENTS)) {
      try {
        stmt.run(dept.id, dept.name, dept.code, dept.contactEmail);
      } catch (err) {
        // Table might have slight variation, fallback
      }
    }
  }

  // 2. Ensure users exist with updated roles and department_id
  if (doesTableExist(db, 'users')) {
    const userColumns = (db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name);
    const hasDeptId = userColumns.includes('department_id');

    for (const user of Object.values(TEST_USERS)) {
      try {
        if (hasDeptId) {
          db.prepare(`
            INSERT INTO users (id, regNo, name, email, role, department_id, passwordHash, studentType, isEmailVerified, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Day Scholar', 1, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              regNo = excluded.regNo,
              email = excluded.email,
              role = excluded.role,
              department_id = excluded.department_id,
              passwordHash = excluded.passwordHash
          `).run(user.id, user.regNo, user.name, user.email, user.role, user.department_id, user.password);
        } else {
          db.prepare(`
            INSERT INTO users (id, regNo, name, email, role, passwordHash, studentType, isEmailVerified, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, 'Day Scholar', 1, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              regNo = excluded.regNo,
              email = excluded.email,
              role = excluded.role,
              passwordHash = excluded.passwordHash
          `).run(user.id, user.regNo, user.name, user.email, user.role, user.password);
        }
      } catch (err) {
        // Fallback for slight column differences
      }
    }
  }

  // 3. Ensure routing rules exist if table present
  if (doesTableExist(db, 'category_routing_rules')) {
    const routingStmt = db.prepare(`
      INSERT INTO category_routing_rules (id, category, department_id, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
      ON CONFLICT(category) DO UPDATE SET
        department_id = excluded.department_id,
        is_active = excluded.is_active
    `);

    for (let i = 0; i < DEFAULT_CATEGORY_ROUTING.length; i++) {
      const r = DEFAULT_CATEGORY_ROUTING[i];
      try {
        routingStmt.run(`rule_${i + 1}`, r.category, r.departmentId);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Clean up ephemeral test records to guarantee isolation
 */
export function cleanRbacTestData(db: DatabaseSync): void {
  try {
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@rbactest.edu' OR studentRegNo LIKE 'RBAC_%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@college.edu' AND timestamp >= datetime('now', '-10 minutes')").run();
    if (doesTableExist(db, 'audit_logs')) {
      db.prepare("DELETE FROM audit_logs WHERE entity_id LIKE 'rbactkt_%'").run();
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Decodes standard JWT payload without verifying crypto signature
 */
export function decodeJwtPayload(token: string): any {
  const parts = token.split('.');
  assert.equal(parts.length, 3, 'JWT must contain header, payload, signature parts');
  const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(payloadJson);
}

/**
 * Test Server Process Management
 */
export async function startTestServer(port: number): Promise<{
  serverBaseUrl: string;
  serverProcess: ChildProcess | null;
  stop: () => Promise<void>;
}> {
  const targetUrl = `http://127.0.0.1:${port}`;

  // 1. Check if server already running on target port
  try {
    const res = await fetch(`${targetUrl}/api/health`);
    if (res.ok) {
      return {
        serverBaseUrl: targetUrl,
        serverProcess: null,
        stop: async () => {},
      };
    }
  } catch {
    // Port not yet listening
  }

  // 2. Check if default server running on port 3000
  try {
    const res = await fetch('http://127.0.0.1:3000/api/health');
    if (res.ok) {
      return {
        serverBaseUrl: 'http://127.0.0.1:3000',
        serverProcess: null,
        stop: async () => {},
      };
    }
  } catch {
    // Port 3000 not listening
  }

  // 3. Spawn child process on target port
  const proc = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, PORT: port.toString(), NODE_ENV: 'test' },
    stdio: 'ignore',
    shell: true,
  });

  // Wait for server to become responsive
  const start = Date.now();
  let online = false;
  while (Date.now() - start < 12000) {
    try {
      const res = await fetch(`${targetUrl}/api/health`);
      if (res.ok) {
        online = true;
        break;
      }
    } catch {
      // Wait
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!online) {
    console.warn(`[WARN] Server on ${targetUrl} did not respond within timeout.`);
  }

  const stop = async () => {
    if (proc && proc.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', proc.pid.toString(), '/f', '/t']);
        } else {
          proc.kill();
        }
      } catch {
        // Ignore during teardown
      }
    }
  };

  return {
    serverBaseUrl: targetUrl,
    serverProcess: proc,
    stop,
  };
}
