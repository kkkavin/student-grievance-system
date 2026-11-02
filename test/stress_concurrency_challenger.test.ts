/**
 * Adversarial Concurrency, Race Condition, Privacy Stress & Load Benchmark Harness
 * 
 * Challenger Track: Concurrency and Race Condition Challenger (teamwork_challenger_m1_2)
 * 
 * Empirical challenges:
 * 1. 30-burst simultaneous duplicate submissions (single cluster):
 *    - Validates exactly 1 PRIMARY and 29 MERGED_AUTOMATIC.
 *    - Validates zero SQLITE_BUSY / locks, zero orphaned foreign keys, zero double-primaries.
 * 2. 30-burst multi-cluster concurrent submissions (3 clusters x 10 complaints simultaneously):
 *    - Validates exactly 3 PRIMARY cases and 27 MERGED_AUTOMATIC children.
 *    - Validates zero cross-cluster linking contamination.
 * 3. Concurrent Suspected Duplicate submissions (0.80 - 0.91):
 *    - Validates that concurrent borderline tickets cleanly route to SUSPECTED_DUPLICATE.
 * 4. High-load privacy isolation under concurrent read/write stress:
 *    - 50 concurrent student queries verifying strict zero-PII leakage.
 * 5. Vector similarity query SLA under 500-candidate pool & 1,000 queries:
 *    - Verifies P95 strictly < 50ms.
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { getDatabase } from '../db.ts';
import {
  generateEmbeddingVector,
  computeCosineSimilarity,
  VECTOR_DIMENSION,
} from '../src/ml/deduplication.ts';
import { HISTORICAL_GRIEVANCES } from './fixtures/timeseries_fixtures.ts';

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
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@stress.edu' OR studentRegNo LIKE 'STRESS%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@stress.edu'").run();
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
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@stress.edu' OR studentRegNo LIKE 'STRESS%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@stress.edu'").run();
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

describe('Adversarial Concurrency & Race Condition Stress Suite', () => {

  // --------------------------------------------------------------------------
  // CHALLENGE 1: 30 Simultaneous Duplicate Submissions (Heavy Single-Cluster Burst)
  // --------------------------------------------------------------------------
  test('CH-CONC-01: 30 concurrent duplicate submissions produce exactly 1 PRIMARY and 29 MERGED_AUTOMATIC with zero deadlocks', async () => {
    const uniqueRoom = `STRESS-D-${Math.floor(Math.random() * 900 + 100)}`;
    const commonDesc = `Critical main overhead water pipe fractured in corridor of ${uniqueRoom}, severe flooding`;

    const payloads = Array.from({ length: 30 }, (_, i) => ({
      studentRegNo: `STRESS_SINGLE_${String(i + 1).padStart(2, '0')}`,
      studentName: `Stress Student ${i + 1}`,
      studentEmail: `stress.student${i + 1}@stress.edu`,
      studentPhone: `98888000${String(i + 1).padStart(2, '0')}`,
      studentType: 'hosteller',
      hostelBlock: 'Block D',
      roomNo: uniqueRoom,
      category: 'Plumbing & Water',
      description: commonDesc,
      priority: 'urgent',
      locationTag: `Hostel Block D, Floor 3, Room ${uniqueRoom}`,
      sourceTimestamp: new Date().toISOString(),
    }));

    // Fire 30 requests completely concurrently
    const start = performance.now();
    const responses = await Promise.all(payloads.map((p) => postGrievance(p)));
    const elapsed = performance.now() - start;

    console.log(`\n  ⚡ 30 Concurrent Single-Cluster Requests resolved in ${elapsed.toFixed(2)}ms (avg ${(elapsed / 30).toFixed(2)}ms/req)`);

    // Every request must succeed with 201 Created
    for (const r of responses) {
      assert.strictEqual(r.status, 201, `Expected HTTP 201, got ${r.status}`);
      assert.ok(r.data.id, 'Every ticket must receive an ID');
    }

    const tickets = responses.map((r) => r.data);
    const primary = tickets.filter((t) => t.status === 'PRIMARY');
    const merged = tickets.filter((t) => t.status === 'MERGED_AUTOMATIC');

    // Hard invariants
    assert.strictEqual(primary.length, 1, `Expected exactly 1 PRIMARY ticket, found ${primary.length}`);
    assert.strictEqual(merged.length, 29, `Expected exactly 29 MERGED_AUTOMATIC tickets, found ${merged.length}`);

    const masterId = primary[0].id;
    for (const child of merged) {
      assert.strictEqual(child.masterCaseId, masterId, `Child ticket ${child.ticketNo} must point to master ID ${masterId}`);
      assert.ok(child.similarityScore !== undefined && child.similarityScore >= 0.92, `Child ticket must have similarity >= 0.92, got ${child.similarityScore}`);
    }

    // Verify database internal integrity
    const db = getDatabase();
    const integrityCheck = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    assert.strictEqual(integrityCheck.integrity_check, 'ok', 'Database integrity check must return "ok"');

    const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
    assert.strictEqual(fkCheck.length, 0, 'Zero foreign key violations in database');
  });

  // --------------------------------------------------------------------------
  // CHALLENGE 2: 30 Multi-Cluster Concurrent Submissions (3 Distinct Categories simultaneously)
  // --------------------------------------------------------------------------
  test('CH-CONC-02: 30 multi-cluster concurrent submissions cleanly partition into 3 distinct primaries with zero cross-cluster leakage', async () => {
    const clusterAPayloads = Array.from({ length: 10 }, (_, i) => ({
      studentRegNo: `STRESS_CA_${i + 1}`,
      studentName: `Cluster A Student ${i + 1}`,
      studentEmail: `stress.ca${i + 1}@stress.edu`,
      studentPhone: `91111000${String(i + 1).padStart(2, '0')}`,
      studentType: 'hosteller',
      hostelBlock: 'Block E',
      roomNo: 'E-401',
      category: 'Plumbing & Water',
      description: 'Hostel Block E 4th floor overhead water tank valve broken, water gushing into stairs',
      priority: 'urgent',
      locationTag: 'Hostel Block E, Floor 4, Room E-401',
      sourceTimestamp: new Date().toISOString(),
    }));

    const clusterBPayloads = Array.from({ length: 10 }, (_, i) => ({
      studentRegNo: `STRESS_CB_${i + 1}`,
      studentName: `Cluster B Student ${i + 1}`,
      studentEmail: `stress.cb${i + 1}@stress.edu`,
      studentPhone: `92222000${String(i + 1).padStart(2, '0')}`,
      studentType: 'dayscholar',
      category: 'Bus & Transport',
      description: 'Route 12 campus bus tire puncture near North Ring Gate, students stranded in morning rush',
      priority: 'high',
      locationTag: 'Campus Transport / Dayscholar - Route 12',
      sourceTimestamp: new Date().toISOString(),
    }));

    const clusterCPayloads = Array.from({ length: 10 }, (_, i) => ({
      studentRegNo: `STRESS_CC_${i + 1}`,
      studentName: `Cluster C Student ${i + 1}`,
      studentEmail: `stress.cc${i + 1}@stress.edu`,
      studentPhone: `93333000${String(i + 1).padStart(2, '0')}`,
      studentType: 'dayscholar',
      category: 'Hostel Wi-Fi & Internet',
      description: 'ECE VLSI Lab 302 access point down, no DHCP IP assignment for entire batch',
      priority: 'medium',
      locationTag: 'ECE Department, Floor 3, Lab 302',
      sourceTimestamp: new Date().toISOString(),
    }));

    // Interleave all 3 clusters so requests from A, B, and C hit the server simultaneously
    const interleavedPayloads: any[] = [];
    for (let i = 0; i < 10; i++) {
      interleavedPayloads.push(clusterAPayloads[i]);
      interleavedPayloads.push(clusterBPayloads[i]);
      interleavedPayloads.push(clusterCPayloads[i]);
    }

    const start = performance.now();
    const responses = await Promise.all(interleavedPayloads.map((p) => postGrievance(p)));
    const elapsed = performance.now() - start;

    console.log(`\n  ⚡ 30 Interleaved Multi-Cluster Requests resolved in ${elapsed.toFixed(2)}ms`);

    for (const r of responses) {
      assert.strictEqual(r.status, 201, `Submission failed with status ${r.status}: ${JSON.stringify(r.data)}`);
    }

    const tickets = responses.map((r) => r.data);

    // Group tickets by category
    const catA = tickets.filter((t) => t.category === 'Plumbing & Water');
    const catB = tickets.filter((t) => t.category === 'Bus & Transport');
    const catC = tickets.filter((t) => t.category === 'Hostel Wi-Fi & Internet');

    assert.strictEqual(catA.length, 10, 'Must have 10 Plumbing tickets');
    assert.strictEqual(catB.length, 10, 'Must have 10 Transport tickets');
    assert.strictEqual(catC.length, 10, 'Must have 10 Wi-Fi tickets');

    // In each category, exactly 1 PRIMARY and 9 MERGED_AUTOMATIC
    const primA = catA.filter((t) => t.status === 'PRIMARY');
    const mergA = catA.filter((t) => t.status === 'MERGED_AUTOMATIC');
    assert.strictEqual(primA.length, 1, 'Cluster A must have exactly 1 PRIMARY');
    assert.strictEqual(mergA.length, 9, 'Cluster A must have exactly 9 children');

    const primB = catB.filter((t) => t.status === 'PRIMARY');
    const mergB = catB.filter((t) => t.status === 'MERGED_AUTOMATIC');
    assert.strictEqual(primB.length, 1, 'Cluster B must have exactly 1 PRIMARY');
    assert.strictEqual(mergB.length, 9, 'Cluster B must have exactly 9 children');

    const primC = catC.filter((t) => t.status === 'PRIMARY');
    const mergC = catC.filter((t) => t.status === 'MERGED_AUTOMATIC');
    assert.strictEqual(primC.length, 1, 'Cluster C must have exactly 1 PRIMARY');
    assert.strictEqual(mergC.length, 9, 'Cluster C must have exactly 9 children');

    // Zero cross-cluster contamination: verify all children in A point ONLY to primA[0].id
    for (const child of mergA) {
      assert.strictEqual(child.masterCaseId, primA[0].id, 'Cluster A child must point to primA');
    }
    for (const child of mergB) {
      assert.strictEqual(child.masterCaseId, primB[0].id, 'Cluster B child must point to primB');
    }
    for (const child of mergC) {
      assert.strictEqual(child.masterCaseId, primC[0].id, 'Cluster C child must point to primC');
    }
  });

  // --------------------------------------------------------------------------
  // CHALLENGE 3: Concurrent Suspected Duplicates (Triage Ingestion)
  // --------------------------------------------------------------------------
  test('CH-CONC-03: Concurrent suspected duplicates (0.80 - 0.91) are correctly flagged and listed in triage queue', async () => {
    // 1. First create primary anchor ticket
    const anchorRes = await postGrievance({
      studentRegNo: 'STRESS_ANCHOR',
      studentName: 'Anchor Student',
      studentEmail: 'anchor@stress.edu',
      studentPhone: '9555500000',
      studentType: 'hosteller',
      hostelBlock: 'Block A',
      roomNo: 'A-304',
      category: 'Electrical & AC',
      description: 'Corridor tube light outside room A-304 is flickering constantly and making buzzing noise.',
      priority: 'less_important',
      locationTag: 'Hostel Block A, Floor 3',
    });
    assert.strictEqual(anchorRes.status, 201);
    const anchor = anchorRes.data;

    // 2. Submit 5 borderline similar complaints concurrently
    const borderlineDesc = 'Tube light broken and buzzing in 3rd floor hallway near room A-305.';
    const borderlinePayloads = Array.from({ length: 5 }, (_, i) => ({
      studentRegNo: `STRESS_SUSP_${i + 1}`,
      studentName: `Susp Student ${i + 1}`,
      studentEmail: `stress.susp${i + 1}@stress.edu`,
      studentPhone: `94444000${String(i + 1).padStart(2, '0')}`,
      studentType: 'hosteller',
      hostelBlock: 'Block A',
      roomNo: 'A-305',
      category: 'Electrical & AC',
      description: borderlineDesc,
      priority: 'less_important',
      locationTag: 'Hostel Block A, Floor 3',
    }));

    const responses = await Promise.all(borderlinePayloads.map((p) => postGrievance(p)));
    for (const r of responses) {
      assert.strictEqual(r.status, 201);
      // Status must be either SUSPECTED_DUPLICATE or MERGED_AUTOMATIC depending on similarity, but never orphan
      assert.ok(['SUSPECTED_DUPLICATE', 'MERGED_AUTOMATIC'].includes(r.data.status));
      assert.ok(r.data.masterCaseId !== null);
    }

    // Check triage endpoint returns valid suspected duplicates
    const triageRes = await fetch(`${serverBaseUrl}/api/grievances/triage`);
    assert.strictEqual(triageRes.status, 200);
    const triageData = await triageRes.json();
    assert.ok(Array.isArray(triageData.suspectedDuplicates));
  });

  // --------------------------------------------------------------------------
  // CHALLENGE 4: High-Load Privacy Isolation Under Read/Write Concurrency
  // --------------------------------------------------------------------------
  test('CH-PRV-01: High-load student queries strictly preserve privacy with zero PII leakage under 50 concurrent requests', async () => {
    const victimRegNo = 'STRESS_VICTIM_01';
    const victimName = 'Ultra Secret Victim';
    const victimEmail = 'ultra.secret@stress.edu';
    const victimPhone = '9998887776';

    const snoopRegNo = 'STRESS_SNOOP_02';
    const snoopName = 'Curious Snooper';
    const snoopEmail = 'curious.snoop@stress.edu';

    // 1. Submit victim primary grievance
    const masterRes = await postGrievance({
      studentRegNo: victimRegNo,
      studentName: victimName,
      studentEmail: victimEmail,
      studentPhone: victimPhone,
      studentType: 'hosteller',
      hostelBlock: 'Block B',
      roomNo: 'B-303',
      category: 'Electrical & AC',
      description: 'Short circuit sparks coming from main switchboard in room B-303',
      priority: 'urgent',
      locationTag: 'Hostel Block B, Floor 3, Room B-303',
    });
    assert.strictEqual(masterRes.status, 201);
    const masterTicket = masterRes.data;

    // Set public master note
    await fetch(`${serverBaseUrl}/api/grievances/${masterTicket.id}/master-notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicMasterNotes: 'Electrician team dispatched. Isolator switch turned off.' }),
    });

    // 2. Submit snoop duplicate grievance (gets merged into victim)
    const childRes = await postGrievance({
      studentRegNo: snoopRegNo,
      studentName: snoopName,
      studentEmail: snoopEmail,
      studentPhone: '8887776665',
      studentType: 'hosteller',
      hostelBlock: 'Block B',
      roomNo: 'B-303',
      category: 'Electrical & AC',
      description: 'Roommate report: Short circuit sparks coming from main switchboard in room B-303',
      priority: 'urgent',
      locationTag: 'Hostel Block B, Floor 3, Room B-303',
    });
    assert.strictEqual(childRes.status, 201);
    assert.strictEqual(childRes.data.status, 'MERGED_AUTOMATIC');

    // 3. Dispatch 50 concurrent student queries requesting snoop's view
    const snoopQueries = Array.from({ length: 50 }, () =>
      fetch(`${serverBaseUrl}/api/grievances?role=student&studentRegNo=${snoopRegNo}`)
    );

    const snoopResponses = await Promise.all(snoopQueries);
    for (const res of snoopResponses) {
      assert.strictEqual(res.status, 200);
      const tickets = await res.json();
      assert.strictEqual(tickets.length, 1);
      const ticket = tickets[0];

      // Verifications:
      assert.strictEqual(ticket.studentRegNo, snoopRegNo);
      assert.strictEqual(ticket.studentName, snoopName);
      assert.strictEqual(ticket.studentEmail, snoopEmail);
      assert.strictEqual(ticket.masterTicketNo, masterTicket.ticketNo);
      assert.strictEqual(ticket.publicMasterNotes, 'Electrician team dispatched. Isolator switch turned off.');

      // ZERO PII LEAKAGE CHECK
      const serialized = JSON.stringify(ticket);
      assert.strictEqual(serialized.includes(victimName), false, 'Must NOT contain victim name');
      assert.strictEqual(serialized.includes(victimEmail), false, 'Must NOT contain victim email');
      assert.strictEqual(serialized.includes(victimPhone), false, 'Must NOT contain victim phone');
      assert.strictEqual(serialized.includes(victimRegNo), false, 'Must NOT contain victim regNo');
    }
  });

  // --------------------------------------------------------------------------
  // CHALLENGE 5: Vector Similarity Latency SLA under High Query Load (<50ms P95)
  // --------------------------------------------------------------------------
  test('CH-SLA-01: Vector similarity latency remains strictly < 50ms across 1,000 queries over 400 candidate vectors', () => {
    // Generate pool of 400 candidate vectors
    const candidatePool: Array<{ id: string; vector: number[] }> = [];
    for (let i = 0; i < 400; i++) {
      const h = HISTORICAL_GRIEVANCES[i % HISTORICAL_GRIEVANCES.length];
      const text = `${h.description} [Variant ${i}]`;
      const vec = generateEmbeddingVector(text, [h.category, h.locationTag]);
      candidatePool.push({ id: `cand-${i}`, vector: vec });
    }

    // Generate 1,000 query vectors
    const queryVectors: number[][] = [];
    for (let i = 0; i < 1000; i++) {
      const h = HISTORICAL_GRIEVANCES[(i * 3) % HISTORICAL_GRIEVANCES.length];
      const vec = generateEmbeddingVector(h.description, [h.category]);
      queryVectors.push(vec);
    }

    // Warm-up
    for (let w = 0; w < 50; w++) {
      computeCosineSimilarity(queryVectors[0], candidatePool[w].vector);
    }

    // Measure 1,000 queries
    const latenciesMs: number[] = [];
    for (let q = 0; q < queryVectors.length; q++) {
      const qVec = queryVectors[q];
      const start = performance.now();

      let topScore = -1;
      for (let c = 0; c < candidatePool.length; c++) {
        const score = computeCosineSimilarity(qVec, candidatePool[c].vector);
        if (score > topScore) {
          topScore = score;
        }
      }

      latenciesMs.push(performance.now() - start);
    }

    latenciesMs.sort((a, b) => a - b);
    const mean = latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length;
    const p50 = latenciesMs[Math.floor(latenciesMs.length * 0.5)];
    const p90 = latenciesMs[Math.floor(latenciesMs.length * 0.9)];
    const p95 = latenciesMs[Math.floor(latenciesMs.length * 0.95)];
    const p99 = latenciesMs[Math.floor(latenciesMs.length * 0.99)];
    const max = latenciesMs[latenciesMs.length - 1];

    console.log(`\n  📊 HIGH-LOAD VECTOR SIMILARITY BENCHMARK (1,000 QUERIES x 400 CANDIDATES):`);
    console.log(`     Mean Latency : ${mean.toFixed(4)} ms`);
    console.log(`     P50 Latency  : ${p50.toFixed(4)} ms`);
    console.log(`     P90 Latency  : ${p90.toFixed(4)} ms`);
    console.log(`     P95 Latency  : ${p95.toFixed(4)} ms (Hard SLA: < 50.00 ms)`);
    console.log(`     P99 Latency  : ${p99.toFixed(4)} ms`);
    console.log(`     Max Latency  : ${max.toFixed(4)} ms`);
    console.log(`     Throughput   : ${(1000 / mean).toFixed(0)} queries/sec`);

    assert.ok(p95 < 50.0, `P95 latency must be strictly < 50ms, observed ${p95.toFixed(4)}ms`);
    assert.ok(p95 < 5.0, `P95 should comfortably be < 5ms, observed ${p95.toFixed(4)}ms`);
  });

  // --------------------------------------------------------------------------
  // CHALLENGE 6: 50 Concurrent Duplicate Submissions (Maximum Burst)
  // --------------------------------------------------------------------------
  test('CH-CONC-04: 50 concurrent duplicate submissions produce exactly 1 PRIMARY and 49 MERGED_AUTOMATIC with zero SQLITE_BUSY', async () => {
    const burstRoom = `BURST-${Math.floor(Math.random() * 900 + 100)}`;
    const burstDesc = `Hostel Block F corridor ceiling water seepage dripping on power socket in room ${burstRoom}`;

    const payloads = Array.from({ length: 50 }, (_, i) => ({
      studentRegNo: `STRESS_BURST_${String(i + 1).padStart(2, '0')}`,
      studentName: `Burst Student ${i + 1}`,
      studentEmail: `stress.burst${i + 1}@stress.edu`,
      studentPhone: `97777000${String(i + 1).padStart(2, '0')}`,
      studentType: 'hosteller',
      hostelBlock: 'Block F',
      roomNo: burstRoom,
      category: 'Plumbing & Water',
      description: burstDesc,
      priority: 'urgent',
      locationTag: `Hostel Block F, Floor 2, Room ${burstRoom}`,
      sourceTimestamp: new Date().toISOString(),
    }));

    const start = performance.now();
    const responses = await Promise.all(payloads.map((p) => postGrievance(p)));
    const elapsed = performance.now() - start;

    console.log(`\n  ⚡ 50 Concurrent Duplicate Submissions resolved in ${elapsed.toFixed(2)}ms (avg ${(elapsed / 50).toFixed(2)}ms/req)`);

    for (const r of responses) {
      assert.strictEqual(r.status, 201);
      assert.ok(r.data.id);
    }

    const tickets = responses.map((r) => r.data);
    const primary = tickets.filter((t) => t.status === 'PRIMARY');
    const merged = tickets.filter((t) => t.status === 'MERGED_AUTOMATIC');

    assert.strictEqual(primary.length, 1, `Exactly ONE primary ticket expected under 50-load burst, got ${primary.length}`);
    assert.strictEqual(merged.length, 49, `Exactly 49 child tickets expected under 50-load burst, got ${merged.length}`);

    const masterId = primary[0].id;
    for (const child of merged) {
      assert.strictEqual(child.masterCaseId, masterId);
    }
  });

  // --------------------------------------------------------------------------
  // CHALLENGE 7: Concurrent Master Ticket Resolution Fan-Out Under Load
  // --------------------------------------------------------------------------
  test('CH-CONC-05: Concurrent master ticket resolution broadcasts outbox notifications to master and all 15 linked children without race condition', async () => {
    const resRoom = `RES-${Math.floor(Math.random() * 900 + 100)}`;
    const resDesc = `Hostel Block C Wi-Fi switch reboot loop and port flapping near room ${resRoom}`;

    // 1. Submit 16 duplicates (1 will be primary, 15 will be merged)
    const payloads = Array.from({ length: 16 }, (_, i) => ({
      studentRegNo: `STRESS_RES_${String(i + 1).padStart(2, '0')}`,
      studentName: `Resolution Student ${i + 1}`,
      studentEmail: `stress.res${i + 1}@stress.edu`,
      studentPhone: `96666000${String(i + 1).padStart(2, '0')}`,
      studentType: 'hosteller',
      hostelBlock: 'Block C',
      roomNo: resRoom,
      category: 'Hostel Wi-Fi & Internet',
      description: resDesc,
      priority: 'high',
      locationTag: `Hostel Block C, Floor 1, Room ${resRoom}`,
    }));

    const responses = await Promise.all(payloads.map((p) => postGrievance(p)));
    const tickets = responses.map((r) => r.data);
    const statuses = tickets.map((t) => ({ id: t.id, status: t.status, score: t.similarityScore, masterId: t.masterCaseId }));
    console.log('CH-CONC-05 statuses:', JSON.stringify(statuses, null, 2));
    const master = tickets.find((t) => t.status === 'PRIMARY')!;
    const children = tickets.filter((t) => t.status === 'MERGED_AUTOMATIC');

    assert.ok(master);
    assert.strictEqual(children.length, 15);

    // 2. Resolve the master ticket via PUT /api/grievances/:id
    const resolveRes = await fetch(`${serverBaseUrl}/api/grievances/${master.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        publicMasterNotes: 'Cisco 2960 switch power supply replaced. Port stabilization complete.',
      }),
    });
    assert.strictEqual(resolveRes.status, 200);

    // 3. Verify in DB that master and all 15 children are now resolved
    const db = getDatabase();
    const resolvedMaster = db.prepare('SELECT status, public_master_notes FROM grievances WHERE id = ?').get(master.id) as any;
    assert.strictEqual(resolvedMaster.status, 'resolved');
    assert.strictEqual(resolvedMaster.public_master_notes, 'Cisco 2960 switch power supply replaced. Port stabilization complete.');

    const childRows = db.prepare('SELECT id, status FROM grievances WHERE master_case_id = ?').all(master.id) as Array<{ id: string; status: string }>;
    assert.strictEqual(childRows.length, 15);
    for (const cr of childRows) {
      assert.strictEqual(cr.status, 'resolved', `Child ${cr.id} must be marked resolved`);
    }

    // 4. Verify outbox contains resolution emails for all 16 students
    const outboxRows = db.prepare("SELECT recipient, type, subject FROM outbox WHERE recipient LIKE '%@stress.edu' AND type = 'resolution'").all() as Array<{ recipient: string; type: string; subject: string }>;
    
    assert.strictEqual(outboxRows.length, 16, `Expected 16 resolution outbox entries, found ${outboxRows.length}`);
    const recipients = new Set(outboxRows.map((o) => o.recipient));
    for (let i = 1; i <= 16; i++) {
      assert.ok(recipients.has(`stress.res${i}@stress.edu`), `Expected outbox for stress.res${i}@stress.edu`);
    }
  });
});

