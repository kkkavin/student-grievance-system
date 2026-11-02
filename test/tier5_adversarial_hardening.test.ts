import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEmbeddingVector,
  computeCosineSimilarity,
  runTwoStageDeduplication,
  checkLocationAdjacency,
  AUTO_MERGE_THRESHOLD,
  SUSPECTED_DUPLICATE_THRESHOLD,
  VECTOR_DIMENSION,
  MatchCandidate,
} from '../src/ml/deduplication.ts';
import {
  getDatabase,
  createGrievance,
  getGrievanceById,
  getCandidatesForDeduplication,
  withTransaction,
  getChildGrievances,
  updateGrievance,
} from '../db.ts';

/**
 * TIER 5 ADVERSARIAL COVERAGE HARDENING SUITE
 * Milestone 4 Empirical Challenge & Stress Harness
 * 
 * Target Dimensions:
 * 1. Extreme Mathematical Boundary Scores (0.919 vs 0.920, 0.799 vs 0.800, sub-milli precision)
 * 2. 24h-72h Rolling Window Cutoff (71h vs 73h, sub-minute accuracy, SQL & In-Memory)
 * 3. Multi-Master Graph Cycles & Loop Resistance (chain prevention, auto-merge inheritance, cycle defense)
 * 4. Unicode, Emoji, and Special Character Sanitization (zero-width, RTL, emojis, XSS/SQL payloads, international text)
 * 5. Sustained High-Load Vector Similarity Benchmark (500 candidates, 500 queries, sustained P95 < 50ms)
 */

describe('Tier 5 Hardening 1: Extreme Boundary Scores (0.919 vs 0.920, 0.799 vs 0.800)', () => {

  test('TC-BND-01: Similarity 0.91900 must strictly yield SUSPECTED_DUPLICATE', () => {
    const vecA = new Array(VECTOR_DIMENSION).fill(0);
    const vecB = new Array(VECTOR_DIMENSION).fill(0);
    vecA[0] = 1.0;
    vecB[0] = 0.919;
    vecB[1] = Math.sqrt(1 - 0.919 * 0.919);

    const sim = computeCosineSimilarity(vecB, vecA);
    assert.strictEqual(sim, 0.919);

    const candidate: MatchCandidate = {
      id: 'cand_919',
      ticketNo: 'T-919',
      category: 'Hostel Maintenance',
      description: 'Candidate for 0.919',
      status: 'PRIMARY',
      createdAt: new Date().toISOString(),
      embeddingVector: vecA,
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: 'Query for 0.919',
        studentType: 'hosteller',
        embeddingVector: vecB,
      },
      [candidate],
    );

    assert.strictEqual(res.action, 'SUSPECTED_DUPLICATE');
    assert.strictEqual(res.status, 'SUSPECTED_DUPLICATE');
    assert.strictEqual(res.similarityScore, 0.919);
    assert.strictEqual(res.masterCaseId, 'cand_919');
    assert.notStrictEqual(res.action, 'AUTO_MERGE');
  });

  test('TC-BND-02: Similarity 0.91940 must strictly yield SUSPECTED_DUPLICATE (< 0.920 cutoff)', () => {
    const vecA = new Array(VECTOR_DIMENSION).fill(0);
    const vecB = new Array(VECTOR_DIMENSION).fill(0);
    vecA[0] = 1.0;
    vecB[0] = 0.9194;
    vecB[1] = Math.sqrt(1 - 0.9194 * 0.9194);

    const sim = computeCosineSimilarity(vecB, vecA);
    assert.strictEqual(sim, 0.9194);
    assert.ok(sim < AUTO_MERGE_THRESHOLD, `Sim ${sim} must be < 0.92`);

    const candidate: MatchCandidate = {
      id: 'cand_9194',
      ticketNo: 'T-9194',
      category: 'Hostel Maintenance',
      description: 'Candidate for 0.9194',
      status: 'PRIMARY',
      createdAt: new Date().toISOString(),
      embeddingVector: vecA,
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: 'Query for 0.9194',
        studentType: 'hosteller',
        embeddingVector: vecB,
      },
      [candidate],
    );

    assert.strictEqual(res.action, 'SUSPECTED_DUPLICATE');
    assert.strictEqual(res.status, 'SUSPECTED_DUPLICATE');
    assert.strictEqual(res.similarityScore, 0.9194);
    assert.notStrictEqual(res.action, 'AUTO_MERGE');
  });

  test('TC-BND-03: Similarity 0.92000 must strictly trigger AUTO_MERGE', () => {
    const vecA = new Array(VECTOR_DIMENSION).fill(0);
    const vecB = new Array(VECTOR_DIMENSION).fill(0);
    vecA[0] = 1.0;
    vecB[0] = 0.920;
    vecB[1] = Math.sqrt(1 - 0.920 * 0.920);

    const sim = computeCosineSimilarity(vecB, vecA);
    assert.strictEqual(sim, 0.92);

    const candidate: MatchCandidate = {
      id: 'cand_920',
      ticketNo: 'T-920',
      category: 'Hostel Maintenance',
      description: 'Candidate for 0.920',
      status: 'PRIMARY',
      createdAt: new Date().toISOString(),
      embeddingVector: vecA,
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: 'Query for 0.920',
        studentType: 'hosteller',
        embeddingVector: vecB,
      },
      [candidate],
    );

    assert.strictEqual(res.action, 'AUTO_MERGE');
    assert.strictEqual(res.status, 'MERGED_AUTOMATIC');
    assert.strictEqual(res.similarityScore, 0.92);
    assert.strictEqual(res.masterCaseId, 'cand_920');
  });

  test('TC-BND-04: Similarity 0.79900 must strictly yield PRIMARY (independent ticket)', () => {
    const vecA = new Array(VECTOR_DIMENSION).fill(0);
    const vecB = new Array(VECTOR_DIMENSION).fill(0);
    vecA[0] = 1.0;
    vecB[0] = 0.799;
    vecB[1] = Math.sqrt(1 - 0.799 * 0.799);

    const sim = computeCosineSimilarity(vecB, vecA);
    assert.strictEqual(sim, 0.799);

    const candidate: MatchCandidate = {
      id: 'cand_799',
      ticketNo: 'T-799',
      category: 'Electrical & AC',
      description: 'Candidate for 0.799',
      status: 'PRIMARY',
      createdAt: new Date().toISOString(),
      embeddingVector: vecA,
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Electrical & AC',
        description: 'Query for 0.799',
        studentType: 'dayscholar',
        embeddingVector: vecB,
      },
      [candidate],
    );

    assert.strictEqual(res.action, 'PRIMARY');
    assert.strictEqual(res.status, 'PRIMARY');
    assert.strictEqual(res.masterCaseId, null);
    assert.notStrictEqual(res.action, 'SUSPECTED_DUPLICATE');
  });

  test('TC-BND-05: Similarity 0.80000 must strictly trigger SUSPECTED_DUPLICATE for triage', () => {
    const vecA = new Array(VECTOR_DIMENSION).fill(0);
    const vecB = new Array(VECTOR_DIMENSION).fill(0);
    vecA[0] = 1.0;
    vecB[0] = 0.800;
    vecB[1] = Math.sqrt(1 - 0.800 * 0.800);

    const sim = computeCosineSimilarity(vecB, vecA);
    assert.strictEqual(sim, 0.8);

    const candidate: MatchCandidate = {
      id: 'cand_800',
      ticketNo: 'T-800',
      category: 'Electrical & AC',
      description: 'Candidate for 0.800',
      status: 'PRIMARY',
      createdAt: new Date().toISOString(),
      embeddingVector: vecA,
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Electrical & AC',
        description: 'Query for 0.800',
        studentType: 'dayscholar',
        embeddingVector: vecB,
      },
      [candidate],
    );

    assert.strictEqual(res.action, 'SUSPECTED_DUPLICATE');
    assert.strictEqual(res.status, 'SUSPECTED_DUPLICATE');
    assert.strictEqual(res.similarityScore, 0.8);
    assert.strictEqual(res.masterCaseId, 'cand_800');
  });
});

describe('Tier 5 Hardening 2: 24h-72h Rolling Window Cutoff (71h vs 73h)', () => {
  const baseDesc = 'Water leakage from corridor ceiling onto electrical distribution box';

  test('TC-WIN-01: In-memory stage 1 includes candidate at 71.0 hours ago', () => {
    const time71h = new Date(Date.now() - 71 * 3600 * 1000).toISOString();
    const cand: MatchCandidate = {
      id: 'cand_win_71h',
      ticketNo: 'T-WIN-71',
      category: 'Hostel Maintenance',
      description: baseDesc,
      status: 'PRIMARY',
      createdAt: time71h,
      embeddingVector: generateEmbeddingVector(baseDesc, ['Hostel Maintenance']),
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: baseDesc,
        studentType: 'hosteller',
      },
      [cand],
    );
    assert.strictEqual(res.action, 'AUTO_MERGE', 'Candidate at 71h must be included and merged');
  });

  test('TC-WIN-02: In-memory stage 1 includes candidate at 71h 55m (71.916h ago)', () => {
    const time71_9h = new Date(Date.now() - (71 * 3600 * 1000 + 55 * 60 * 1000)).toISOString();
    const cand: MatchCandidate = {
      id: 'cand_win_71_9h',
      ticketNo: 'T-WIN-71-9',
      category: 'Hostel Maintenance',
      description: baseDesc,
      status: 'PRIMARY',
      createdAt: time71_9h,
      embeddingVector: generateEmbeddingVector(baseDesc, ['Hostel Maintenance']),
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: baseDesc,
        studentType: 'hosteller',
      },
      [cand],
    );
    assert.strictEqual(res.action, 'AUTO_MERGE', 'Candidate at 71h55m must be included and merged');
  });

  test('TC-WIN-03: In-memory stage 1 strictly excludes candidate at 72.05h (72h 3m ago)', () => {
    const time72_05h = new Date(Date.now() - (72 * 3600 * 1000 + 3 * 60 * 1000)).toISOString();
    const cand: MatchCandidate = {
      id: 'cand_win_72_05h',
      ticketNo: 'T-WIN-72-05',
      category: 'Hostel Maintenance',
      description: baseDesc,
      status: 'PRIMARY',
      createdAt: time72_05h,
      embeddingVector: generateEmbeddingVector(baseDesc, ['Hostel Maintenance']),
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: baseDesc,
        studentType: 'hosteller',
      },
      [cand],
    );
    assert.strictEqual(res.action, 'PRIMARY', 'Candidate beyond 72h window must be excluded');
  });

  test('TC-WIN-04: In-memory stage 1 strictly excludes candidate at 73.0 hours ago', () => {
    const time73h = new Date(Date.now() - 73 * 3600 * 1000).toISOString();
    const cand: MatchCandidate = {
      id: 'cand_win_73h',
      ticketNo: 'T-WIN-73',
      category: 'Hostel Maintenance',
      description: baseDesc,
      status: 'PRIMARY',
      createdAt: time73h,
      embeddingVector: generateEmbeddingVector(baseDesc, ['Hostel Maintenance']),
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: baseDesc,
        studentType: 'hosteller',
      },
      [cand],
    );
    assert.strictEqual(res.action, 'PRIMARY', 'Candidate at 73h must be excluded');
  });

  test('TC-WIN-05: Database SQL query getCandidatesForDeduplication correctly applies datetime() cutoff', () => {
    const db = getDatabase();
    const uniqueCat = `Cat_Window_${Date.now()}`;
    const time71h = new Date(Date.now() - 71 * 3600 * 1000).toISOString();
    const time73h = new Date(Date.now() - 73 * 3600 * 1000).toISOString();

    const t71 = createGrievance({
      studentRegNo: 'WIN_71',
      category: uniqueCat,
      description: 'Issue 71 hours ago',
      createdAt: time71h,
    });

    const t73 = createGrievance({
      studentRegNo: 'WIN_73',
      category: uniqueCat,
      description: 'Issue 73 hours ago',
      createdAt: time73h,
    });

    try {
      const candidates = getCandidatesForDeduplication(uniqueCat, 72);
      const ids = candidates.map((c) => c.id);
      assert.ok(ids.includes(t71.id), 'Candidate from 71h ago must be returned by SQL query');
      assert.ok(!ids.includes(t73.id), 'Candidate from 73h ago must NOT be returned by SQL query');
    } finally {
      db.prepare('DELETE FROM grievances WHERE category = ?').run(uniqueCat);
    }
  });
});

describe('Tier 5 Hardening 3: Multi-Master Graph Cycles & Loop Resistance', () => {

  test('TC-CYC-01: Auto-merge dedup inherits root master ID when candidate is linked to a master', () => {
    const rootMasterId = 'ROOT_MASTER_100';
    const childCandidate: MatchCandidate = {
      id: 'CHILD_101',
      ticketNo: 'GRV-CHILD-101',
      category: 'Bus & Transport',
      description: 'Route 8 bus engine overheating and broken down',
      status: 'SUSPECTED_DUPLICATE',
      masterCaseId: rootMasterId,
      createdAt: new Date().toISOString(),
      embeddingVector: generateEmbeddingVector('Route 8 bus engine overheating and broken down', ['Bus & Transport']),
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Bus & Transport',
        description: 'Route 8 bus engine overheating and broken down',
        studentType: 'dayscholar',
      },
      [childCandidate],
    );

    assert.strictEqual(res.action, 'AUTO_MERGE');
    assert.strictEqual(
      res.masterCaseId,
      rootMasterId,
      'Must inherit root master ID (ROOT_MASTER_100), never the child candidate ID (CHILD_101)',
    );
  });

  test('TC-CYC-02: MERGED_AUTOMATIC tickets are strictly filtered from candidate pool (prevents multi-level tree creation)', () => {
    const desc = 'Hostel Block B room 202 water pipe leaking heavily';
    const mergedChild: MatchCandidate = {
      id: 'AUTO_CHILD_200',
      ticketNo: 'GRV-CHILD-200',
      category: 'Hostel Maintenance',
      hostelBlock: 'Block B',
      roomNo: '202',
      description: desc,
      status: 'MERGED_AUTOMATIC',
      masterCaseId: 'MASTER_300',
      createdAt: new Date().toISOString(),
      embeddingVector: generateEmbeddingVector(desc, ['Hostel Maintenance']),
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        hostelBlock: 'Block B',
        roomNo: '202',
        description: desc,
        studentType: 'hosteller',
      },
      [mergedChild],
    );

    assert.strictEqual(
      res.action,
      'PRIMARY',
      'MERGED_AUTOMATIC ticket must be excluded from candidate pool; new complaint becomes PRIMARY if no active master exists',
    );
    assert.strictEqual(res.masterCaseId, null);
  });

  test('TC-CYC-03: Cycle resistance in database - self-referencing check and acyclic invariant', () => {
    const db = getDatabase();
    const testTicket = createGrievance({
      studentRegNo: 'CYC_SELF_01',
      category: 'Network & Wi-Fi',
      description: 'Wi-Fi AP controller restart loop in CS block',
      status: 'PRIMARY',
    });

    try {
      // In SQLite schema: master_case_id REFERENCES grievances(id)
      // When a ticket is PRIMARY, master_case_id must be null
      const fresh = getGrievanceById(testTicket.id)!;
      assert.strictEqual(fresh.masterCaseId, null);

      // Verify that getChildGrievances on this ticket returns empty array initially
      const directChildren = getChildGrievances(testTicket.id);
      assert.strictEqual(directChildren.length, 0);

      // If a child is created pointing to testTicket:
      const child = createGrievance({
        studentRegNo: 'CYC_CHILD_01',
        category: 'Network & Wi-Fi',
        description: 'Wi-Fi AP controller restart loop in CS block',
        status: 'MERGED_AUTOMATIC',
        masterCaseId: testTicket.id,
      });

      const childrenAfter = getChildGrievances(testTicket.id);
      assert.strictEqual(childrenAfter.length, 1);
      assert.strictEqual(childrenAfter[0].id, child.id);

      // Verify child ticket's children query is empty (no infinite expansion)
      const childsChildren = getChildGrievances(child.id);
      assert.strictEqual(childsChildren.length, 0);
    } finally {
      db.prepare("DELETE FROM grievances WHERE studentRegNo LIKE 'CYC_%'").run();
    }
  });

  test('TC-CYC-04: Transitive traversal cannot form infinite loops', () => {
    // Model a directed acyclic graph: Master -> Child1, Child2
    const db = getDatabase();
    const master = createGrievance({
      studentRegNo: 'DAG_M_01',
      category: 'Food & Mess',
      description: 'Cold and uncooked food in hostel mess',
      status: 'PRIMARY',
    });

    const c1 = createGrievance({
      studentRegNo: 'DAG_C_01',
      category: 'Food & Mess',
      description: 'Cold uncooked food in hostel mess',
      status: 'MERGED_AUTOMATIC',
      masterCaseId: master.id,
    });

    const c2 = createGrievance({
      studentRegNo: 'DAG_C_02',
      category: 'Food & Mess',
      description: 'Cold uncooked food in hostel mess',
      status: 'MERGED_AUTOMATIC',
      masterCaseId: master.id,
    });

    try {
      // BFS / DFS cycle detection oracle
      const visited = new Set<string>();
      const queue = [master.id];
      let iterations = 0;
      const MAX_ITERATIONS = 100;

      while (queue.length > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        const curr = queue.shift()!;
        assert.ok(!visited.has(curr), `Graph cycle detected at node ${curr}!`);
        visited.add(curr);

        const children = getChildGrievances(curr);
        for (const ch of children) {
          queue.push(ch.id);
        }
      }

      assert.strictEqual(visited.size, 3, 'Master and two children must be visited exactly once');
      assert.ok(iterations < MAX_ITERATIONS, 'Traversal terminated cleanly without cycle');
    } finally {
      db.prepare("DELETE FROM grievances WHERE studentRegNo LIKE 'DAG_%'").run();
    }
  });
});

describe('Tier 5 Hardening 4: Unicode, Emoji, and Special Character Sanitization', () => {

  test('TC-UNI-01: Emoji and Symbol payloads extract domain keywords without crashing or NaN', () => {
    const text = '🚨🔥 WATER LEAK! 🚰 Washroom pipe broken & overflowing in room A-204 😭⚡💥';
    const vec = generateEmbeddingVector(text, ['Hostel Maintenance']);
    assert.strictEqual(vec.length, VECTOR_DIMENSION);

    for (let i = 0; i < vec.length; i++) {
      assert.strictEqual(isNaN(vec[i]), false, `Vector element ${i} must not be NaN`);
      assert.strictEqual(isFinite(vec[i]), true, `Vector element ${i} must be finite`);
    }

    // Must match with clean text having similar domain terms
    const cleanText = 'Water leak in washroom pipe broken and overflowing';
    const cleanVec = generateEmbeddingVector(cleanText, ['Hostel Maintenance']);
    const sim = computeCosineSimilarity(vec, cleanVec);
    assert.ok(sim > 0.85, `Similarity ${sim} between emoji text and clean text must be high (>0.85)`);
  });

  test('TC-UNI-02: Zero-width, BOM, and whitespace control characters are stripped safely', () => {
    const zeroWidthText = '\uFEFF\u200B\u200C\u200D\u2060Air conditioner compressor tripping circuit breaker\u200B\uFEFF';
    const normalText = 'Air conditioner compressor tripping circuit breaker';

    const vecZW = generateEmbeddingVector(zeroWidthText, ['Electrical & AC']);
    const vecNorm = generateEmbeddingVector(normalText, ['Electrical & AC']);

    const sim = computeCosineSimilarity(vecZW, vecNorm);
    assert.ok(sim >= 0.99, `Similarity with zero-width characters stripped must be near 1.0 (got ${sim})`);
  });

  test('TC-UNI-03: SQL Injection and XSS attack strings do not cause syntax errors or vector corruption', () => {
    const sqlText = `'; DROP TABLE grievances; SELECT * FROM users WHERE '1'='1 -- <script>alert("xss")</script>`;
    const vec = generateEmbeddingVector(sqlText, ['Hostel Maintenance']);
    assert.strictEqual(vec.length, VECTOR_DIMENSION);

    // Save and retrieve from SQLite database to confirm query parameters are parameterized
    const db = getDatabase();
    const g = createGrievance({
      studentRegNo: 'SQLI_TEST_01',
      category: 'Hostel Maintenance',
      description: sqlText,
    });

    try {
      const retrieved = getGrievanceById(g.id);
      assert.ok(retrieved, 'Grievance with SQL payload must be safely retrieved');
      assert.strictEqual(retrieved!.description, sqlText);

      // Verify table still exists and integrity check passes
      const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      assert.strictEqual(integrity.integrity_check, 'ok');
    } finally {
      db.prepare("DELETE FROM grievances WHERE studentRegNo = 'SQLI_TEST_01'").run();
    }
  });

  test('TC-UNI-04: Multilingual and accented Unicode strings process cleanly', () => {
    const texts = [
      'Cafétéria géyser résolu ñ ç ü 101',
      'कमरे में पानी टपक रहा है washroom pipe leak',
      '部屋のエアコンが壊れている air conditioner ac broken',
    ];

    for (const t of texts) {
      const vec = generateEmbeddingVector(t);
      assert.strictEqual(vec.length, VECTOR_DIMENSION);
      for (const val of vec) {
        assert.ok(!isNaN(val), 'Vector value must not be NaN');
      }
    }
  });

  test('TC-UNI-05: Cosine similarity never divides by zero on completely empty or non-matching inputs', () => {
    const zeroVec1 = generateEmbeddingVector('');
    const zeroVec2 = generateEmbeddingVector('   \t\n   ');
    const normalVec = generateEmbeddingVector('Normal hostel complaint');

    const sim00 = computeCosineSimilarity(zeroVec1, zeroVec2);
    assert.strictEqual(sim00, 0.0, 'Zero vector vs zero vector must yield 0.0, not NaN');

    const sim01 = computeCosineSimilarity(zeroVec1, normalVec);
    assert.strictEqual(sim01, 0.0, 'Zero vector vs normal vector must yield 0.0, not NaN');
  });
});

describe('Tier 5 Hardening 5: Sustained High-Load Vector Similarity Benchmark', () => {

  test('TC-BM-SUSTAINED: 500 queries across 500 candidate vectors strictly satisfies P95 < 50ms', () => {
    // Generate 500 distinct candidate vectors
    const CANDIDATE_COUNT = 500;
    const QUERY_COUNT = 500;

    const candidatePool: Array<{ id: string; vector: number[] }> = [];
    const sampleWords = [
      'plumbing', 'pipe', 'leak', 'drain', 'water', 'tap', 'washroom', 'flush',
      'geyser', 'heating', 'electrical', 'wire', 'spark', 'fan', 'ac', 'switch',
      'socket', 'light', 'bulb', 'breaker', 'wifi', 'internet', 'router', 'network',
      'signal', 'speed', 'controller', 'bus', 'route', 'delay', 'engine', 'tire',
      'food', 'mess', 'dinner', 'lunch', 'uncooked', 'canteen', 'cleaning', 'waste',
    ];

    for (let i = 0; i < CANDIDATE_COUNT; i++) {
      const word1 = sampleWords[i % sampleWords.length];
      const word2 = sampleWords[(i * 3 + 1) % sampleWords.length];
      const word3 = sampleWords[(i * 7 + 2) % sampleWords.length];
      const text = `${word1} issue in hostel block ${word2} causing ${word3}`;
      candidatePool.push({
        id: `cand_${i}`,
        vector: generateEmbeddingVector(text),
      });
    }

    // Generate 500 queries
    const queries: number[][] = [];
    for (let j = 0; j < QUERY_COUNT; j++) {
      const w1 = sampleWords[(j * 2) % sampleWords.length];
      const w2 = sampleWords[(j * 5 + 3) % sampleWords.length];
      queries.push(generateEmbeddingVector(`Urgent ${w1} problem reported with ${w2}`));
    }

    // Execute sustained query benchmark with performance.now()
    const latencies: number[] = [];
    const startOverall = performance.now();

    for (let q = 0; q < QUERY_COUNT; q++) {
      const qVec = queries[q];
      const t0 = performance.now();

      let topScore = -1;
      let topMatch: string | null = null;

      for (let c = 0; c < CANDIDATE_COUNT; c++) {
        const score = computeCosineSimilarity(qVec, candidatePool[c].vector);
        if (score > topScore) {
          topScore = score;
          topMatch = candidatePool[c].id;
        }
      }

      const t1 = performance.now();
      latencies.push(t1 - t0);
    }

    const totalDuration = performance.now() - startOverall;

    latencies.sort((a, b) => a - b);
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const mean = latencies.reduce((sum, v) => sum + v, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p90 = latencies[Math.floor(latencies.length * 0.90)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const throughput = (QUERY_COUNT / (totalDuration / 1000)).toFixed(1);

    console.log('\n--- ⚡ SUSTAINED LOAD BENCHMARK RESULTS (500 Queries x 500 Candidates) ---');
    console.log(`Total Search Operations: ${(QUERY_COUNT * CANDIDATE_COUNT).toLocaleString()} dot-products`);
    console.log(`Total Wall Clock Time  : ${totalDuration.toFixed(2)} ms`);
    console.log(`Min Latency            : ${min.toFixed(4)} ms`);
    console.log(`Mean Latency           : ${mean.toFixed(4)} ms`);
    console.log(`P50 Latency            : ${p50.toFixed(4)} ms`);
    console.log(`P90 Latency            : ${p90.toFixed(4)} ms`);
    console.log(`P95 Latency            : ${p95.toFixed(4)} ms (SLA: < 50.00 ms)`);
    console.log(`P99 Latency            : ${p99.toFixed(4)} ms`);
    console.log(`Max Latency            : ${max.toFixed(4)} ms`);
    console.log(`Throughput             : ${throughput} queries/sec`);

    // Hard SLAs
    assert.ok(
      p95 < 50.0,
      `P95 latency must be strictly < 50.0ms under sustained load, got ${p95.toFixed(4)}ms`,
    );
    assert.ok(
      mean < 15.0,
      `Mean search latency must be < 15.0ms, got ${mean.toFixed(4)}ms`,
    );
    assert.ok(
      latencies.length === QUERY_COUNT,
      `All ${QUERY_COUNT} queries must finish successfully`,
    );
  });
});
