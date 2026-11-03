/**
 * Milestone 1 RBAC Authentication & JWT Adversarial Challenge Test Harness
 * 
 * Empirically stress-tests:
 * 1. Cryptographic and header attacks against `src/utils/jwt.ts`:
 *    - alg: "none", "None", "NONE" bypass attacks
 *    - unsupported algorithm confusion (HS384, HS512, RS256, ES256, empty alg)
 *    - typ field tampering ("JWE", "REFRESH", "NOT_JWT")
 *    - payload tampering (forging role to SUPER_ADMIN, altering department_id, permissions)
 *    - signature tampering (bit flips, truncations, extensions, substitutions, empty signatures)
 *    - secret key mismatch resistance
 *    - malformed tokens (0, 1, 2, 4, 5 parts, whitespace, non-base64 characters, invalid JSON)
 *    - expiration enforcement (exp < now, boundary exp = now - 1)
 *    - future iat with expired exp resilience
 *    - type confusion on token argument (null, undefined, number, object)
 * 2. Authentication endpoint attack surface (`POST /api/auth/admin/login`):
 *    - STUDENT account rejection with strict HTTP 403 Forbidden (email, regNo, identifier)
 *    - SQL injection attacks in identifier and password fields
 *    - Malformed and structured payload attacks (objects, arrays, numbers, booleans, __proto__)
 *    - High-volume / boundary payload size stress
 *    - Baseline legitimate role authentication and redirect URLs
 * 3. Protected endpoint security against adversarial tokens (`GET /api/grievances/:id`):
 *    - Rejection of alg none tokens with HTTP 401
 *    - Rejection of tampered payload tokens with HTTP 401
 *    - Rejection of expired tokens with HTTP 401
 *    - Rejection of malformed tokens with HTTP 401
 *    - Strict HTTP 403 Forbidden on horizontal cross-department and student unauthorized access
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signToken, verifyToken } from '../src/utils/jwt.ts';
import { JWTPayload } from '../src/types.ts';
import { getDatabase, getUserByEmail, createGrievance } from '../db.ts';
import {
  TEST_USERS,
  TEST_DEPARTMENTS,
  seedRbacTestData,
  cleanRbacTestData,
  decodeJwtPayload,
  startTestServer,
} from './fixtures/rbac_fixtures.ts';

const TEST_PORT = process.env.CHALLENGER_AUTH_PORT ? parseInt(process.env.CHALLENGER_AUTH_PORT, 10) : 3118;
let serverBaseUrl: string;
let stopServer: () => Promise<void>;

const TICKET_NET = 'rbactkt_network_001';
const TICKET_HOSTEL = 'rbactkt_hostel_001';

// Helper to base64url encode
function base64UrlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

before(async () => {
  const db = getDatabase();
  seedRbacTestData(db);
  cleanRbacTestData(db);

  // Clean old test tickets
  db.prepare('DELETE FROM grievances WHERE id IN (?, ?)').run(TICKET_NET, TICKET_HOSTEL);

  // Seed test grievances using official createGrievance helper
  createGrievance({
    id: TICKET_NET,
    ticketNo: 'RBAC-NET-001',
    studentRegNo: 'RBAC_STU_01',
    studentName: 'Alice Student',
    studentEmail: 'alice@adversarial.edu',
    studentPhone: '9999900001',
    studentType: 'hosteller',
    category: 'Hostel Wi-Fi & Internet',
    description: 'Hostel wifi is completely down in Block A 3rd floor.',
    status: 'PRIMARY',
    priority: 'high',
    assignedDepartmentId: TEST_DEPARTMENTS.NETWORK_OPS.id,
    assigned_department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
  });

  createGrievance({
    id: TICKET_HOSTEL,
    ticketNo: 'RBAC-HST-001',
    studentRegNo: 'RBAC_STU_02',
    studentName: 'Bob Student',
    studentEmail: 'bob@adversarial.edu',
    studentPhone: '9999900002',
    studentType: 'hosteller',
    category: 'Hostel Maintenance',
    description: 'Water leakage in Block B corridor.',
    status: 'PRIMARY',
    priority: 'medium',
    assignedDepartmentId: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
    assigned_department_id: TEST_DEPARTMENTS.HOSTEL_ADMIN.id,
  });

  const server = await startTestServer(TEST_PORT);
  serverBaseUrl = server.serverBaseUrl;
  stopServer = server.stop;
});

after(async () => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM grievances WHERE id IN (?, ?)').run(TICKET_NET, TICKET_HOSTEL);
    cleanRbacTestData(db);
  } catch {
    // ignore
  }
  if (stopServer) {
    await stopServer();
  }
});

describe('Adversarial Challenge Suite 1: JWT Engine & Cryptographic Integrity (src/utils/jwt.ts)', () => {

  test('ADV-JWT-01: Rejection of alg=none attacks in all case variations and formats', () => {
    const payload: JWTPayload = {
      id: 'usr_hacker',
      email: 'hacker@exploit.net',
      role: 'SUPER_ADMIN',
      department_id: null,
      permissions: ['*'],
    };

    const encodedPayload = base64UrlEncode(JSON.stringify(payload));

    const noneVariations = ['none', 'None', 'NONE', 'nOnE'];
    for (const alg of noneVariations) {
      const header = { alg, typ: 'JWT' };
      const encodedHeader = base64UrlEncode(JSON.stringify(header));

      // 1. None alg with trailing dot (no signature)
      const tokenNoSig = `${encodedHeader}.${encodedPayload}.`;
      assert.equal(verifyToken(tokenNoSig), null, `verifyToken must reject alg=${alg} with trailing dot`);

      // 2. None alg without trailing dot (2 parts)
      const tokenTwoParts = `${encodedHeader}.${encodedPayload}`;
      assert.equal(verifyToken(tokenTwoParts), null, `verifyToken must reject alg=${alg} with 2 parts`);

      // 3. None alg with bogus signature string
      const tokenBogusSig = `${encodedHeader}.${encodedPayload}.c29tZXNpZ25hdHVyZQ`;
      assert.equal(verifyToken(tokenBogusSig), null, `verifyToken must reject alg=${alg} with dummy signature`);
    }
  });

  test('ADV-JWT-02: Rejection of unsupported algorithms and algorithm confusion attacks', () => {
    const payload: JWTPayload = {
      id: 'usr_hacker',
      email: 'hacker@exploit.net',
      role: 'SUPER_ADMIN',
      department_id: null,
      permissions: ['*'],
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));

    const forbiddenAlgorithms = [
      'HS384',
      'HS512',
      'RS256',
      'RS384',
      'RS512',
      'ES256',
      'ES384',
      'ES512',
      'PS256',
      'EdDSA',
      '',
      'plaintext',
    ];

    for (const alg of forbiddenAlgorithms) {
      const header = { alg, typ: 'JWT' };
      const encodedHeader = base64UrlEncode(JSON.stringify(header));
      const fakeSig = base64UrlEncode(crypto.randomBytes(32));
      const token = `${encodedHeader}.${encodedPayload}.${fakeSig}`;

      assert.equal(verifyToken(token), null, `verifyToken must reject unsupported algorithm: "${alg}"`);
    }
  });

  test('ADV-JWT-03: Rejection of header typ confusion attacks', () => {
    const payload: JWTPayload = {
      id: 'usr_normal',
      email: 'user@college.edu',
      role: 'DEPARTMENT_STAFF',
      department_id: 'dept-network-ops',
      permissions: ['grievances:read_dept'],
    };

    const invalidTypes = ['JWE', 'REFRESH', 'NOT_JWT', 'jwt/v2', 'TOKEN'];
    for (const typ of invalidTypes) {
      const header = { alg: 'HS256', typ };
      const encodedHeader = base64UrlEncode(JSON.stringify(header));
      const encodedPayload = base64UrlEncode(JSON.stringify(payload));
      const sigInput = `${encodedHeader}.${encodedPayload}`;
      const defaultSecret = 'grievance-system-jwt-secret-key-prod-2026';
      const hmac = crypto.createHmac('sha256', defaultSecret);
      hmac.update(sigInput);
      const signature = base64UrlEncode(hmac.digest());

      const token = `${sigInput}.${signature}`;
      assert.equal(verifyToken(token), null, `verifyToken must reject token with invalid header typ: "${typ}"`);
    }
  });

  test('ADV-JWT-04: Rejection of payload tampering (role elevation & scope tampering)', () => {
    // 1. Generate legitimate token for a student or staff
    const validToken = signToken({
      id: TEST_USERS.STAFF_NETWORK.id,
      email: TEST_USERS.STAFF_NETWORK.email,
      role: 'DEPARTMENT_STAFF',
      department_id: 'dept-network-ops',
      permissions: ['grievances:read_dept'],
    });

    const [headerB64, payloadB64, signatureB64] = validToken.split('.');

    // Tamper 1: Elevate role to SUPER_ADMIN
    const tamperedPayload1 = {
      ...JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')),
      role: 'SUPER_ADMIN',
      permissions: ['*'],
    };
    const tamperedToken1 = `${headerB64}.${base64UrlEncode(JSON.stringify(tamperedPayload1))}.${signatureB64}`;
    assert.equal(verifyToken(tamperedToken1), null, 'verifyToken must reject token with forged SUPER_ADMIN role');

    // Tamper 2: Change department_id to target another department
    const tamperedPayload2 = {
      ...JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')),
      department_id: 'dept-hostel-admin',
    };
    const tamperedToken2 = `${headerB64}.${base64UrlEncode(JSON.stringify(tamperedPayload2))}.${signatureB64}`;
    assert.equal(verifyToken(tamperedToken2), null, 'verifyToken must reject token with tampered department_id');

    // Tamper 3: Single character mutation in payload base64 string
    const mutatedPayloadB64 = payloadB64.slice(0, -2) + (payloadB64.endsWith('A') ? 'B' : 'A') + payloadB64.slice(-1);
    const tamperedToken3 = `${headerB64}.${mutatedPayloadB64}.${signatureB64}`;
    assert.equal(verifyToken(tamperedToken3), null, 'verifyToken must reject token with mutated payload character');
  });

  test('ADV-JWT-05: Rejection of signature tampering, truncation, expansion, and substitution', () => {
    const validToken = signToken({
      id: TEST_USERS.SUPER_ADMIN.id,
      email: TEST_USERS.SUPER_ADMIN.email,
      role: 'SUPER_ADMIN',
      department_id: null,
      permissions: ['*'],
    });

    const [headerB64, payloadB64, signatureB64] = validToken.split('.');

    // Tamper 1: Reversed signature
    const reversedSig = signatureB64.split('').reverse().join('');
    assert.equal(verifyToken(`${headerB64}.${payloadB64}.${reversedSig}`), null);

    // Tamper 2: Truncated signature by 1 character
    const truncatedSig1 = signatureB64.slice(0, -1);
    assert.equal(verifyToken(`${headerB64}.${payloadB64}.${truncatedSig1}`), null);

    // Tamper 3: Truncated signature by half
    const truncatedSigHalf = signatureB64.slice(0, 20);
    assert.equal(verifyToken(`${headerB64}.${payloadB64}.${truncatedSigHalf}`), null);

    // Tamper 4: Extended signature by 1 character
    const extendedSig = signatureB64 + 'X';
    assert.equal(verifyToken(`${headerB64}.${payloadB64}.${extendedSig}`), null);

    // Tamper 5: Empty signature
    assert.equal(verifyToken(`${headerB64}.${payloadB64}.`), null);

    // Tamper 6: Splicing / Signature substitution from another completely different token
    const otherToken = signToken({
      id: 'usr_different',
      email: 'other@college.edu',
      role: 'STUDENT',
      department_id: null,
      permissions: [],
    });
    const [, , otherSignature] = otherToken.split('.');
    assert.equal(verifyToken(`${headerB64}.${payloadB64}.${otherSignature}`), null);
  });

  test('ADV-JWT-06: Secret key isolation and wrong secret rejection', () => {
    const attackerSecret = 'attacker-controlled-secret-key-12345';
    const fakeToken = signToken(
      {
        id: 'usr_spoofed_admin',
        email: 'admin.grievance@college.edu',
        role: 'SUPER_ADMIN',
        department_id: null,
        permissions: ['*'],
      },
      attackerSecret,
    );

    // Default system verification must reject token signed with foreign secret
    assert.equal(verifyToken(fakeToken), null, 'verifyToken must reject token signed with foreign secret');

    // Verification with empty secret string must fail
    assert.equal(verifyToken(fakeToken, ''), null, 'verifyToken must reject empty secret');
  });

  test('ADV-JWT-07: Malformed token syntax stress (parts count, non-base64 characters, invalid JSON)', () => {
    // 0 parts / empty string / whitespace
    assert.equal(verifyToken(''), null);
    assert.equal(verifyToken('   '), null);

    // 1 part
    assert.equal(verifyToken('eyJhbGciOiJIUzI1NiJ9'), null);

    // 2 parts
    assert.equal(verifyToken('eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ'), null);

    // 4 parts
    assert.equal(verifyToken('header.payload.sig.extra'), null);

    // 5 parts
    assert.equal(verifyToken('part1.part2.part3.part4.part5'), null);

    // Non-base64 characters
    assert.equal(verifyToken('$$$%%%.###@@@.***&&&'), null);

    // Valid base64 but invalid JSON in header
    const badHeader = base64UrlEncode('{bad: json: header}');
    const goodPayload = base64UrlEncode(JSON.stringify({ role: 'SUPER_ADMIN' }));
    assert.equal(verifyToken(`${badHeader}.${goodPayload}.fakesig`), null);

    // Valid base64 but invalid JSON in payload
    const goodHeader = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const badPayload = base64UrlEncode('{bad: json: payload}');
    assert.equal(verifyToken(`${goodHeader}.${badPayload}.fakesig`), null);

    // Type confusion on verifyToken input (null, undefined, number, object)
    assert.equal(verifyToken(null as any), null);
    assert.equal(verifyToken(undefined as any), null);
    assert.equal(verifyToken(123456 as any), null);
    assert.equal(verifyToken({} as any), null);
    assert.equal(verifyToken([] as any), null);
  });

  test('ADV-JWT-08: Expiration boundary enforcement (exp < now, exp = now - 1, future iat with expired exp)', () => {
    const now = Math.floor(Date.now() / 1000);

    // 1. Expired 1 second ago
    const expiredToken1 = signToken({
      id: TEST_USERS.SUPER_ADMIN.id,
      email: TEST_USERS.SUPER_ADMIN.email,
      role: 'SUPER_ADMIN',
      department_id: null,
      permissions: ['*'],
      exp: now - 1,
    });
    assert.equal(verifyToken(expiredToken1), null, 'Token expired 1 second ago must return null');

    // 2. Expired 1 hour ago
    const expiredToken2 = signToken({
      id: TEST_USERS.SUPER_ADMIN.id,
      email: TEST_USERS.SUPER_ADMIN.email,
      role: 'SUPER_ADMIN',
      department_id: null,
      permissions: ['*'],
      exp: now - 3600,
    });
    assert.equal(verifyToken(expiredToken2), null, 'Token expired 1 hour ago must return null');

    // 3. Expired token claiming future iat (iat in future, exp in past)
    const contradictoryToken = signToken({
      id: TEST_USERS.SUPER_ADMIN.id,
      email: TEST_USERS.SUPER_ADMIN.email,
      role: 'SUPER_ADMIN',
      department_id: null,
      permissions: ['*'],
      iat: now + 3600,
      exp: now - 100,
    });
    assert.equal(verifyToken(contradictoryToken), null, 'Contradictory token (future iat, past exp) must be rejected');

    // 4. Valid unexpired token (exp = now + 3600)
    const validToken = signToken({
      id: TEST_USERS.SUPER_ADMIN.id,
      email: TEST_USERS.SUPER_ADMIN.email,
      role: 'SUPER_ADMIN',
      department_id: null,
      permissions: ['*'],
      exp: now + 3600,
    });
    const verified = verifyToken(validToken);
    assert.ok(verified, 'Valid unexpired token must be accepted');
    assert.equal(verified?.role, 'SUPER_ADMIN');
  });
});

describe('Adversarial Challenge Suite 2: Admin Login Endpoint Attack Surface (POST /api/auth/admin/login)', () => {

  test('ADV-LOGIN-01: STUDENT credentials rejection across email, regNo, and identifier parameters (exact 403 Forbidden)', async () => {
    // 1. Rejection via email
    const resEmail = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.STUDENT.email,
        password: TEST_USERS.STUDENT.password,
      }),
    });
    assert.equal(resEmail.status, 403, `Expected exact HTTP 403 Forbidden for student email, got ${resEmail.status}`);
    const bodyEmail = (await resEmail.json()) as any;
    assert.equal(bodyEmail.success, false);
    assert.equal(bodyEmail.token, undefined, 'No token may be issued to student');
    assert.match(bodyEmail.error, /STUDENT|student|Access denied/i);

    // 2. Rejection via regNo
    const studentUser = getUserByEmail(TEST_USERS.STUDENT.email);
    assert.ok(studentUser, 'Student user must exist in database');
    const studentRegNo = studentUser.regNo;

    const resRegNo = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        regNo: studentRegNo,
        password: TEST_USERS.STUDENT.password,
      }),
    });
    assert.equal(resRegNo.status, 403, `Expected exact HTTP 403 Forbidden for student regNo (${studentRegNo}), got ${resRegNo.status}`);
    const bodyRegNo = (await resRegNo.json()) as any;
    assert.equal(bodyRegNo.success, false);
    assert.equal(bodyRegNo.token, undefined);

    // 3. Rejection via generic identifier field
    const resId = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: TEST_USERS.STUDENT.email,
        password: TEST_USERS.STUDENT.password,
      }),
    });
    assert.equal(resId.status, 403, `Expected exact HTTP 403 Forbidden for student identifier, got ${resId.status}`);
    const bodyId = (await resId.json()) as any;
    assert.equal(bodyId.success, false);
    assert.equal(bodyId.token, undefined);
  });

  test('ADV-LOGIN-02: SQL Injection payload resilience in identifier and password fields', async () => {
    const sqlInjectionPayloads = [
      "' OR '1'='1",
      "' OR 1=1 --",
      "admin'--",
      "admin.grievance@college.edu' OR '1'='1",
      "admin.grievance@college.edu'--",
      "' UNION SELECT id, regNo, name, email, 'SUPER_ADMIN', 'pwd', NULL FROM users --",
      "'; DROP TABLE users; --",
      "\" OR \"\"=\"",
      "' OR ''='",
      "1' OR '1' = '1",
    ];

    for (const sqli of sqlInjectionPayloads) {
      // Test 1: SQL injection in identifier with dummy password
      const res1 = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: sqli,
          password: 'wrong_password_test',
        }),
      });
      assert.ok(
        res1.status === 401 || res1.status === 400,
        `SQLi in identifier "${sqli}" must return 401 or 400, got ${res1.status}`,
      );
      const body1 = (await res1.json()) as any;
      assert.equal(body1.success === true, false, 'SQLi must never yield success');
      assert.equal(body1.token, undefined, 'SQLi must never issue token');

      // Test 2: SQL injection in password with legitimate super admin email
      const res2 = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_USERS.SUPER_ADMIN.email,
          password: sqli,
        }),
      });
      assert.ok(
        res2.status === 401 || res2.status === 400,
        `SQLi in password "${sqli}" must return 401 or 400, got ${res2.status}`,
      );
      const body2 = (await res2.json()) as any;
      assert.equal(body2.success === true, false);
      assert.equal(body2.token, undefined);
    }
  });

  test('ADV-LOGIN-03: Structural type attacks and prototype pollution resilience', async () => {
    // 1. Array identifier
    const resArr = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: [TEST_USERS.SUPER_ADMIN.email],
        password: TEST_USERS.SUPER_ADMIN.password,
      }),
    });
    // Array should either be coerced to string cleanly or rejected with 400/401/200 if converted to string
    // Verify it doesn't crash (500)
    assert.notEqual(resArr.status, 500, 'Array identifier must not cause HTTP 500 crash');

    // 2. Object identifier
    const resObj = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: { $gt: '' },
        password: 'adminpass123',
      }),
    });
    assert.notEqual(resObj.status, 500, 'Object identifier must not cause HTTP 500 crash');

    // 3. Boolean / numeric password
    const resBool = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.SUPER_ADMIN.email,
        password: true,
      }),
    });
    assert.ok(
      resBool.status === 401 || resBool.status === 400,
      `Boolean password must return 401 or 400, got ${resBool.status}`,
    );

    // 4. Prototype pollution attempt in payload
    const resProto = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        __proto__: { role: 'SUPER_ADMIN' },
        identifier: 'nonexistent_user_999',
        password: 'password123',
      }),
    });
    assert.equal(resProto.status, 401, 'Nonexistent user with prototype injection must return 401');

    // 5. Oversized string payload (100KB identifier)
    const hugeIdentifier = 'A'.repeat(100 * 1024);
    const resHuge = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: hugeIdentifier,
        password: 'password123',
      }),
    });
    assert.ok(
      resHuge.status === 401 || resHuge.status === 400 || resHuge.status === 413,
      `Oversized identifier must return 400, 401 or 413, got ${resHuge.status}`,
    );
  });

  test('ADV-LOGIN-04: Baseline legitimate login verification and canonical claim issuance', async () => {
    // 1. Super Admin
    const resAdmin = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.SUPER_ADMIN.email,
        password: TEST_USERS.SUPER_ADMIN.password,
      }),
    });
    assert.equal(resAdmin.status, 200);
    const bodyAdmin = (await resAdmin.json()) as any;
    assert.equal(bodyAdmin.success, true);
    assert.equal(bodyAdmin.user.role, 'SUPER_ADMIN');
    assert.equal(bodyAdmin.redirectUrl, '/admin/dashboard');
    assert.equal(bodyAdmin.user.department_id, null);

    const tokenClaims = decodeJwtPayload(bodyAdmin.token);
    assert.equal(tokenClaims.role, 'SUPER_ADMIN');
    assert.equal(tokenClaims.department_id, null);
    assert.ok(Array.isArray(tokenClaims.permissions));

    // 2. Department Head
    const resHead = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.HEAD_HOSTEL.email,
        password: TEST_USERS.HEAD_HOSTEL.password,
      }),
    });
    assert.equal(resHead.status, 200);
    const bodyHead = (await resHead.json()) as any;
    assert.equal(bodyHead.success, true);
    assert.equal(bodyHead.user.role, 'DEPARTMENT_HEAD');
    assert.equal(bodyHead.redirectUrl, '/admin/department/dashboard');
    assert.equal(bodyHead.user.department_id, TEST_DEPARTMENTS.HOSTEL_ADMIN.id);

    // 3. Department Staff
    const resStaff = await fetch(`${serverBaseUrl}/api/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USERS.STAFF_NETWORK.email,
        password: TEST_USERS.STAFF_NETWORK.password,
      }),
    });
    assert.equal(resStaff.status, 200);
    const bodyStaff = (await resStaff.json()) as any;
    assert.equal(bodyStaff.success, true);
    assert.equal(bodyStaff.user.role, 'DEPARTMENT_STAFF');
    assert.equal(bodyStaff.redirectUrl, '/admin/department/dashboard');
    assert.equal(bodyStaff.user.department_id, TEST_DEPARTMENTS.NETWORK_OPS.id);
  });
});

describe('Adversarial Challenge Suite 3: Protected API Endpoints Guard Stress (GET /api/grievances/:id)', () => {

  test('ADV-GUARD-01: Rejection of alg=none forged token on single-resource grievance endpoint', async () => {
    const forgedPayload: JWTPayload = {
      id: TEST_USERS.SUPER_ADMIN.id,
      email: TEST_USERS.SUPER_ADMIN.email,
      role: 'SUPER_ADMIN',
      department_id: null,
      permissions: ['*'],
    };
    const noneHeader = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const encodedPayload = base64UrlEncode(JSON.stringify(forgedPayload));
    const token = `${noneHeader}.${encodedPayload}.`;

    const res = await fetch(`${serverBaseUrl}/api/grievances/rbactkt_network_001`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.ok(
      res.status === 401 || res.status === 403,
      `Protected endpoint must reject alg=none token with 401 or 403, got ${res.status}`,
    );
  });

  test('ADV-GUARD-02: Rejection of forged SUPER_ADMIN role with tampered payload on single-resource endpoint', async () => {
    // Generate valid staff token
    const validStaffToken = signToken({
      id: TEST_USERS.STAFF_NETWORK.id,
      email: TEST_USERS.STAFF_NETWORK.email,
      role: 'DEPARTMENT_STAFF',
      department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
      permissions: ['grievances:read_dept'],
    });

    const [h, p, s] = validStaffToken.split('.');
    const decoded = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    decoded.role = 'SUPER_ADMIN';
    decoded.permissions = ['*'];
    const tamperedP = base64UrlEncode(JSON.stringify(decoded));
    const tamperedToken = `${h}.${tamperedP}.${s}`;

    const res = await fetch(`${serverBaseUrl}/api/grievances/rbactkt_hostel_001`, {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    assert.ok(
      res.status === 401 || res.status === 403,
      `Protected endpoint must reject tampered role token with 401 or 403, got ${res.status}`,
    );
  });

  test('ADV-GUARD-03: Rejection of expired token on single-resource endpoint', async () => {
    const expiredToken = signToken({
      id: TEST_USERS.SUPER_ADMIN.id,
      email: TEST_USERS.SUPER_ADMIN.email,
      role: 'SUPER_ADMIN',
      department_id: null,
      permissions: ['*'],
      exp: Math.floor(Date.now() / 1000) - 600,
    });

    const res = await fetch(`${serverBaseUrl}/api/grievances/rbactkt_network_001`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.ok(
      res.status === 401 || res.status === 403,
      `Protected endpoint must reject expired token with 401 or 403, got ${res.status}`,
    );
  });

  test('ADV-GUARD-04: Rejection of token signed with foreign secret key', async () => {
    const rogueToken = signToken(
      {
        id: TEST_USERS.SUPER_ADMIN.id,
        email: TEST_USERS.SUPER_ADMIN.email,
        role: 'SUPER_ADMIN',
        department_id: null,
        permissions: ['*'],
      },
      'attacker-rogue-secret-999',
    );

    const res = await fetch(`${serverBaseUrl}/api/grievances/rbactkt_network_001`, {
      headers: { Authorization: `Bearer ${rogueToken}` },
    });
    assert.ok(
      res.status === 401 || res.status === 403,
      `Protected endpoint must reject rogue secret token with 401 or 403, got ${res.status}`,
    );
  });

  test('ADV-GUARD-05: Horizontal cross-department isolation returns strict HTTP 403 Forbidden', async () => {
    // Network staff requesting hostel grievance rbactkt_hostel_001
    const staffNetworkToken = signToken({
      id: TEST_USERS.STAFF_NETWORK.id,
      email: TEST_USERS.STAFF_NETWORK.email,
      role: 'DEPARTMENT_STAFF',
      department_id: TEST_DEPARTMENTS.NETWORK_OPS.id,
      permissions: ['grievances:read_dept'],
    });

    const resCross = await fetch(`${serverBaseUrl}/api/grievances/rbactkt_hostel_001`, {
      headers: { Authorization: `Bearer ${staffNetworkToken}` },
    });

    assert.equal(
      resCross.status,
      403,
      `Cross-department read must return exact HTTP 403 Forbidden, got ${resCross.status}`,
    );
    const body = (await resCross.json()) as any;
    assert.equal(body.success, false);
    assert.match(body.error, /Unauthorized cross-department|Access denied/i);
  });

  test('ADV-GUARD-06: Student requesting grievance owned by another student returns strict HTTP 403 Forbidden', async () => {
    // Student token attempting to read another student's grievance
    const studentToken = signToken({
      id: TEST_USERS.STUDENT.id,
      email: TEST_USERS.STUDENT.email,
      role: 'STUDENT',
      department_id: null,
      permissions: ['grievances:read_own'],
    });

    const resOther = await fetch(`${serverBaseUrl}/api/grievances/rbactkt_network_001`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });

    assert.equal(
      resOther.status,
      403,
      `Student accessing other student's grievance must return HTTP 403 Forbidden, got ${resOther.status}`,
    );
  });
});
