/**
 * Dedicated Concurrency Burst & Stress Harness (Milestone 1 Iteration 2 Gate Verification)
 * 
 * Verifies:
 * 1. 60-burst simultaneous concurrent submissions (`Promise.all`):
 *    - Validates high-entropy ticketNo generator completely eliminates collisions.
 *    - Validates 0 HTTP 400 errors, 0 `UNIQUE constraint failed: grievances.ticketNo`.
 *    - Validates exactly 1 PRIMARY and 59 MERGED_AUTOMATIC children without race conditions or orphans.
 *    - Validates database PRAGMA integrity_check and PRAGMA foreign_key_check.
 * 2. 60-burst multi-cluster interleaved concurrent submissions (3 clusters x 20 complaints simultaneously):
 *    - Validates 3 PRIMARY cases and 57 MERGED_AUTOMATIC children (19 per cluster).
 *    - Validates zero cross-cluster linking contamination.
 * 3. Suspected duplicate triage queue integrity under concurrent load:
 *    - Validates calibrated [0.80, 0.91] scores route cleanly to SUSPECTED_DUPLICATE with candidate master link.
 * 4. Master ticket resolution fan-out atomicity:
 *    - Atomic transaction update resolves master + all 19 children and queues 20 resolution outbox emails.
 * 5. High-load vector similarity query latency SLA under load:
 *    - 1,000 queries over 400 candidate vectors.
 *    - Asserts P95 latency remains strictly < 50ms (hard SLA).
 * 6. High-concurrency student privacy isolation:
 *    - 50 concurrent student queries verifying strict zero-PII leakage of master reporter.
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { getDatabase } from '../../db.ts';
import {
  generateEmbeddingVector,
  computeCosineSimilarity,
} from '../../src/ml/deduplication.ts';
import { HISTORICAL_GRIEVANCES } from '../fixtures/timeseries_fixtures.ts';
import { DEDUP_FIXTURE_PAIRS } from '../fixtures/dedup_fixtures.ts';

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
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@burststress.edu' OR studentRegNo LIKE 'BURST%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@burststress.edu'").run();
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
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@burststress.edu' OR studentRegNo LIKE 'BURST%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@burststress.edu'").run();
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

describe('Milestone 1 Iteration 2 Gate: Concurrency Burst & Stress Verification', () => {

  // ==========================================================================
  // 1. Single-Cluster Concurrency Burst (60 simultaneous duplicate submissions)
  // ==========================================================================
  test('BURST-01: 60 simultaneous concurrent submissions eliminate ticketNo collisions and achieve zero HTTP 400 errors', async () => {
    const burstRoom = `BURST-${Math.floor(Math.random() * 900 + 100)}`;
    const burstDesc = `Severe high-pressure water pipe rupture flooding hostel hallway outside room ${burstRoom}`;

    const payloads = Array.from({ length: 60 }, (_, i) => ({
      studentRegNo: `BURST_S1_${String(i + 1).padStart(2, '0')}`,
      studentName: `Burst Student ${i + 1}`,
      studentEmail: `burst.s1_${i + 1}@burststress.edu`,
      studentPhone: `91111000${String(i + 1).padStart(2, '0')}`,
      studentType: 'hosteller',
      hostelBlock: 'Block D',
      roomNo: burstRoom,
      category: 'Plumbing & Water',
      description: burstDesc,
      priority: 'urgent',
      locationTag: `Hostel Block D, Floor 3, Room ${burstRoom}`,
      sourceTimestamp: new Date().toISOString(),
    }));

    const start = performance.now();
    const responses = await Promise.all(payloads.map((p) => postGrievance(p)));
    const duration = performance.now() - start;

    console.log(`\n  ⚡ [BURST-01] 60 Simultaneous Submissions resolved in ${duration.toFixed(2)}ms (avg ${(duration / 60).toFixed(2)}ms/req)`);

    // Invariant 1: Zero HTTP 400 or error status codes
    for (const r of responses) {
      assert.strictEqual(r.status, 201, `Expected HTTP 201 Created, but received status ${r.status}: ${JSON.stringify(r.data)}`);
      assert.ok(r.data.id, 'Every ticket must have an assigned id');
      assert.ok(r.data.ticketNo, 'Every ticket must have an assigned ticketNo');
    }

    const tickets = responses.map((r) => r.data);

    // Invariant 2: High-entropy ticketNo uniqueness (60 unique ticket numbers)
    const ticketNos = tickets.map((t) => t.ticketNo);
    const uniqueTicketNos = new Set(ticketNos);
    assert.strictEqual(uniqueTicketNos.size, 60, `All 60 ticket numbers must be mutually unique. Found ${uniqueTicketNos.size}`);

    // Invariant 3: High-entropy ticketNo format validation
    const ticketNoPattern = /^GRV-\d{4}-[A-Z0-9]+-\d{6}$/;
    for (const tNo of ticketNos) {
      assert.match(tNo, ticketNoPattern, `ticketNo "${tNo}" must match format GRV-YYYY-BASE36TIMESTAMP-6DIGITS`);
    }

    // Invariant 4: Atomicity: Exactly 1 PRIMARY, exactly 59 MERGED_AUTOMATIC
    const primaries = tickets.filter((t) => t.status === 'PRIMARY');
    const children = tickets.filter((t) => t.status === 'MERGED_AUTOMATIC');

    assert.strictEqual(primaries.length, 1, `Expected exactly 1 PRIMARY ticket under 60-burst, got ${primaries.length}`);
    assert.strictEqual(children.length, 59, `Expected exactly 59 MERGED_AUTOMATIC tickets under 60-burst, got ${children.length}`);

    const masterId = primaries[0].id;
    for (const child of children) {
      assert.strictEqual(child.masterCaseId, masterId, `Child ticket ${child.ticketNo} must reference master ID ${masterId}`);
      assert.ok(child.similarityScore !== undefined && child.similarityScore >= 0.92, `Child ticket similarity must be >= 0.92, got ${child.similarityScore}`);
    }

    // Invariant 5: SQLite Database Integrity Verification
    const db = getDatabase();
    const integrityCheck = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    assert.strictEqual(integrityCheck.integrity_check, 'ok', 'PRAGMA integrity_check must be "ok"');

    const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
    assert.strictEqual(fkCheck.length, 0, 'Zero foreign key violations in database');

    const dbCount = db.prepare('SELECT COUNT(*) as count FROM grievances WHERE master_case_id = ?').get(masterId) as { count: number };
    assert.strictEqual(dbCount.count, 59, 'Database must record exactly 59 child records linked to masterId');
  });

  // ==========================================================================
  // 2. Multi-Cluster Interleaved Concurrency Burst (3 clusters x 20 complaints = 60 requests)
  // ==========================================================================
  test('BURST-02: 60 interleaved multi-cluster submissions partition into 3 distinct primaries with 0 cross-cluster contamination', async () => {
    const clusterAPayloads = Array.from({ length: 20 }, (_, i) => ({
      studentRegNo: `BURST_MC_A_${i + 1}`,
      studentName: `Cluster A Student ${i + 1}`,
      studentEmail: `burst.mca_${i + 1}@burststress.edu`,
      studentPhone: `92222000${String(i + 1).padStart(2, '0')}`,
      studentType: 'hosteller',
      hostelBlock: 'Block E',
      roomNo: 'E-501',
      category: 'Plumbing & Water',
      description: 'Hostel Block E 5th floor roof storage tank valve fractured and water pouring into stairwell',
      priority: 'urgent',
      locationTag: 'Hostel Block E, Floor 5, Room E-501',
      sourceTimestamp: new Date().toISOString(),
    }));

    const clusterBPayloads = Array.from({ length: 20 }, (_, i) => ({
      studentRegNo: `BURST_MC_B_${i + 1}`,
      studentName: `Cluster B Student ${i + 1}`,
      studentEmail: `burst.mcb_${i + 1}@burststress.edu`,
      studentPhone: `93333000${String(i + 1).padStart(2, '0')}`,
      studentType: 'dayscholar',
      category: 'Bus & Transport',
      description: 'Route 18 college bus transmission breakdown near East Toll Gate, commuters stranded',
      priority: 'high',
      locationTag: 'Campus Transport / Dayscholar - Route 18',
      sourceTimestamp: new Date().toISOString(),
    }));

    const clusterCPayloads = Array.from({ length: 20 }, (_, i) => ({
      studentRegNo: `BURST_MC_C_${i + 1}`,
      studentName: `Cluster C Student ${i + 1}`,
      studentEmail: `burst.mcc_${i + 1}@burststress.edu`,
      studentPhone: `94444000${String(i + 1).padStart(2, '0')}`,
      studentType: 'dayscholar',
      category: 'Hostel Wi-Fi & Internet',
      description: 'Mechanical Dept CAD Lab 204 switch port flapping, all workstation connections dropped',
      priority: 'medium',
      locationTag: 'Mech Dept, Floor 2, CAD Lab 204',
      sourceTimestamp: new Date().toISOString(),
    }));

    // Interleave all 60 payloads
    const interleavedPayloads: any[] = [];
    for (let i = 0; i < 20; i++) {
      interleavedPayloads.push(clusterAPayloads[i]);
      interleavedPayloads.push(clusterBPayloads[i]);
      interleavedPayloads.push(clusterCPayloads[i]);
    }

    const start = performance.now();
    const responses = await Promise.all(interleavedPayloads.map((p) => postGrievance(p)));
    const duration = performance.now() - start;

    console.log(`\n  ⚡ [BURST-02] 60 Multi-Cluster Interleaved Submissions resolved in ${duration.toFixed(2)}ms (avg ${(duration / 60).toFixed(2)}ms/req)`);

    for (const r of responses) {
      assert.strictEqual(r.status, 201, `Multi-cluster submission failed with status ${r.status}`);
    }

    const tickets = responses.map((r) => r.data);

    // Group tickets by category
    const catA = tickets.filter((t) => t.category === 'Plumbing & Water');
    const catB = tickets.filter((t) => t.category === 'Bus & Transport');
    const catC = tickets.filter((t) => t.category === 'Hostel Wi-Fi & Internet');

    assert.strictEqual(catA.length, 20);
    assert.strictEqual(catB.length, 20);
    assert.strictEqual(catC.length, 20);

    // Each cluster has exactly 1 PRIMARY and 19 MERGED_AUTOMATIC
    const primA = catA.filter((t) => t.status === 'PRIMARY');
    const mergA = catA.filter((t) => t.status === 'MERGED_AUTOMATIC');
    assert.strictEqual(primA.length, 1, 'Cluster A must have exactly 1 PRIMARY');
    assert.strictEqual(mergA.length, 19, 'Cluster A must have exactly 19 children');

    const primB = catB.filter((t) => t.status === 'PRIMARY');
    const mergB = catB.filter((t) => t.status === 'MERGED_AUTOMATIC');
    assert.strictEqual(primB.length, 1, 'Cluster B must have exactly 1 PRIMARY');
    assert.strictEqual(mergB.length, 19, 'Cluster B must have exactly 19 children');

    const primC = catC.filter((t) => t.status === 'PRIMARY');
    const mergC = catC.filter((t) => t.status === 'MERGED_AUTOMATIC');
    assert.strictEqual(primC.length, 1, 'Cluster C must have exactly 1 PRIMARY');
    assert.strictEqual(mergC.length, 19, 'Cluster C must have exactly 19 children');

    // Zero cross-cluster contamination
    for (const child of mergA) {
      assert.strictEqual(child.masterCaseId, primA[0].id);
    }
    for (const child of mergB) {
      assert.strictEqual(child.masterCaseId, primB[0].id);
    }
    for (const child of mergC) {
      assert.strictEqual(child.masterCaseId, primC[0].id);
    }
  });

  // ==========================================================================
  // 3. Suspected Duplicate Triage Queue Atomicity
  // ==========================================================================
  test('BURST-03: Concurrent suspected duplicates ([0.80, 0.91]) cleanly route to SUSPECTED_DUPLICATE with candidate link', async () => {
    // Select 6 distinct suspected duplicate fixture pairs
    const suspPairs = DEDUP_FIXTURE_PAIRS.filter((p) => p.tier === 'SUSPECTED_DUPLICATE').slice(0, 6);
    assert.strictEqual(suspPairs.length, 6, 'Must have 6 suspected duplicate fixture pairs');

    // 1. Submit the 6 primary anchor tickets sequentially to ensure anchor points exist
    const anchorTickets: any[] = [];
    for (let i = 0; i < suspPairs.length; i++) {
      const pair = suspPairs[i];
      const anchorRes = await postGrievance({
        ...pair.primaryTicket,
        studentRegNo: `BURST_ANC_${i + 1}`,
        studentEmail: `burst.anc_${i + 1}@burststress.edu`,
      });
      assert.strictEqual(anchorRes.status, 201);
      assert.strictEqual(anchorRes.data.status, 'PRIMARY');
      anchorTickets.push(anchorRes.data);
    }

    // 2. Submit all 6 suspected duplicate candidates simultaneously via Promise.all
    const candidatePayloads = suspPairs.map((pair, i) => ({
      ...pair.candidateTicket,
      studentRegNo: `BURST_CAND_${i + 1}`,
      studentEmail: `burst.cand_${i + 1}@burststress.edu`,
    }));

    const responses = await Promise.all(candidatePayloads.map((p) => postGrievance(p)));

    // Verify all 6 candidates are classified as SUSPECTED_DUPLICATE linked to their anchor
    for (let i = 0; i < responses.length; i++) {
      const r = responses[i];
      assert.strictEqual(r.status, 201);
      assert.strictEqual(r.data.status, 'SUSPECTED_DUPLICATE', `Candidate ${i + 1} expected SUSPECTED_DUPLICATE, got ${r.data.status}`);
      assert.strictEqual(r.data.masterCaseId, anchorTickets[i].id, `Candidate ${i + 1} must point to anchor ticket ID`);
      assert.ok(
        r.data.similarityScore >= 0.80 && r.data.similarityScore <= 0.91,
        `Candidate ${i + 1} similarity score ${r.data.similarityScore} must be within [0.80, 0.91]`
      );
    }

    // 3. Verify Triage queue endpoint returns suspected duplicates
    const triageRes = await fetch(`${serverBaseUrl}/api/grievances/triage`);
    assert.strictEqual(triageRes.status, 200);
    const triageData = await triageRes.json();
    assert.ok(Array.isArray(triageData.suspectedDuplicates));
    for (const anchor of anchorTickets) {
      const inTriage = triageData.suspectedDuplicates.some((s: any) => s.candidateMaster?.id === anchor.id);
      assert.ok(inTriage, `Anchor ticket ${anchor.id} must be in triage queue`);
    }
  });

  // ==========================================================================
  // 4. Atomic Resolution Fan-Out Under Load
  // ==========================================================================
  test('BURST-04: Master ticket resolution atomically updates master and 20 children with 21 outbox notifications', async () => {
    const resRoom = `RES-${Math.floor(Math.random() * 900 + 100)}`;
    const resDesc = `Hostel Block B Corridor main circuit breaker repeatedly tripping under load near room ${resRoom}`;

    // Submit 21 duplicates (1 primary, 20 children)
    const payloads = Array.from({ length: 21 }, (_, i) => ({
      studentRegNo: `BURST_RES_${String(i + 1).padStart(2, '0')}`,
      studentName: `Res Student ${i + 1}`,
      studentEmail: `burst.res_${i + 1}@burststress.edu`,
      studentPhone: `96666000${String(i + 1).padStart(2, '0')}`,
      studentType: 'hosteller',
      hostelBlock: 'Block B',
      roomNo: resRoom,
      category: 'Electrical & AC',
      description: resDesc,
      priority: 'urgent',
      locationTag: `Hostel Block B, Floor 2, Room ${resRoom}`,
    }));

    const responses = await Promise.all(payloads.map((p) => postGrievance(p)));
    const tickets = responses.map((r) => r.data);
    const master = tickets.find((t) => t.status === 'PRIMARY')!;
    const children = tickets.filter((t) => t.status === 'MERGED_AUTOMATIC');

    assert.ok(master, 'Master ticket must be elected');
    assert.strictEqual(children.length, 20, 'Expected 20 child tickets');

    // Resolve master ticket via PUT /api/grievances/:id
    const resolveRes = await fetch(`${serverBaseUrl}/api/grievances/${master.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        publicMasterNotes: 'Main breaker replaced with 63A Schneider unit. Load tested and verified operational.',
      }),
    });
    assert.strictEqual(resolveRes.status, 200);

    // Verify DB atomicity: master and all 20 children are 'resolved'
    const db = getDatabase();
    const resolvedMaster = db.prepare('SELECT status, public_master_notes FROM grievances WHERE id = ?').get(master.id) as any;
    assert.strictEqual(resolvedMaster.status, 'resolved');
    assert.strictEqual(resolvedMaster.public_master_notes, 'Main breaker replaced with 63A Schneider unit. Load tested and verified operational.');

    const childRows = db.prepare('SELECT id, status FROM grievances WHERE master_case_id = ?').all(master.id) as Array<{ id: string; status: string }>;
    assert.strictEqual(childRows.length, 20);
    for (const cr of childRows) {
      assert.strictEqual(cr.status, 'resolved', `Child ${cr.id} must be marked resolved`);
    }

    // Verify outbox contains 21 resolution notification records
    const outboxRows = db.prepare("SELECT recipient, type FROM outbox WHERE recipient LIKE 'burst.res_%@burststress.edu' AND type = 'resolution'").all() as Array<{ recipient: string; type: string }>;
    assert.strictEqual(outboxRows.length, 21, `Expected 21 resolution outbox entries, found ${outboxRows.length}`);
  });

  // ==========================================================================
  // 5. High-Load Vector Similarity Query Latency SLA (< 50ms P95)
  // ==========================================================================
  test('BURST-05: Vector similarity search latency strictly satisfies P95 < 50ms across 1,000 queries over 400 candidate vectors', () => {
    // 1. Build 400-vector candidate pool
    const candidatePool: Array<{ id: string; vector: number[] }> = [];
    for (let i = 0; i < 400; i++) {
      const h = HISTORICAL_GRIEVANCES[i % HISTORICAL_GRIEVANCES.length];
      const text = `${h.description} [Candidate Variant ${i}]`;
      const vec = generateEmbeddingVector(text, [h.category, h.locationTag]);
      candidatePool.push({ id: `cand-${i}`, vector: vec });
    }

    // 2. Prepare 1,000 queries
    const queryVectors: number[][] = [];
    for (let i = 0; i < 1000; i++) {
      const h = HISTORICAL_GRIEVANCES[(i * 7) % HISTORICAL_GRIEVANCES.length];
      const vec = generateEmbeddingVector(h.description, [h.category]);
      queryVectors.push(vec);
    }

    // 3. Warm-up
    for (let w = 0; w < 50; w++) {
      computeCosineSimilarity(queryVectors[0], candidatePool[w].vector);
    }

    // 4. Measure 1,000 queries
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
    const min = latenciesMs[0];
    const max = latenciesMs[latenciesMs.length - 1];
    const p50 = latenciesMs[Math.floor(latenciesMs.length * 0.5)];
    const p90 = latenciesMs[Math.floor(latenciesMs.length * 0.9)];
    const p95 = latenciesMs[Math.floor(latenciesMs.length * 0.95)];
    const p99 = latenciesMs[Math.floor(latenciesMs.length * 0.99)];

    console.log(`\n  📊 [BURST-05] 1,000 QUERIES OVER 400 CANDIDATES PERFORMANCE METRICS:`);
    console.log(`     Min Latency  : ${min.toFixed(4)} ms`);
    console.log(`     Mean Latency : ${mean.toFixed(4)} ms`);
    console.log(`     P50 Latency  : ${p50.toFixed(4)} ms`);
    console.log(`     P90 Latency  : ${p90.toFixed(4)} ms`);
    console.log(`     P95 Latency  : ${p95.toFixed(4)} ms (Hard SLA: < 50.00 ms)`);
    console.log(`     P99 Latency  : ${p99.toFixed(4)} ms`);
    console.log(`     Max Latency  : ${max.toFixed(4)} ms`);
    console.log(`     Throughput   : ${(1000 / mean).toFixed(0)} queries/sec`);

    // Hard SLA assertion: P95 MUST be strictly < 50ms
    assert.ok(p95 < 50.0, `P95 latency must be strictly < 50ms, observed ${p95.toFixed(4)}ms`);
    assert.ok(p95 < 5.0, `P95 latency should comfortably be < 5ms, observed ${p95.toFixed(4)}ms`);
  });

  // ==========================================================================
  // 6. High-Concurrency Student Privacy Isolation
  // ==========================================================================
  test('BURST-06: 50 concurrent student queries strictly preserve privacy with zero master PII leakage', async () => {
    const masterRegNo = 'BURST_PRV_MASTER';
    const masterName = 'Confidential Master Reporter';
    const masterEmail = 'confidential.master@burststress.edu';
    const masterPhone = '9998881111';

    const childRegNo = 'BURST_PRV_CHILD';
    const childName = 'Child Student Reporter';
    const childEmail = 'child.student@burststress.edu';

    // 1. Submit Master Ticket
    const masterRes = await postGrievance({
      studentRegNo: masterRegNo,
      studentName: masterName,
      studentEmail: masterEmail,
      studentPhone: masterPhone,
      studentType: 'hosteller',
      hostelBlock: 'Block C',
      roomNo: 'C-101',
      category: 'Electrical & AC',
      description: 'Hostel Block C Room C-101 AC compressor unit rattling and smoking',
      priority: 'urgent',
      locationTag: 'Hostel Block C, Floor 1, Room C-101',
    });
    assert.strictEqual(masterRes.status, 201);
    const masterTicket = masterRes.data;

    // Set public master notes
    await fetch(`${serverBaseUrl}/api/grievances/${masterTicket.id}/master-notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicMasterNotes: 'HVAC technician dispatched to isolate unit C-101.' }),
    });

    // 2. Submit Child Ticket (merged)
    const childRes = await postGrievance({
      studentRegNo: childRegNo,
      studentName: childName,
      studentEmail: childEmail,
      studentPhone: '8887772222',
      studentType: 'hosteller',
      hostelBlock: 'Block C',
      roomNo: 'C-101',
      category: 'Electrical & AC',
      description: 'Roommate report: Hostel Block C Room C-101 AC compressor unit rattling and smoking',
      priority: 'urgent',
      locationTag: 'Hostel Block C, Floor 1, Room C-101',
    });
    assert.strictEqual(childRes.status, 201);
    assert.strictEqual(childRes.data.status, 'MERGED_AUTOMATIC');

    // 3. Dispatch 50 concurrent queries requesting child's tickets
    const childQueries = Array.from({ length: 50 }, () =>
      fetch(`${serverBaseUrl}/api/grievances?role=student&studentRegNo=${childRegNo}`)
    );

    const childResponses = await Promise.all(childQueries);
    for (const res of childResponses) {
      assert.strictEqual(res.status, 200);
      const tickets = await res.json();
      assert.strictEqual(tickets.length, 1);
      const ticket = tickets[0];

      assert.strictEqual(ticket.studentRegNo, childRegNo);
      assert.strictEqual(ticket.studentName, childName);
      assert.strictEqual(ticket.studentEmail, childEmail);
      assert.strictEqual(ticket.masterTicketNo, masterTicket.ticketNo);
      assert.strictEqual(ticket.publicMasterNotes, 'HVAC technician dispatched to isolate unit C-101.');

      // ZERO PII LEAKAGE CHECK
      const serialized = JSON.stringify(ticket);
      assert.strictEqual(serialized.includes(masterName), false, 'Must NOT leak master name');
      assert.strictEqual(serialized.includes(masterEmail), false, 'Must NOT leak master email');
      assert.strictEqual(serialized.includes(masterPhone), false, 'Must NOT leak master phone');
      assert.strictEqual(serialized.includes(masterRegNo), false, 'Must NOT leak master regNo');
    }
  });

});
