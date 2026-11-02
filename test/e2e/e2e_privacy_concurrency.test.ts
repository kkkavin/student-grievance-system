/**
 * End-to-End Privacy Isolation & Concurrent Transaction Integrity Test Suite
 * Tests:
 * 1. Student Privacy Isolation:
 *    - Child ticket holders query GET /api/grievances with student role/id.
 *    - Child ticket response contains ONLY the student's own grievance details and public master status notes.
 *    - Zero leakage of master reporter's PII (name, email, phone) or other child reporters' PII.
 *    - Third-party students cannot view other students' tickets.
 * 2. Concurrency & Atomicity:
 *    - Dispatches 10 concurrent duplicate submissions via Promise.all.
 *    - Verifies zero race conditions, zero orphaned records, zero deadlocks (SQLITE_BUSY handled).
 *    - Exactly 1 ticket crowned PRIMARY; remaining 9 linked cleanly as MERGED_AUTOMATIC children.
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { getDatabase } from '../../db.ts';

const TEST_PORT = process.env.TEST_PORT || '3099';
let serverBaseUrl = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ChildProcess | null = null;

async function waitForServer(url: string, timeoutMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

before(async () => {
  // Clean up previous test entries for isolation
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@campus.edu' OR studentRegNo LIKE '2023%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@campus.edu'").run();
  } catch {
    // ignore
  }

  try {
    const res = await fetch('http://127.0.0.1:3000/api/health');
    if (res.ok) {
      serverBaseUrl = 'http://127.0.0.1:3000';
      return;
    }
  } catch {
    // Port 3000 not listening
  }

  serverProcess = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, PORT: TEST_PORT, NODE_ENV: 'test' },
    stdio: 'ignore',
    shell: true,
  });

  await waitForServer(serverBaseUrl, 8000);
});

after(() => {
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@campus.edu' OR studentRegNo LIKE '2023%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@campus.edu'").run();
  } catch {
    // ignore
  }

  if (serverProcess) {
    try {
      if (process.platform === 'win32' && serverProcess.pid) {
        spawn('taskkill', ['/pid', serverProcess.pid.toString(), '/f', '/t']);
      } else {
        serverProcess.kill();
      }
    } catch {
      // ignore
    }
  }
});

async function postGrievance(payload: any) {
  const res = await fetch(`${serverBaseUrl}/api/grievances`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { status: res.status, data };
}

// ============================================================================
// PART 1: STUDENT PRIVACY ISOLATION
// ============================================================================
describe('Student Privacy & Data Isolation Tests', () => {
  test('TC-PRV-01: Child ticket holder views own details and public master notes with zero PII leakage', async () => {
    const uniqueRoom = `PRV-${Math.floor(Math.random() * 800 + 100)}`;

    // 1. Student A submits Master Ticket with sensitive personal details
    const masterRes = await postGrievance({
      studentRegNo: '2023STU_A',
      studentName: 'Private Student Alpha',
      studentEmail: 'alpha.private@campus.edu',
      studentPhone: '9991112222',
      studentType: 'hosteller',
      hostelBlock: 'B',
      roomNo: uniqueRoom,
      category: 'Hostel Maintenance',
      description: `Ceiling plaster cracking and falling onto bed in room ${uniqueRoom}`,
      priority: 'urgent',
      locationTag: `Hostel Block B, Floor 2, Room ${uniqueRoom}`,
    });
    assert.strictEqual(masterRes.status, 201);
    const masterTicket = masterRes.data;

    // Admin sets public master notes
    await fetch(`${serverBaseUrl}/api/grievances/${masterTicket.id}/master-notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicMasterNotes: 'Civil maintenance engineer inspected ceiling and scheduled plaster repair.' }),
    });

    // 2. Student B submits duplicate ticket (roommate)
    const childRes = await postGrievance({
      studentRegNo: '2023STU_B',
      studentName: 'Roommate Beta',
      studentEmail: 'beta.roommate@campus.edu',
      studentPhone: '8883334444',
      studentType: 'hosteller',
      hostelBlock: 'B',
      roomNo: uniqueRoom,
      category: 'Hostel Maintenance',
      description: `Roommate: ceiling plaster cracking and falling onto bed in room ${uniqueRoom}`,
      priority: 'urgent',
      locationTag: `Hostel Block B, Floor 2, Room ${uniqueRoom}`,
    });
    assert.strictEqual(childRes.status, 201);
    const childTicket = childRes.data;
    assert.strictEqual(childTicket.status, 'MERGED_AUTOMATIC');
    assert.strictEqual(childTicket.masterCaseId, masterTicket.id);

    // 3. Student B requests their grievances via student endpoint
    const studentBRes = await fetch(`${serverBaseUrl}/api/grievances?role=student&studentRegNo=2023STU_B`);
    assert.strictEqual(studentBRes.status, 200);
    const studentBTickets = await studentBRes.json();

    // Verify Student B gets only their ticket
    assert.strictEqual(studentBTickets.length, 1);
    const bView = studentBTickets[0];

    assert.strictEqual(bView.id, childTicket.id, 'Must be Student B child ticket');
    assert.strictEqual(bView.studentRegNo, '2023STU_B');
    assert.strictEqual(bView.studentName, 'Roommate Beta');
    assert.strictEqual(bView.studentEmail, 'beta.roommate@campus.edu');
    assert.strictEqual(bView.description, childTicket.description, 'Must retain Student B own description');

    // Public master notes and ticket number must be exposed
    assert.strictEqual(bView.masterTicketNo, masterTicket.ticketNo);
    assert.strictEqual(bView.publicMasterNotes, 'Civil maintenance engineer inspected ceiling and scheduled plaster repair.');

    // ZERO LEAKAGE OF STUDENT A PII:
    const bViewString = JSON.stringify(bView);
    assert.strictEqual(bViewString.includes('Private Student Alpha'), false, 'Must NOT contain Master student name');
    assert.strictEqual(bViewString.includes('alpha.private@campus.edu'), false, 'Must NOT contain Master student email');
    assert.strictEqual(bViewString.includes('9991112222'), false, 'Must NOT contain Master student phone');
  });

  test('TC-PRV-02: Third-party student C receives zero tickets belonging to Student A or B', async () => {
    const studentCRes = await fetch(`${serverBaseUrl}/api/grievances?role=student&studentRegNo=2023STU_UNKNOWN`);
    assert.strictEqual(studentCRes.status, 200);
    const studentCTickets = await studentCRes.json();
    assert.strictEqual(studentCTickets.length, 0, 'Third-party student must receive zero records');
  });
});

// ============================================================================
// PART 2: CONCURRENCY & TRANSACTION ATOMICITY
// ============================================================================
describe('Concurrency & Transaction Atomicity Tests', () => {
  test('TC-CONC-01: 10 concurrent duplicate submissions produce zero race conditions and zero orphans', async () => {
    const sharedRoom = `CONC-${Math.floor(Math.random() * 800 + 100)}`;
    const commonDesc = `Severe washroom mainline blockage and sewage overflow in room ${sharedRoom}`;

    // Prepare 10 concurrent submission payloads
    const concurrentPayloads = Array.from({ length: 10 }, (_, i) => ({
      studentRegNo: `2023CONC_${String(i + 1).padStart(2, '0')}`,
      studentName: `Concurrent Student ${i + 1}`,
      studentEmail: `conc.student${i + 1}@campus.edu`,
      studentPhone: `91100000${String(i + 1).padStart(2, '0')}`,
      studentType: 'hosteller',
      hostelBlock: 'C',
      roomNo: sharedRoom,
      category: 'Hostel Maintenance',
      description: commonDesc,
      priority: 'urgent',
      locationTag: `Hostel Block C, Floor 2, Room ${sharedRoom}`,
      sourceTimestamp: new Date().toISOString(),
    }));

    // Dispatch all 10 submissions concurrently via Promise.all
    const promises = concurrentPayloads.map((p) => postGrievance(p));
    const results = await Promise.all(promises);

    // Verify all 10 succeeded without server crash or unhandled 500
    for (const r of results) {
      assert.strictEqual(r.status, 201, 'Every concurrent submission must return 201 Created');
      assert.ok(r.data.id, 'Must generate unique ID for every ticket');
    }

    const tickets = results.map((r) => r.data);

    // Atomicity assertion: Exactly 1 ticket must be crowned PRIMARY (or master), and 9 tickets must be MERGED_AUTOMATIC
    const primaryTickets = tickets.filter((t) => t.status === 'PRIMARY');
    const mergedTickets = tickets.filter((t) => t.status === 'MERGED_AUTOMATIC');

    assert.strictEqual(primaryTickets.length, 1, 'Exactly ONE ticket must be elected PRIMARY');
    assert.strictEqual(mergedTickets.length, 9, 'Exactly NINE tickets must be MERGED_AUTOMATIC children');

    const primaryId = primaryTickets[0].id;

    // Verify every child points to the elected PRIMARY
    for (const child of mergedTickets) {
      assert.strictEqual(child.masterCaseId, primaryId, 'Every child must reference elected master ID');
    }

    // Verify database integrity and zero foreign key violations
    const db = getDatabase();
    const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
    assert.strictEqual(fkCheck.length, 0, 'Database foreign key check must return zero violations');

    // Verify that exactly 9 records in DB have master_case_id = primaryId
    const countRow = db
      .prepare('SELECT COUNT(*) as count FROM grievances WHERE master_case_id = ?')
      .get(primaryId) as { count: number };
    assert.strictEqual(countRow.count, 9, 'Database must record exactly 9 child records under master');
  });
});
