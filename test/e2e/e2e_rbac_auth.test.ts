/**
 * Tier 1 & Tier 2 End-to-End RBAC Authentication & JWT Claims Test Suite
 * Tests:
 * - Tier 1: Feature Coverage (Admin login, signed JWT token generation, claims verification for SUPER_ADMIN, DEPARTMENT_HEAD, DEPARTMENT_STAFF)
 * - Tier 2: Boundary & Security Access (STUDENT login rejection with 403, invalid passwords, nonexistent users, tampered & expired JWTs, missing auth headers)
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from '../../db.ts';
import { signToken } from '../../src/utils/jwt.ts';
import {
  TEST_USERS,
  TEST_DEPARTMENTS,
  seedRbacTestData,
  cleanRbacTestData,
  decodeJwtPayload,
  startTestServer,
} from '../fixtures/rbac_fixtures.ts';

const TEST_PORT = process.env.AUTH_TEST_PORT ? parseInt(process.env.AUTH_TEST_PORT, 10) : 3111;
let serverBaseUrl: string;
let stopServer: () => Promise<void>;

before(async () => {
  const db = getDatabase();
  seedRbacTestData(db);
  cleanRbacTestData(db);

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

describe('Tier 1: RBAC Authentication Feature Coverage', () => {
  test('TC-AUTH-01: Super Admin login issues valid JWT with role, null department_id, permissions, and /admin/dashboard redirect', async () => {
    const res = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.SUPER_ADMIN.email,
        password: TEST_USERS.SUPER_ADMIN.password,
      }),
    });

    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const body = (await res.json()) as any;

    assert.equal(body.success, true, 'Response must indicate success');
    assert.ok(body.token, 'Response must return signed JWT token');
    assert.ok(body.user, 'Response must include user profile');
    assert.equal(body.user.role, 'SUPER_ADMIN');
    assert.equal(body.redirectUrl, '/admin/dashboard', 'Super admin must be redirected to /admin/dashboard');

    // Decode and inspect cryptographic JWT claims
    const claims = decodeJwtPayload(body.token);
    assert.equal(claims.email, TEST_USERS.SUPER_ADMIN.email);
    assert.equal(claims.role, 'SUPER_ADMIN');
    assert.equal(claims.department_id, null, 'Super Admin department_id must be null');
    assert.ok(Array.isArray(claims.permissions), 'Token claims must contain permissions array');
    assert.ok(
      claims.permissions.includes('*') || claims.permissions.includes('grievances:read_all'),
      'Super Admin must have root or grievances:read_all permission',
    );
    assert.ok(claims.exp > Math.floor(Date.now() / 1000), 'Token exp must be in future');
  });

  test('TC-AUTH-02: Department Staff login issues valid JWT with department_id, scoped permissions, and /admin/department/dashboard redirect', async () => {
    const res = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.STAFF_NETWORK.email,
        password: TEST_USERS.STAFF_NETWORK.password,
      }),
    });

    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const body = (await res.json()) as any;

    assert.equal(body.success, true);
    assert.ok(body.token);
    assert.equal(body.user.role, 'DEPARTMENT_STAFF');
    assert.equal(body.redirectUrl, '/admin/department/dashboard');

    const claims = decodeJwtPayload(body.token);
    assert.equal(claims.email, TEST_USERS.STAFF_NETWORK.email);
    assert.equal(claims.role, 'DEPARTMENT_STAFF');
    assert.equal(claims.department_id, TEST_DEPARTMENTS.NETWORK_OPS.id);
    assert.ok(Array.isArray(claims.permissions));
    assert.ok(claims.permissions.includes('grievances:read_dept'));
  });

  test('TC-AUTH-03: Department Head login issues valid JWT with department_id and elevated department triage permissions', async () => {
    const res = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.HEAD_HOSTEL.email,
        password: TEST_USERS.HEAD_HOSTEL.password,
      }),
    });

    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const body = (await res.json()) as any;

    assert.equal(body.success, true);
    assert.ok(body.token);
    assert.equal(body.user.role, 'DEPARTMENT_HEAD');
    assert.equal(body.redirectUrl, '/admin/department/dashboard');

    const claims = decodeJwtPayload(body.token);
    assert.equal(claims.email, TEST_USERS.HEAD_HOSTEL.email);
    assert.equal(claims.role, 'DEPARTMENT_HEAD');
    assert.equal(claims.department_id, TEST_DEPARTMENTS.HOSTEL_ADMIN.id);
    assert.ok(Array.isArray(claims.permissions));
    assert.ok(claims.permissions.includes('grievances:resolve') || claims.permissions.includes('grievances:write_dept'));
  });

  test('TC-AUTH-04: General login endpoint (/api/auth/login) returns JWT token for admin staff with portal context', async () => {
    const res = await fetch(`${serverBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.STAFF_HOSTEL.email,
        password: TEST_USERS.STAFF_HOSTEL.password,
        portal: 'admin',
      }),
    });

    assert.equal(res.status, 200, `Expected 200 OK, got ${res.status}`);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.ok(body.token, 'Expected JWT token from unified login endpoint');
    const claims = decodeJwtPayload(body.token);
    assert.equal(claims.department_id, TEST_DEPARTMENTS.HOSTEL_ADMIN.id);
  });
});

describe('Tier 2: Boundary & Security Access Isolation Tests for Authentication', () => {
  test('TC-AUTH-SEC-01: Admin login endpoint rejects STUDENT accounts with HTTP 403 Forbidden', async () => {
    const res = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.STUDENT.email,
        password: TEST_USERS.STUDENT.password,
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden for Student admin login, got ${res.status}`);
    const body = (await res.json()) as any;
    assert.equal(body.success, false, 'Expected success === false');
    assert.ok(body.error, 'Expected error explanation');
    assert.match(
      body.error,
      /STUDENT|student|Access denied|not permitted|Forbidden/i,
      'Error message should indicate student accounts are prohibited from admin portal',
    );
    assert.equal(body.token, undefined, 'No token should be issued to rejected student');
  });

  test('TC-AUTH-SEC-02: Unified login rejecting STUDENT accounts when portal=admin specified', async () => {
    const res = await fetch(`${serverBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.STUDENT.email,
        password: TEST_USERS.STUDENT.password,
        portal: 'admin',
      }),
    });

    assert.equal(res.status, 403, `Expected 403 Forbidden when student logs into admin portal, got ${res.status}`);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.token, undefined);
  });

  test('TC-AUTH-SEC-03: Admin login with incorrect password returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.SUPER_ADMIN.email,
        password: 'wrong_password_attempt_999',
      }),
    });

    assert.equal(res.status, 401, `Expected 401 Unauthorized for bad password, got ${res.status}`);
    const body = (await res.json()) as any;
    assert.equal(body.success === true, false);
    assert.equal(body.token, undefined);
  });

  test('TC-AUTH-SEC-04: Admin login with non-existent user identifier returns HTTP 401 Unauthorized', async () => {
    const res = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ghost_admin_nobody@campus.edu',
        password: 'somepassword123',
      }),
    });

    assert.equal(res.status, 401, `Expected 401 Unauthorized for nonexistent user, got ${res.status}`);
    const body = (await res.json()) as any;
    assert.equal(body.token, undefined);
  });

  test('TC-AUTH-SEC-05: Admin login with missing credentials returns HTTP 400 Bad Request', async () => {
    const res = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.ok(res.status === 400 || res.status === 401, `Expected 400 or 401 for empty body, got ${res.status}`);
    const body = (await res.json()) as any;
    assert.equal(body.token, undefined);
  });

  test('TC-AUTH-SEC-06: Protected endpoint rejects tampered JWT signature with HTTP 401 Unauthorized or 403 Forbidden', async () => {
    // Generate valid token and tamper with the signature part
    const validToken = signToken({
      id: TEST_USERS.STAFF_NETWORK.id,
      email: TEST_USERS.STAFF_NETWORK.email,
      role: 'DEPARTMENT_STAFF',
      department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
      permissions: ['grievances:read_dept'],
    });

    const parts = validToken.split('.');
    const tamperedSignature = parts[2].split('').reverse().join('');
    const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSignature}`;

    const res = await fetch(`${serverBaseUrl}/api/grievances/tkt_dummy_nonexistent`, {
      headers: {
        Authorization: `Bearer ${tamperedToken}`,
      },
    });

    assert.ok(
      res.status === 401 || res.status === 403,
      `Expected 401 or 403 for tampered JWT, got status ${res.status}`,
    );
  });

  test('TC-AUTH-SEC-07: Protected endpoint rejects expired JWT with HTTP 401 Unauthorized or 403 Forbidden', async () => {
    const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour in the past
    const expiredToken = signToken({
      id: TEST_USERS.STAFF_NETWORK.id,
      email: TEST_USERS.STAFF_NETWORK.email,
      role: 'DEPARTMENT_STAFF',
      department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
      permissions: ['grievances:read_dept'],
      iat: pastTime - 3600,
      exp: pastTime,
    });

    const res = await fetch(`${serverBaseUrl}/api/grievances/tkt_dummy_nonexistent`, {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });

    assert.ok(
      res.status === 401 || res.status === 403,
      `Expected 401 or 403 for expired JWT, got status ${res.status}`,
    );
  });
});
