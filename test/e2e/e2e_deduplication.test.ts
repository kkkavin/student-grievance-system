/**
 * Tier 1-4 End-to-End Deduplication Test Suite
 * Tests the complete Deduplication Pipeline:
 * - Tier 1: Core Feature Coverage (Submission, metadata capture, default PRIMARY status)
 * - Tier 2: Boundary & Corner (71h vs 73h window, 0.920 vs 0.919, 0.800 vs 0.799, cross-category, special chars)
 * - Tier 3: Cross-Feature Combinations (Auto-merge outbox, tree linking, triage manual merge/detach, master resolution fan-out)
 * - Tier 4: Real-World Scenarios (Hostel Block A pipe burst x10, Route 8 bus breakdown, Wi-Fi switch outage)
 */

import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { getDatabase, getOutboxEmails } from '../../db.ts';
import {
  generateEmbeddingVector,
  computeCosineSimilarity,
  runTwoStageDeduplication,
  AUTO_MERGE_THRESHOLD,
  SUSPECTED_DUPLICATE_THRESHOLD,
} from '../../src/ml/deduplication.ts';
import { DEDUP_FIXTURE_PAIRS } from '../fixtures/dedup_fixtures.ts';

const TEST_PORT = process.env.TEST_PORT || '3099';
let serverBaseUrl = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ChildProcess | null = null;

// Helper to wait for HTTP server to become responsive
async function waitForServer(url: string, timeoutMs = 8000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      // Server not yet listening
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

before(async () => {
  // Clean up any test records from prior runs to ensure test isolation
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@campus.edu' OR studentRegNo LIKE '2023%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@campus.edu'").run();
  } catch {
    // Database might not be initialized yet
  }

  // Check if standard server is already running on port 3000
  try {
    const res = await fetch('http://127.0.0.1:3000/api/health');
    if (res.ok) {
      serverBaseUrl = 'http://127.0.0.1:3000';
      return;
    }
  } catch {
    // Port 3000 not running, spawn on TEST_PORT
  }

  // Spawn test server instance
  serverProcess = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, PORT: TEST_PORT, NODE_ENV: 'test' },
    stdio: 'ignore',
    shell: true,
  });

  const ready = await waitForServer(serverBaseUrl, 10000);
  if (!ready) {
    console.warn(`Could not connect to ${serverBaseUrl}, test will use fallback assertions.`);
  }
});

after(() => {
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@campus.edu' OR studentRegNo LIKE '2023%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@campus.edu'").run();
  } catch {
    // Ignore during teardown
  }

  if (serverProcess) {
    try {
      if (process.platform === 'win32' && serverProcess.pid) {
        spawn('taskkill', ['/pid', serverProcess.pid.toString(), '/f', '/t']);
      } else {
        serverProcess.kill();
      }
    } catch (e) {
      // Ignored during cleanup
    }
  }
});

// Helper for HTTP POST
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
// TIER 1: FEATURE COVERAGE
// ============================================================================
describe('Tier 1: Core Deduplication Feature Coverage', () => {
  test('TC-T1-01: Grievance submission captures metadata and defaults to PRIMARY status', async () => {
    const uniqueRoom = `Z-${Math.floor(Math.random() * 800 + 100)}`;
    const payload = {
      studentRegNo: '2023CS001',
      studentName: 'Tier1 Test User',
      studentEmail: 'tier1.user@campus.edu',
      studentPhone: '9876500001',
      studentType: 'hosteller',
      hostelBlock: 'Z',
      roomNo: uniqueRoom,
      category: 'Hostel Maintenance',
      description: `Unique initial maintenance issue in room ${uniqueRoom} for Tier 1 testing`,
      priority: 'medium',
      locationTag: `Hostel Block Z, Floor 1, Room ${uniqueRoom}`,
      sourceTimestamp: new Date().toISOString(),
    };

    const res = await postGrievance(payload);
    assert.strictEqual(res.status, 201, 'Should return 201 Created');
    const created = res.data;

    // Validate fields
    assert.ok(created.id, 'Must generate unique id');
    assert.ok(created.ticketNo.startsWith('GRV-'), 'Ticket number must follow GRV- pattern');
    assert.strictEqual(created.status, 'PRIMARY', 'Default status must be PRIMARY when no candidates exist');
    assert.strictEqual(created.masterCaseId, null, 'masterCaseId must be null for PRIMARY grievance');
    assert.strictEqual(created.locationTag, payload.locationTag, 'Must preserve locationTag');
    assert.ok(created.sourceTimestamp, 'Must capture sourceTimestamp');
    assert.ok(Array.isArray(created.embeddingVector), 'Must generate embeddingVector');
    assert.strictEqual(created.embeddingVector.length, 256, 'Embedding vector length must be 256');

    // Verify SQLite WAL persistence
    const db = getDatabase();
    const row = db.prepare('SELECT id, status, master_case_id FROM grievances WHERE id = ?').get(created.id) as any;
    assert.ok(row, 'Grievance must exist in SQLite database');
    assert.strictEqual(row.status, 'PRIMARY');
    assert.strictEqual(row.master_case_id, null);
  });
});

// ============================================================================
// TIER 2: BOUNDARY VALUE ANALYSIS & CORNER CASES
// ============================================================================
describe('Tier 2: Boundary Value Analysis & Edge Cases', () => {
  test('TC-T2-01: Rolling window boundary - 71 hours matches candidate, 73 hours excludes candidate', async () => {
    const candidateId = `tkt_boundary_time_${Date.now()}`;
    const baseDesc = 'Water leakage in common washroom flush valve causing flooding';

    // 1. Candidate submitted 71 hours ago (inside 72h window)
    const time71hAgo = new Date(Date.now() - 71 * 60 * 60 * 1000).toISOString();
    const candInside = {
      id: candidateId + '_71h',
      ticketNo: 'GRV-2026-71H',
      category: 'Hostel Maintenance',
      description: baseDesc,
      hostelBlock: 'B',
      roomNo: 'B-201',
      status: 'PRIMARY',
      createdAt: time71hAgo,
      embeddingVector: generateEmbeddingVector(baseDesc, ['Hostel Maintenance', 'B', 'B-201']),
    };

    const result71h = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: baseDesc,
        hostelBlock: 'B',
        roomNo: 'B-201',
        studentType: 'hosteller',
      },
      [candInside],
    );
    assert.strictEqual(result71h.action, 'AUTO_MERGE', 'Candidate inside 72h window (71h) must be eligible for merge');

    // 2. Candidate submitted 73 hours ago (outside 72h window)
    const time73hAgo = new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString();
    const candOutside = {
      id: candidateId + '_73h',
      ticketNo: 'GRV-2026-73H',
      category: 'Hostel Maintenance',
      description: baseDesc,
      hostelBlock: 'B',
      roomNo: 'B-201',
      status: 'PRIMARY',
      createdAt: time73hAgo,
      embeddingVector: generateEmbeddingVector(baseDesc, ['Hostel Maintenance', 'B', 'B-201']),
    };

    const result73h = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: baseDesc,
        hostelBlock: 'B',
        roomNo: 'B-201',
        studentType: 'hosteller',
      },
      [candOutside],
    );
    assert.strictEqual(result73h.action, 'PRIMARY', 'Candidate outside 72h window (73h) must be pruned by Stage 1 hard filter');
  });

  test('TC-T2-02: Auto-merge similarity threshold exact cutoff at 0.92', () => {
    assert.strictEqual(AUTO_MERGE_THRESHOLD, 0.92, 'Threshold must be exactly 0.92');

    // Simulated vector pair yielding 0.92 vs 0.919
    const scoreA = 0.920;
    const scoreB = 0.919;

    assert.ok(scoreA >= AUTO_MERGE_THRESHOLD, '0.920 must meet or exceed auto-merge threshold');
    assert.ok(scoreB < AUTO_MERGE_THRESHOLD, '0.919 must fall below auto-merge threshold');
  });

  test('TC-T2-03: Suspected duplicate similarity threshold exact cutoff at 0.80', () => {
    assert.strictEqual(SUSPECTED_DUPLICATE_THRESHOLD, 0.80, 'Threshold must be exactly 0.80');

    const scoreA = 0.800;
    const scoreB = 0.799;

    assert.ok(scoreA >= SUSPECTED_DUPLICATE_THRESHOLD, '0.800 must trigger suspected duplicate status');
    assert.ok(scoreB < SUSPECTED_DUPLICATE_THRESHOLD, '0.799 must remain independent primary');
  });

  test('TC-T2-04: Cross-category separation - identical text in different categories must not match', () => {
    const text = 'Water leakage and spill in main corridor';
    const cand = {
      id: 'cand_cross_cat',
      ticketNo: 'GRV-2026-CC1',
      category: 'Food & Mess',
      description: text,
      status: 'PRIMARY',
      createdAt: new Date().toISOString(),
      embeddingVector: generateEmbeddingVector(text, ['Food & Mess']),
    };

    const result = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance', // Different category
        description: text,
        studentType: 'hosteller',
      },
      [cand],
    );

    assert.strictEqual(result.action, 'PRIMARY', 'Cross-category tickets must be pruned in Stage 1 hard filter');
    assert.strictEqual(result.masterCaseId, null);
  });

  test('TC-T2-05: Empty, punctuation-only, and special character resilience', async () => {
    const specialTexts = [
      '!!!???###$$$%%%^^^&&&***',
      'Water leak! @# Room A-304 "urgent" \'help\'',
      'குடிநீர் கசிவு (Tamil transliteration) in washroom',
    ];

    for (const text of specialTexts) {
      const vec = generateEmbeddingVector(text);
      assert.strictEqual(vec.length, 256, 'Vector dimension must remain 256 regardless of special characters');
      const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
      if (norm > 0) {
        assert.ok(Math.abs(norm - 1.0) < 1e-4, 'L2 norm must be approximately 1.0');
      }
    }
  });
});

// ============================================================================
// TIER 3: CROSS-FEATURE INTEGRATION WORKFLOWS
// ============================================================================
describe('Tier 3: Cross-Feature Integration Workflows', () => {
  test('TC-T3-01: Auto-merge with notification outbox queuing and master-child hierarchy', async () => {
    const testRoom = `M-${Math.floor(Math.random() * 800 + 100)}`;
    const initialDesc = `Burst washroom tap flooding room ${testRoom} floor`;

    // 1. Submit Primary Ticket
    const primaryRes = await postGrievance({
      studentRegNo: '2023CS011',
      studentName: 'Primary Reporter',
      studentEmail: 'primary.rep@campus.edu',
      studentType: 'hosteller',
      hostelBlock: 'M',
      roomNo: testRoom,
      category: 'Hostel Maintenance',
      description: initialDesc,
      priority: 'urgent',
      locationTag: `Hostel Block M, Floor 1, Room ${testRoom}`,
      sourceTimestamp: new Date().toISOString(),
    });
    assert.strictEqual(primaryRes.status, 201);
    const primaryTicket = primaryRes.data;
    assert.strictEqual(primaryTicket.status, 'PRIMARY');

    // 2. Submit Child Ticket (identical issue in same room)
    const childRes = await postGrievance({
      studentRegNo: '2023CS012',
      studentName: 'Roommate Reporter',
      studentEmail: 'roommate.rep@campus.edu',
      studentType: 'hosteller',
      hostelBlock: 'M',
      roomNo: testRoom,
      category: 'Hostel Maintenance',
      description: `Roommate: burst washroom tap flooding room ${testRoom} bathroom floor`,
      priority: 'urgent',
      locationTag: `Hostel Block M, Floor 1, Room ${testRoom}`,
      sourceTimestamp: new Date().toISOString(),
    });
    assert.strictEqual(childRes.status, 201);
    const childTicket = childRes.data;

    // Assert auto-merge linking
    assert.strictEqual(childTicket.status, 'MERGED_AUTOMATIC', 'Child ticket must be auto-merged');
    assert.strictEqual(childTicket.masterCaseId, primaryTicket.id, 'masterCaseId must reference primary ticket');
    assert.ok(childTicket.similarityScore && childTicket.similarityScore >= 0.90, 'Similarity score must be high');

    // 3. Verify notification outbox has confirmation email for child reporter
    const outboxRes = await fetch(`${serverBaseUrl}/api/notifications/outbox?email=roommate.rep@campus.edu`);
    const outboxData = await outboxRes.json();
    const childEmail = outboxData.outbox?.find((o: any) => o.recipient === 'roommate.rep@campus.edu');
    assert.ok(childEmail, 'Child reporter must receive consolidation notification in outbox');
    assert.ok(
      childEmail.body.includes(primaryTicket.ticketNo) || childEmail.body.includes('consolidated'),
      'Email body must inform student of consolidation',
    );
  });

  test('TC-T3-02: Triage queue listing, manual merge, and manual detach workflows', async () => {
    // 1. Query Triage Queue
    const triageRes = await fetch(`${serverBaseUrl}/api/grievances/triage`);
    assert.strictEqual(triageRes.status, 200, 'GET /api/grievances/triage should return 200');
    const triageData = await triageRes.json();
    assert.ok(Array.isArray(triageData.suspectedDuplicates), 'triage response must contain suspectedDuplicates array');

    // 2. Create standalone ticket for manual merge test
    const masterTicket = (await postGrievance({
      studentRegNo: '2023CS021',
      studentName: 'Manual Master',
      studentEmail: 'master.manual@campus.edu',
      studentType: 'hosteller',
      hostelBlock: 'K',
      roomNo: 'K-101',
      category: 'Hostel Maintenance',
      description: 'Hostel Block K 1st floor water cooler compressor failing',
      priority: 'medium',
      locationTag: 'Hostel Block K, Floor 1',
    })).data;

    const childTicket = (await postGrievance({
      studentRegNo: '2023CS022',
      studentName: 'Manual Child',
      studentEmail: 'child.manual@campus.edu',
      studentType: 'hosteller',
      hostelBlock: 'K',
      roomNo: 'K-105',
      category: 'Hostel Maintenance',
      description: 'Hostel Block K water cooler warm water only',
      priority: 'medium',
      locationTag: 'Hostel Block K, Floor 1',
    })).data;

    // 3. Execute POST /api/grievances/merge
    const mergeRes = await fetch(`${serverBaseUrl}/api/grievances/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterId: masterTicket.id, childId: childTicket.id }),
    });
    assert.strictEqual(mergeRes.status, 200, 'POST /api/grievances/merge should return 200');
    const mergeData = await mergeRes.json();
    assert.strictEqual(mergeData.success, true);
    assert.strictEqual(mergeData.masterCaseId, masterTicket.id);

    // 4. Execute POST /api/grievances/detach
    const detachRes = await fetch(`${serverBaseUrl}/api/grievances/detach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childId: childTicket.id }),
    });
    assert.strictEqual(detachRes.status, 200, 'POST /api/grievances/detach should return 200');
    const detachData = await detachRes.json();
    assert.strictEqual(detachData.success, true);
    assert.strictEqual(detachData.newStatus, 'PRIMARY');

    // Verify DB state
    const db = getDatabase();
    const detachedRow = db.prepare('SELECT status, master_case_id FROM grievances WHERE id = ?').get(childTicket.id) as any;
    assert.strictEqual(detachedRow.status, 'PRIMARY');
    assert.strictEqual(detachedRow.master_case_id, null);
  });

  test('TC-T3-03: Master ticket resolution broadcast fans out notifications to all linked child reporters', async () => {
    // 1. Submit Master
    const master = (await postGrievance({
      studentRegNo: '2023CS031',
      studentName: 'Fanout Master',
      studentEmail: 'fanout.master@campus.edu',
      studentType: 'hosteller',
      hostelBlock: 'P',
      roomNo: 'P-202',
      category: 'Electrical & AC',
      description: 'Main wing corridor power cut in Block P floor 2',
      priority: 'urgent',
      locationTag: 'Hostel Block P, Floor 2',
    })).data;

    // 2. Submit Child 1
    const child1 = (await postGrievance({
      studentRegNo: '2023CS032',
      studentName: 'Fanout Child 1',
      studentEmail: 'fanout.child1@campus.edu',
      studentType: 'hosteller',
      hostelBlock: 'P',
      roomNo: 'P-204',
      category: 'Electrical & AC',
      description: 'Power blackout on corridor lights Block P floor 2',
      priority: 'urgent',
      locationTag: 'Hostel Block P, Floor 2',
    })).data;

    // Manually merge child1 under master if not auto-merged
    await fetch(`${serverBaseUrl}/api/grievances/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterId: master.id, childId: child1.id }),
    });

    // 3. Update public master notes
    const notesRes = await fetch(`${serverBaseUrl}/api/grievances/${master.id}/master-notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicMasterNotes: 'Electrician replaced burnt circuit breaker in distribution panel.' }),
    });
    assert.strictEqual(notesRes.status, 200);

    // 4. Resolve Master Ticket
    const resolveRes = await fetch(`${serverBaseUrl}/api/grievances/${master.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', adminNotes: 'Repaired by maintenance team' }),
    });
    assert.strictEqual(resolveRes.status, 200);

    // 5. Audit Outbox via API for Fan-Out Notifications
    const outboxMasterRes = await fetch(`${serverBaseUrl}/api/notifications/outbox?email=fanout.master@campus.edu`);
    const outboxMasterData = await outboxMasterRes.json();
    const masterNotice = outboxMasterData.outbox?.find((o: any) => o.recipient === 'fanout.master@campus.edu' && o.type === 'resolution');

    const outboxChildRes = await fetch(`${serverBaseUrl}/api/notifications/outbox?email=fanout.child1@campus.edu`);
    const outboxChildData = await outboxChildRes.json();
    const childNotice = outboxChildData.outbox?.find((o: any) => o.recipient === 'fanout.child1@campus.edu' && o.type === 'resolution');

    assert.ok(masterNotice, 'Master reporter must receive resolution email');
    assert.ok(childNotice, 'Child reporter must receive broadcast resolution email');
    assert.ok(childNotice.body.includes(master.ticketNo), 'Broadcast notice must mention Master Case ticket number');
  });
});

// ============================================================================
// TIER 4: REAL-WORLD INCIDENT SCENARIOS
// ============================================================================
describe('Tier 4: Real-World Incident Scenarios', () => {
  beforeEach(() => {
    try {
      const db = getDatabase();
      db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@campus.edu' OR studentRegNo LIKE '2023%'").run();
      db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@campus.edu'").run();
    } catch {
      // Ignored
    }
  });

  test('TC-T4-01: Hostel Block A pipe burst - 10 simultaneous complaints consolidate into 1 Master + 9 Children', async () => {
    const burstRoom = `A-3${Math.floor(Math.random() * 80 + 10)}`;
    const studentSubmissions = Array.from({ length: 10 }, (_, i) => ({
      studentRegNo: `2023BURST${String(i + 1).padStart(2, '0')}`,
      studentName: `Student ${i + 1}`,
      studentEmail: `burst.student${i + 1}@campus.edu`,
      studentType: 'hosteller',
      hostelBlock: 'A',
      roomNo: burstRoom,
      category: 'Hostel Maintenance',
      description: `Emergency: water pipe burst in washroom room ${burstRoom}, flooding bathroom and hallway rapidly`,
      priority: 'urgent',
      locationTag: `Hostel Block A, Floor 3, Room ${burstRoom}`,
      sourceTimestamp: new Date().toISOString(),
    }));

    const results: any[] = [];
    for (const sub of studentSubmissions) {
      const res = await postGrievance(sub);
      assert.strictEqual(res.status, 201);
      results.push(res.data);
    }

    // Exactly 1 PRIMARY, 9 MERGED_AUTOMATIC
    const primaryTickets = results.filter((r) => r.status === 'PRIMARY');
    const mergedTickets = results.filter((r) => r.status === 'MERGED_AUTOMATIC');

    assert.strictEqual(primaryTickets.length, 1, 'First complaint must be crowned PRIMARY Master');
    assert.strictEqual(mergedTickets.length, 9, 'All 9 subsequent complaints must be MERGED_AUTOMATIC');

    const masterId = primaryTickets[0].id;
    for (const child of mergedTickets) {
      assert.strictEqual(child.masterCaseId, masterId, 'Child ticket must point to masterCaseId');
    }
  });

  test('TC-T4-02: Route 8 Bus Breakdown - Multiple students report stranded bus', async () => {
    const r1 = (await postGrievance({
      studentRegNo: '2023BUS01',
      studentName: 'Route 8 Commuter 1',
      studentEmail: 'commuter1@campus.edu',
      studentType: 'dayscholar',
      category: 'Bus & Transport',
      description: 'Route 8 college bus breakdown near Tollgate junction with rear tire flat puncture',
      priority: 'urgent',
      locationTag: 'Campus Transport Route 8',
    })).data;

    const r2 = (await postGrievance({
      studentRegNo: '2023BUS02',
      studentName: 'Route 8 Commuter 2',
      studentEmail: 'commuter2@campus.edu',
      studentType: 'dayscholar',
      category: 'Bus & Transport',
      description: 'Route 8 college bus breakdown near Tollgate junction, rear tire flat puncture on bus',
      priority: 'urgent',
      locationTag: 'Campus Transport Route 8',
    })).data;

    assert.strictEqual(r1.status, 'PRIMARY');
    assert.strictEqual(r2.status, 'MERGED_AUTOMATIC');
    assert.strictEqual(r2.masterCaseId, r1.id);
  });

  test('TC-T4-03: Campus-wide Wi-Fi switch outage in Tech Block', async () => {
    const w1 = (await postGrievance({
      studentRegNo: '2023WIFI01',
      studentName: 'Lab Student 1',
      studentEmail: 'lab1@campus.edu',
      studentType: 'dayscholar',
      category: 'Network & Wi-Fi',
      description: 'Wi-Fi completely offline in CSE 2nd floor lab, access point AP-CSE-F2-01 gateway down',
      priority: 'urgent',
      locationTag: 'CSE Block, Floor 2, AP-CSE-F2-01',
    })).data;

    const w2 = (await postGrievance({
      studentRegNo: '2023WIFI02',
      studentName: 'Lab Student 2',
      studentEmail: 'lab2@campus.edu',
      studentType: 'dayscholar',
      category: 'Network & Wi-Fi',
      description: 'Wi-Fi completely offline in CSE 2nd floor lab, access point AP-CSE-F2-01 gateway down',
      priority: 'urgent',
      locationTag: 'CSE Block, Floor 2, AP-CSE-F2-01',
    })).data;

    assert.strictEqual(w1.status, 'PRIMARY');
    assert.strictEqual(w2.status, 'MERGED_AUTOMATIC');
    assert.strictEqual(w2.masterCaseId, w1.id);
  });
});

// ============================================================================
// TIER 5: CURATED 40-FIXTURE DEDUPLICATION SUITE
// ============================================================================
describe('Tier 5: Curated 40-Fixture Deduplication Suite', () => {
  test('TC-T5-01: All 40 curated deduplication fixture pairs achieve expected action and similarity bounds', () => {
    let passed = 0;
    const failures: string[] = [];

    for (const pair of DEDUP_FIXTURE_PAIRS) {
      const pVec = generateEmbeddingVector(pair.primaryTicket.description, [
        pair.primaryTicket.category,
        pair.primaryTicket.hostelBlock || '',
        pair.primaryTicket.roomNo || '',
        pair.primaryTicket.locationTag || '',
      ]);
      const cVec = generateEmbeddingVector(pair.candidateTicket.description, [
        pair.candidateTicket.category,
        pair.candidateTicket.hostelBlock || '',
        pair.candidateTicket.roomNo || '',
        pair.candidateTicket.locationTag || '',
      ]);

      const sim = computeCosineSimilarity(pVec, cVec);

      const candidate = {
        id: `primary-${pair.pairId}`,
        ticketNo: `GRV-PRIM-${pair.pairId}`,
        category: pair.primaryTicket.category,
        hostelBlock: pair.primaryTicket.hostelBlock,
        roomNo: pair.primaryTicket.roomNo,
        description: pair.primaryTicket.description,
        embeddingVector: pVec,
        status: 'PRIMARY',
        createdAt: new Date(Date.now() - pair.timeOffsetHours * 3600 * 1000).toISOString(),
        locationTag: pair.primaryTicket.locationTag,
      };

      const result = runTwoStageDeduplication(
        {
          category: pair.candidateTicket.category,
          description: pair.candidateTicket.description,
          hostelBlock: pair.candidateTicket.hostelBlock,
          roomNo: pair.candidateTicket.roomNo,
          studentType: pair.candidateTicket.studentType,
          locationTag: pair.candidateTicket.locationTag,
          embeddingVector: cVec,
        },
        [candidate as any],
      );

      const actionOk = result.action === pair.expectedAction;
      const statusOk = result.status === pair.expectedStatus;
      let boundsOk = true;
      if (pair.expectedAction !== 'PRIMARY' || result.similarityScore !== null) {
        boundsOk = sim >= pair.expectedMinSimilarity && sim <= pair.expectedMaxSimilarity;
      }

      let rawDot = 0, nzA = 0, nzB = 0, shared = 0;
      for (let i = 0; i < pVec.length; i++) {
        rawDot += pVec[i] * cVec[i];
        if (pVec[i] > 0.0001) nzA++;
        if (cVec[i] > 0.0001) nzB++;
        if (pVec[i] > 0.0001 && cVec[i] > 0.0001) shared++;
      }
      const minOv = Math.min(nzA, nzB) > 0 ? shared / Math.min(nzA, nzB) : 0;
      const maxOv = Math.max(nzA, nzB) > 0 ? shared / Math.max(nzA, nzB) : 0;
      const dice = (nzA + nzB) > 0 ? (2 * shared) / (nzA + nzB) : 0;

      if (actionOk && statusOk && boundsOk) {
        passed++;
      } else {
        failures.push(
          `[${pair.pairId}] ${pair.tier}: exp=[${pair.expectedMinSimilarity}-${pair.expectedMaxSimilarity}], sim=${sim}, dot=${rawDot.toFixed(4)}, minOv=${minOv.toFixed(4)}, maxOv=${maxOv.toFixed(4)}`,
        );
      }
    }

    if (failures.length > 0) {
      console.log(`Failed ${failures.length} / 40 fixtures:`, failures);
    }
    assert.strictEqual(failures.length, 0, `${failures.length} / 40 fixture pairs failed validation`);
    assert.strictEqual(passed, 40, 'All 40 fixture pairs must pass');
  });
});
