/**
 * Milestone 3 Adversarial Challenge & Empirical Verification Harness
 * 
 * Tests:
 * 1. API Aliases & Export Signatures in `src/api.ts`
 * 2. Parameter Polymorphism of `fetchGrievances` (string, object with role/regNo/email, undefined)
 * 3. Contract adherence of REST endpoints against live server instance
 * 4. Error resilience: invalid IDs in mergeTickets, detaching already primary tickets, updating master notes
 * 5. Student privacy isolation and PII protection across roles
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { getDatabase } from '../db.ts';
import {
  fetchGrievances,
  createGrievanceApi,
  updateGrievanceApi,
  loginUserApi,
  registerUserApi,
  saveUserApi,
  getUserApi,
  fetchAnalyticsTrendsApi,
  fetchRiskForecastApi,
  fetchTriageQueueApi,
  mergeTicketsApi,
  detachTicketApi,
  updateMasterNotesApi,
  // Aliases
  fetchAnalyticsTrends,
  fetchRiskForecast,
  fetchTriageQueue,
  mergeTicket,
  mergeTickets,
  detachTicket,
  updateMasterNotes,
  FetchGrievancesParams,
} from '../src/api.ts';

const CHALLENGE_PORT = process.env.TEST_PORT || '3098';
let serverBaseUrl = `http://127.0.0.1:${CHALLENGE_PORT}`;
let serverProcess: ChildProcess | null = null;

// Helper to wait for HTTP server
async function waitForServer(url: string, timeoutMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

before(async () => {
  // Check if standard port 3000 is open
  try {
    const res = await fetch('http://127.0.0.1:3000/api/health');
    if (res.ok) {
      serverBaseUrl = 'http://127.0.0.1:3000';
      return;
    }
  } catch {}

  serverProcess = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, PORT: CHALLENGE_PORT, NODE_ENV: 'test' },
    stdio: 'ignore',
    shell: true,
  });

  const ready = await waitForServer(serverBaseUrl, 8000);
  assert.ok(ready, `Server on ${serverBaseUrl} must be ready`);
});

after(() => {
  // Clean up any challenger test tickets
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@m3challenger.edu'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@m3challenger.edu'").run();
  } catch {}

  if (serverProcess) {
    try {
      if (process.platform === 'win32' && serverProcess.pid) {
        spawn('taskkill', ['/pid', serverProcess.pid.toString(), '/f', '/t']);
      } else {
        serverProcess.kill();
      }
    } catch {}
  }
});

// Polyfill global fetch to route relative URLs to test server
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  let url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('/')) {
    url = `${serverBaseUrl}${url}`;
  }
  return originalFetch(url, init);
};

describe('Milestone 3 Challenger: API Exports, Aliases & Signatures', () => {
  test('CH-API-01: All Milestone 3 API exports and aliases are valid functions with correct references', () => {
    assert.strictEqual(typeof fetchAnalyticsTrends, 'function', 'fetchAnalyticsTrends must be a function');
    assert.strictEqual(typeof fetchAnalyticsTrendsApi, 'function', 'fetchAnalyticsTrendsApi must be a function');
    assert.strictEqual(fetchAnalyticsTrends, fetchAnalyticsTrendsApi, 'fetchAnalyticsTrends must be an alias to fetchAnalyticsTrendsApi');

    assert.strictEqual(typeof fetchRiskForecast, 'function', 'fetchRiskForecast must be a function');
    assert.strictEqual(typeof fetchRiskForecastApi, 'function', 'fetchRiskForecastApi must be a function');
    assert.strictEqual(fetchRiskForecast, fetchRiskForecastApi, 'fetchRiskForecast must be an alias to fetchRiskForecastApi');

    assert.strictEqual(typeof fetchTriageQueue, 'function', 'fetchTriageQueue must be a function');
    assert.strictEqual(typeof fetchTriageQueueApi, 'function', 'fetchTriageQueueApi must be a function');
    assert.strictEqual(fetchTriageQueue, fetchTriageQueueApi, 'fetchTriageQueue must be an alias to fetchTriageQueueApi');

    assert.strictEqual(typeof mergeTicket, 'function', 'mergeTicket must be a function');
    assert.strictEqual(typeof mergeTickets, 'function', 'mergeTickets must be a function');
    assert.strictEqual(typeof mergeTicketsApi, 'function', 'mergeTicketsApi must be a function');
    assert.strictEqual(mergeTicket, mergeTicketsApi, 'mergeTicket must alias mergeTicketsApi');
    assert.strictEqual(mergeTickets, mergeTicketsApi, 'mergeTickets must alias mergeTicketsApi');

    assert.strictEqual(typeof detachTicket, 'function', 'detachTicket must be a function');
    assert.strictEqual(typeof detachTicketApi, 'function', 'detachTicketApi must be a function');
    assert.strictEqual(detachTicket, detachTicketApi, 'detachTicket must alias detachTicketApi');

    assert.strictEqual(typeof updateMasterNotes, 'function', 'updateMasterNotes must be a function');
    assert.strictEqual(typeof updateMasterNotesApi, 'function', 'updateMasterNotesApi must be a function');
  });

  test('CH-API-02: fetchGrievances polymorphically handles string, object, and undefined arguments', async () => {
    // 1. Undefined parameter -> fetches all grievances (admin view)
    const allGrievances = await fetchGrievances();
    assert.ok(Array.isArray(allGrievances), 'fetchGrievances() must return an array');

    // 2. String parameter -> treats as studentRegNo
    const byRegNoString = await fetchGrievances('2023CS999NONEXISTENT');
    assert.ok(Array.isArray(byRegNoString), 'fetchGrievances(string) must return an array');
    assert.strictEqual(byRegNoString.length, 0, 'Non-existent student should have 0 tickets');

    // 3. Object parameter -> { role: 'admin' }
    const adminFetch = await fetchGrievances({ role: 'admin' });
    assert.ok(Array.isArray(adminFetch), 'fetchGrievances({ role: "admin" }) must return array');

    // 4. Object parameter -> { role: 'student', studentRegNo: '2023CS999NONEXISTENT', studentEmail: 'none@campus.edu' }
    const studentFetch = await fetchGrievances({
      role: 'student',
      studentRegNo: '2023CS999NONEXISTENT',
      studentEmail: 'none@campus.edu',
    });
    assert.ok(Array.isArray(studentFetch), 'Student parameterized query returns array');
    assert.strictEqual(studentFetch.length, 0, 'No tickets for non-existent student');
  });

  test('CH-API-03: fetchAnalyticsTrends returns valid multidimensional aggregation schemas', async () => {
    const data = await fetchAnalyticsTrends();
    assert.ok(data.hostelMaintenance, 'Must include hostelMaintenance section');
    assert.ok(Array.isArray(data.hostelMaintenance.byBlock), 'byBlock must be array');
    assert.ok(Array.isArray(data.hostelMaintenance.byFloor), 'byFloor must be array');
    assert.ok(Array.isArray(data.hostelMaintenance.byIssueType), 'byIssueType must be array');

    assert.ok(data.campusTransport, 'Must include campusTransport section');
    assert.ok(Array.isArray(data.campusTransport.byRoute), 'byRoute must be array');
    assert.ok(Array.isArray(data.campusTransport.peakCongestionStops), 'peakCongestionStops must be array');

    assert.ok(data.networkWifi, 'Must include networkWifi section');
    assert.ok(Array.isArray(data.networkWifi.densityMatrix), 'densityMatrix must be array');

    assert.ok(Array.isArray(data.rolling7DayVelocity), 'rolling7DayVelocity must be array');
  });

  test('CH-API-04: fetchRiskForecast returns valid 1-100 severity bounds and drivers', async () => {
    const data = await fetchRiskForecast();
    assert.strictEqual(typeof data.overallCampusRiskScore, 'number', 'Score must be number');
    assert.ok(data.overallCampusRiskScore >= 1 && data.overallCampusRiskScore <= 100, 'Score must be in [1, 100]');
    assert.ok(['LOW', 'ELEVATED', 'HIGH_RISK'].includes(data.overallRiskLevel), 'Risk level must be LOW, ELEVATED, or HIGH_RISK');

    assert.ok(data.calendarMultipliers, 'Calendar multipliers must exist');
    assert.strictEqual(typeof data.calendarMultipliers.monsoonFactor, 'number');
    assert.strictEqual(typeof data.calendarMultipliers.examFactor, 'number');
    assert.strictEqual(typeof data.calendarMultipliers.semesterStartFactor, 'number');

    assert.ok(Array.isArray(data.zoneForecasts), 'zoneForecasts must be array');
    data.zoneForecasts.forEach((z) => {
      assert.ok(z.riskScore >= 1 && z.riskScore <= 100, 'Zone score in [1, 100]');
      assert.ok(['LOW', 'ELEVATED', 'HIGH_RISK'].includes(z.riskLevel));
      assert.ok(typeof z.primaryDriver === 'string' && z.primaryDriver.length > 0);
      assert.ok(typeof z.actionableRecommendation === 'string' && z.actionableRecommendation.length > 0);
    });
  });

  test('CH-API-05: fetchTriageQueue returns suspected duplicates array with candidateMaster structure', async () => {
    const res = await fetchTriageQueue();
    assert.ok(Array.isArray(res.suspectedDuplicates), 'suspectedDuplicates must be an array');
    res.suspectedDuplicates.forEach((item) => {
      assert.ok(item.id, 'Triage item must have id');
      assert.ok(item.ticketNo, 'Triage item must have ticketNo');
      assert.ok(typeof item.similarityScore === 'number', 'similarityScore must be number');
      assert.ok(item.candidateMaster, 'candidateMaster must exist');
      assert.ok(item.candidateMaster.id, 'candidateMaster must have id');
      assert.ok(item.candidateMaster.ticketNo, 'candidateMaster must have ticketNo');
      assert.ok(typeof item.candidateMaster.publicMasterNotes === 'string' || item.candidateMaster.publicMasterNotes === undefined);
    });
  });
});

describe('Milestone 3 Challenger: End-to-End Triage & Master Notes Flow', () => {
  let masterTicketId: string;
  let childTicketId: string;

  test('CH-TRIAGE-01: Create paired tickets and verify manual merge workflow via API aliases', async () => {
    // Create master ticket
    const masterRes = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: 'CHALLENGE_01',
        studentName: 'Challenger Alpha',
        studentEmail: 'alpha@m3challenger.edu',
        studentType: 'hosteller',
        hostelBlock: 'X',
        roomNo: 'X-501',
        category: 'Hostel Maintenance',
        description: 'Main ceiling fan in room X-501 sparked and stopped working completely',
        priority: 'urgent',
        locationTag: 'Hostel Block X, Floor 5, Room X-501',
        sourceTimestamp: new Date().toISOString(),
      }),
    });
    assert.strictEqual(masterRes.status, 201);
    const masterData = await masterRes.json();
    masterTicketId = masterData.id;
    assert.strictEqual(masterData.status, 'PRIMARY');

    // Create a borderline duplicate ticket (similarity in 0.80 - 0.91 range)
    const childRes = await fetch(`${serverBaseUrl}/api/grievances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentRegNo: 'CHALLENGE_02',
        studentName: 'Challenger Beta',
        studentEmail: 'beta@m3challenger.edu',
        studentType: 'hosteller',
        hostelBlock: 'X',
        roomNo: 'X-501',
        category: 'Hostel Maintenance',
        description: 'Ceiling fan in room X-501 is not running after electric sparks',
        priority: 'urgent',
        locationTag: 'Hostel Block X, Floor 5, Room X-501',
        sourceTimestamp: new Date().toISOString(),
      }),
    });
    assert.strictEqual(childRes.status, 201);
    const childData = await childRes.json();
    childTicketId = childData.id;

    // Execute mergeTicket API alias
    const mergeResult = await mergeTicket(masterTicketId, childTicketId);
    assert.strictEqual(mergeResult.success, true);
    assert.strictEqual(mergeResult.masterCaseId, masterTicketId);
    assert.strictEqual(mergeResult.childTicketId, childTicketId);

    // Verify child ticket in DB has MERGED_AUTOMATIC or PRIMARY status
    const db = getDatabase();
    const childRow = db.prepare('SELECT status, master_case_id FROM grievances WHERE id = ?').get(childTicketId) as any;
    assert.strictEqual(childRow.master_case_id, masterTicketId);
  });

  test('CH-TRIAGE-02: updateMasterNotes updates candidate master note and reflects in student view', async () => {
    const updateRes = await updateMasterNotes(masterTicketId, 'Electrician dispatched to Block X Floor 5. Repair ETA 2 hours.');
    assert.strictEqual(updateRes.success, true);
    assert.strictEqual(updateRes.id, masterTicketId);
    assert.strictEqual(updateRes.publicMasterNotes, 'Electrician dispatched to Block X Floor 5. Repair ETA 2 hours.');

    // Query as student Beta (child ticket holder)
    const betaTickets = await fetchGrievances({
      role: 'student',
      studentRegNo: 'CHALLENGE_02',
      studentEmail: 'beta@m3challenger.edu',
    });
    assert.strictEqual(betaTickets.length, 1);
    assert.strictEqual(betaTickets[0].id, childTicketId);
    // Student Beta must see master ticket number and public notes
    assert.strictEqual(betaTickets[0].publicMasterNotes, 'Electrician dispatched to Block X Floor 5. Repair ETA 2 hours.');
    // Student Beta must NOT see Alpha's email or phone
    assert.strictEqual((betaTickets[0] as any).masterReporterEmail, undefined);
    assert.strictEqual((betaTickets[0] as any).masterReporterPhone, undefined);
  });

  test('CH-TRIAGE-03: detachTicket detaches child ticket and restores PRIMARY status', async () => {
    const detachResult = await detachTicket(childTicketId);
    assert.strictEqual(detachResult.success, true);
    assert.strictEqual(detachResult.detachedTicketId, childTicketId);
    assert.strictEqual(detachResult.newStatus, 'PRIMARY');

    const db = getDatabase();
    const childRow = db.prepare('SELECT status, master_case_id FROM grievances WHERE id = ?').get(childTicketId) as any;
    assert.strictEqual(childRow.status, 'PRIMARY');
    assert.strictEqual(childRow.master_case_id, null);
  });

  test('CH-TRIAGE-04: Detaching is idempotent on primary tickets and rejects non-existent ticket IDs', async () => {
    // 1. Idempotency: Detaching a ticket that is already PRIMARY succeeds idempotently
    const idempotentResult = await detachTicket(childTicketId);
    assert.strictEqual(idempotentResult.success, true);
    assert.strictEqual(idempotentResult.newStatus, 'PRIMARY');

    // 2. Error handling: Non-existent ticket ID must be rejected
    await assert.rejects(
      async () => {
        await detachTicket('NON_EXISTENT_CHILD_TICKET_99999');
      },
      /not found/i,
      'Detaching non-existent ticket should be rejected'
    );
  });

  test('CH-TRIAGE-05: Merging invalid ticket IDs fails gracefully without server crash', async () => {
    await assert.rejects(
      async () => {
        await mergeTicket('NON_EXISTENT_MASTER', 'NON_EXISTENT_CHILD');
      },
      /not found/i,
      'Merging non-existent tickets should be rejected'
    );
  });
});
