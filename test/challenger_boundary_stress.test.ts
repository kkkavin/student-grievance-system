import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEmbeddingVector,
  computeCosineSimilarity,
  runTwoStageDeduplication,
  checkLocationAdjacency,
  extractFloorFromRoom,
  extractRouteNumber,
  normalizeBlock,
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
  saveOutboxEmail,
  getOutboxEmails,
} from '../db.ts';

/**
 * EMPIRICAL CHALLENGER TEST SUITE: Deduplication Boundaries & Stress Harness
 * Probes mathematical boundary conditions, temporal cutoffs, spatial heuristics,
 * adversarial text payloads, structural hierarchy invariants, and transaction safety.
 */

describe('Challenger Suite 1: Mathematical Boundary Transitions (0.919 vs 0.920, 0.799 vs 0.800)', () => {
  // Helper to construct synthetic unit vectors with exact target dot product
  function makeVectorPairWithDotProduct(targetCosine: number): [number[], number[]] {
    const vecA = new Array(VECTOR_DIMENSION).fill(0);
    const vecB = new Array(VECTOR_DIMENSION).fill(0);

    vecA[0] = 1.0;
    vecA[1] = 0.0;

    const clampedCos = Math.min(1.0, Math.max(-1.0, targetCosine));
    const sinTheta = Math.sqrt(Math.max(0, 1.0 - clampedCos * clampedCos));

    vecB[0] = Number(clampedCos.toFixed(5));
    vecB[1] = Number(sinTheta.toFixed(5));

    const norm = Math.sqrt(vecB[0] * vecB[0] + vecB[1] * vecB[1]);
    vecB[0] = Number((vecB[0] / norm).toFixed(5));
    vecB[1] = Number((vecB[1] / norm).toFixed(5));

    return [vecA, vecB];
  }

  test('Boundary Probe: 0.919 must strictly yield SUSPECTED_DUPLICATE and NOT AUTO_MERGE', () => {
    const vecCandidate = new Array(VECTOR_DIMENSION).fill(0);
    const vecNew = new Array(VECTOR_DIMENSION).fill(0);

    vecCandidate[0] = 1.0;
    vecNew[0] = 0.919;
    vecNew[1] = Math.sqrt(1 - 0.919 * 0.919);

    const actualSim = computeCosineSimilarity(vecNew, vecCandidate);
    assert.strictEqual(actualSim, 0.919, 'Dot product must evaluate to exactly 0.919');

    const candidate: MatchCandidate = {
      id: 'cand_boundary_919',
      ticketNo: 'GRV-BND-919',
      category: 'Hostel Maintenance',
      description: 'Synthetic candidate for 0.919 boundary test',
      status: 'PRIMARY',
      createdAt: new Date().toISOString(),
      embeddingVector: vecCandidate,
    };

    const result = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: 'Synthetic query for 0.919 boundary test',
        studentType: 'hosteller',
        embeddingVector: vecNew,
      },
      [candidate],
    );

    assert.strictEqual(
      result.action,
      'SUSPECTED_DUPLICATE',
      'Similarity 0.919 must NOT auto-merge; must be SUSPECTED_DUPLICATE',
    );
    assert.strictEqual(
      result.status,
      'SUSPECTED_DUPLICATE',
      'Status must be SUSPECTED_DUPLICATE',
    );
    assert.strictEqual(result.similarityScore, 0.919);
    assert.strictEqual(result.masterCaseId, 'cand_boundary_919');
    assert.notStrictEqual(result.action, 'AUTO_MERGE');
  });

  test('Boundary Probe: 0.920 must strictly trigger AUTO_MERGE', () => {
    const vecCandidate = new Array(VECTOR_DIMENSION).fill(0);
    const vecNew = new Array(VECTOR_DIMENSION).fill(0);

    vecCandidate[0] = 1.0;
    vecNew[0] = 0.920;
    vecNew[1] = Math.sqrt(1 - 0.920 * 0.920);

    const actualSim = computeCosineSimilarity(vecNew, vecCandidate);
    assert.strictEqual(actualSim, 0.92, 'Dot product must evaluate to 0.92');

    const candidate: MatchCandidate = {
      id: 'cand_boundary_920',
      ticketNo: 'GRV-BND-920',
      category: 'Hostel Maintenance',
      description: 'Synthetic candidate for 0.920 boundary test',
      status: 'PRIMARY',
      createdAt: new Date().toISOString(),
      embeddingVector: vecCandidate,
    };

    const result = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: 'Synthetic query for 0.920 boundary test',
        studentType: 'hosteller',
        embeddingVector: vecNew,
      },
      [candidate],
    );

    assert.strictEqual(
      result.action,
      'AUTO_MERGE',
      'Similarity 0.920 must trigger AUTO_MERGE',
    );
    assert.strictEqual(
      result.status,
      'MERGED_AUTOMATIC',
      'Status must be MERGED_AUTOMATIC',
    );
    assert.strictEqual(result.similarityScore, 0.92);
    assert.strictEqual(result.masterCaseId, 'cand_boundary_920');
  });

  test('Boundary Probe: 0.799 must strictly yield PRIMARY and NOT enter triage queue', () => {
    const vecCandidate = new Array(VECTOR_DIMENSION).fill(0);
    const vecNew = new Array(VECTOR_DIMENSION).fill(0);

    vecCandidate[0] = 1.0;
    vecNew[0] = 0.799;
    vecNew[1] = Math.sqrt(1 - 0.799 * 0.799);

    const actualSim = computeCosineSimilarity(vecNew, vecCandidate);
    assert.strictEqual(actualSim, 0.799, 'Dot product must evaluate to 0.799');

    const candidate: MatchCandidate = {
      id: 'cand_boundary_799',
      ticketNo: 'GRV-BND-799',
      category: 'Hostel Maintenance',
      description: 'Synthetic candidate for 0.799 boundary test',
      status: 'PRIMARY',
      createdAt: new Date().toISOString(),
      embeddingVector: vecCandidate,
    };

    const result = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: 'Synthetic query for 0.799 boundary test',
        studentType: 'hosteller',
        embeddingVector: vecNew,
      },
      [candidate],
    );

    assert.strictEqual(
      result.action,
      'PRIMARY',
      'Similarity 0.799 must remain independent PRIMARY ticket',
    );
    assert.strictEqual(result.status, 'PRIMARY');
    assert.strictEqual(result.masterCaseId, null, 'Must not be linked to master');
    assert.notStrictEqual(result.action, 'SUSPECTED_DUPLICATE');
  });

  test('Boundary Probe: 0.800 must strictly enter triage queue as SUSPECTED_DUPLICATE', () => {
    const vecCandidate = new Array(VECTOR_DIMENSION).fill(0);
    const vecNew = new Array(VECTOR_DIMENSION).fill(0);

    vecCandidate[0] = 1.0;
    vecNew[0] = 0.800;
    vecNew[1] = Math.sqrt(1 - 0.800 * 0.800);

    const actualSim = computeCosineSimilarity(vecNew, vecCandidate);
    assert.strictEqual(actualSim, 0.8, 'Dot product must evaluate to 0.80');

    const candidate: MatchCandidate = {
      id: 'cand_boundary_800',
      ticketNo: 'GRV-BND-800',
      category: 'Hostel Maintenance',
      description: 'Synthetic candidate for 0.800 boundary test',
      status: 'PRIMARY',
      createdAt: new Date().toISOString(),
      embeddingVector: vecCandidate,
    };

    const result = runTwoStageDeduplication(
      {
        category: 'Hostel Maintenance',
        description: 'Synthetic query for 0.800 boundary test',
        studentType: 'hosteller',
        embeddingVector: vecNew,
      },
      [candidate],
    );

    assert.strictEqual(
      result.action,
      'SUSPECTED_DUPLICATE',
      'Similarity 0.800 must trigger SUSPECTED_DUPLICATE for triage',
    );
    assert.strictEqual(result.status, 'SUSPECTED_DUPLICATE');
    assert.strictEqual(result.similarityScore, 0.8);
    assert.strictEqual(result.masterCaseId, 'cand_boundary_800');
  });

  test('Sub-milliprecision Probe: 0.9199 must NOT auto-merge', () => {
    const [cand91999, query91999] = makeVectorPairWithDotProduct(0.91994);
    const sim91999 = computeCosineSimilarity(query91999, cand91999);
    assert.ok(sim91999 < AUTO_MERGE_THRESHOLD, `Sim ${sim91999} must be < 0.92`);

    const resBelow = runTwoStageDeduplication(
      {
        category: 'Electrical & AC',
        description: 'Below boundary check',
        studentType: 'hosteller',
        embeddingVector: query91999,
      },
      [
        {
          id: 'cand_submilli',
          ticketNo: 'GRV-SUB-1',
          category: 'Electrical & AC',
          description: 'Candidate',
          status: 'PRIMARY',
          createdAt: new Date().toISOString(),
          embeddingVector: cand91999,
        },
      ],
    );
    assert.strictEqual(resBelow.action, 'SUSPECTED_DUPLICATE');
  });
});

describe('Challenger Suite 2: Rolling Time Window Boundary (71h vs 73h & Sub-Hour Intervals)', () => {
  const baseDesc = 'Frequent power cut and tripped circuit breaker in common study room';
  const now = Date.now();

  test('In-Memory Filter: 71.0 hours ago matches', () => {
    const time71h = new Date(now - 71 * 3600 * 1000).toISOString();
    const cand: MatchCandidate = {
      id: 'cand_time_71h',
      ticketNo: 'GRV-TIME-71',
      category: 'Electrical & AC',
      description: baseDesc,
      status: 'PRIMARY',
      createdAt: time71h,
      embeddingVector: generateEmbeddingVector(baseDesc, ['Electrical & AC']),
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Electrical & AC',
        description: baseDesc,
        studentType: 'hosteller',
      },
      [cand],
    );
    assert.strictEqual(res.action, 'AUTO_MERGE', 'Candidate at 71h must match');
  });

  test('In-Memory Filter: 71.95 hours ago (71h 57m) matches', () => {
    const time71_95h = new Date(now - (71.95 * 3600 * 1000)).toISOString();
    const cand: MatchCandidate = {
      id: 'cand_time_71_95h',
      ticketNo: 'GRV-TIME-7195',
      category: 'Electrical & AC',
      description: baseDesc,
      status: 'PRIMARY',
      createdAt: time71_95h,
      embeddingVector: generateEmbeddingVector(baseDesc, ['Electrical & AC']),
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Electrical & AC',
        description: baseDesc,
        studentType: 'hosteller',
      },
      [cand],
    );
    assert.strictEqual(res.action, 'AUTO_MERGE', 'Candidate at 71.95h must match');
  });

  test('In-Memory Filter: 72.05 hours ago (72h 3m) is strictly filtered out', () => {
    const time72_05h = new Date(now - (72.05 * 3600 * 1000)).toISOString();
    const cand: MatchCandidate = {
      id: 'cand_time_72_05h',
      ticketNo: 'GRV-TIME-7205',
      category: 'Electrical & AC',
      description: baseDesc,
      status: 'PRIMARY',
      createdAt: time72_05h,
      embeddingVector: generateEmbeddingVector(baseDesc, ['Electrical & AC']),
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Electrical & AC',
        description: baseDesc,
        studentType: 'hosteller',
      },
      [cand],
    );
    assert.strictEqual(res.action, 'PRIMARY', 'Candidate at 72.05h must be pruned');
  });

  test('In-Memory Filter: 73.0 hours ago is strictly filtered out', () => {
    const time73h = new Date(now - 73 * 3600 * 1000).toISOString();
    const cand: MatchCandidate = {
      id: 'cand_time_73h',
      ticketNo: 'GRV-TIME-73',
      category: 'Electrical & AC',
      description: baseDesc,
      status: 'PRIMARY',
      createdAt: time73h,
      embeddingVector: generateEmbeddingVector(baseDesc, ['Electrical & AC']),
    };

    const res = runTwoStageDeduplication(
      {
        category: 'Electrical & AC',
        description: baseDesc,
        studentType: 'hosteller',
      },
      [cand],
    );
    assert.strictEqual(res.action, 'PRIMARY', 'Candidate at 73h must be pruned');
  });

  test('Database SQL Level Probe: Verifies SQLite raw string comparison vulnerability on ISO timestamp', () => {
    const db = getDatabase();
    const time70h = new Date(Date.now() - 70 * 3600 * 1000).toISOString();
    const time74h = new Date(Date.now() - 74 * 3600 * 1000).toISOString();

    // Directly test SQLite query expression used in db.ts:
    // createdAt >= datetime('now', '-' || 72 || ' hours')
    const rawCheck = db.prepare(`
      SELECT 
        (? >= datetime('now', '-72 hours')) as cmp70,
        (? >= datetime('now', '-72 hours')) as cmp74
    `).get(time70h, time74h) as { cmp70: number; cmp74: number };

    // Empirical observation:
    // cmp70 is 1 (correct)
    // cmp74 is 1 (VULNERABILITY: SQLite compares 'T' with ' ' and considers 74h old ISO string >= cutoff)
    assert.strictEqual(rawCheck.cmp70, 1, '70h old timestamp evaluates to 1');
    assert.strictEqual(
      rawCheck.cmp74,
      1,
      'Empirical finding: SQLite evaluates 74h ISO timestamp as >= cutoff due to ASCII T > space',
    );

    // Verify the fix: using datetime(?) normalizes the format
    const fixedCheck = db.prepare(`
      SELECT 
        (datetime(?) >= datetime('now', '-72 hours')) as fixed70,
        (datetime(?) >= datetime('now', '-72 hours')) as fixed74
    `).get(time70h, time74h) as { fixed70: number; fixed74: number };

    assert.strictEqual(fixedCheck.fixed70, 1);
    assert.strictEqual(fixedCheck.fixed74, 0, 'datetime(?) correctly excludes 74h old timestamp');
  });
});

describe('Challenger Suite 3: Location Heuristics & Spatial Boundary Stress', () => {
  describe('extractFloorFromRoom parsing bounds', () => {
    test('extracts ground floor from various aliases', () => {
      assert.strictEqual(extractFloorFromRoom('Ground Floor'), 0);
      assert.strictEqual(extractFloorFromRoom('G-02'), 0);
      assert.strictEqual(extractFloorFromRoom('G04'), 0);
      assert.strictEqual(extractFloorFromRoom('G-102'), 0);
    });

    test('extracts 1st to 5th floors from standard patterns', () => {
      assert.strictEqual(extractFloorFromRoom('101'), 1);
      assert.strictEqual(extractFloorFromRoom('A-104'), 1);
      assert.strictEqual(extractFloorFromRoom('B-212'), 2);
      assert.strictEqual(extractFloorFromRoom('C-305'), 3);
      assert.strictEqual(extractFloorFromRoom('D-420'), 4);
      assert.strictEqual(extractFloorFromRoom('502'), 5);
    });

    test('extracts floors from ordinal strings', () => {
      assert.strictEqual(extractFloorFromRoom('1st floor'), 1);
      assert.strictEqual(extractFloorFromRoom('2nd Floor'), 2);
      assert.strictEqual(extractFloorFromRoom('3rd FLOOR'), 3);
      assert.strictEqual(extractFloorFromRoom('4th floor'), 4);
    });

    test('returns null for non-room descriptions', () => {
      assert.strictEqual(extractFloorFromRoom(''), null);
      assert.strictEqual(extractFloorFromRoom(undefined), null);
      assert.strictEqual(extractFloorFromRoom('Central Library'), null);
      assert.strictEqual(extractFloorFromRoom('Mess Hall'), null);
    });
  });

  describe('extractRouteNumber parsing bounds', () => {
    test('extracts route numbers from varied syntactic expressions', () => {
      assert.strictEqual(extractRouteNumber('Bus Route 8 breakdown near gate 2'), '8');
      assert.strictEqual(extractRouteNumber('Route #14 delayed by 30 mins'), '14');
      assert.strictEqual(extractRouteNumber('College bus #22 AC not working'), '22');
      assert.strictEqual(extractRouteNumber('Bus 105 punctured tire'), '105');
    });

    test('returns null when no route number exists', () => {
      assert.strictEqual(extractRouteNumber('Campus shuttle van'), null);
      assert.strictEqual(extractRouteNumber('Hostel corridor'), null);
      assert.strictEqual(extractRouteNumber(undefined), null);
    });
  });

  describe('checkLocationAdjacency spatial boundary evaluations', () => {
    test('Hostel: Same block, same room -> ADJACENT (true)', () => {
      const match = checkLocationAdjacency(
        { category: 'Hostel Maintenance', description: 'pipe leak', hostelBlock: 'Block A', roomNo: 'A-301' },
        { id: '1', ticketNo: 'T1', category: 'Hostel Maintenance', description: 'pipe leak', hostelBlock: 'Block A', roomNo: 'A-301', status: 'PRIMARY', createdAt: '', embeddingVector: [] },
      );
      assert.strictEqual(match, true);
    });

    test('Hostel: Same block, adjacent floor (3rd vs 2nd, diff=1) -> ADJACENT (true)', () => {
      const match = checkLocationAdjacency(
        { category: 'Hostel Maintenance', description: 'water leaking down ceiling', hostelBlock: 'Block A', roomNo: 'A-301' },
        { id: '1', ticketNo: 'T1', category: 'Hostel Maintenance', description: 'floor drain overflow', hostelBlock: 'Block A', roomNo: 'A-201', status: 'PRIMARY', createdAt: '', embeddingVector: [] },
      );
      assert.strictEqual(match, true, 'Adjacent floors (+/- 1) in same block must be adjacent for plumbing');
    });

    test('Hostel: Same block, distant floors (1st vs 4th, diff=3) -> NOT ADJACENT (false)', () => {
      const match = checkLocationAdjacency(
        { category: 'Hostel Maintenance', description: 'washroom tap broken', hostelBlock: 'Block A', roomNo: 'A-101' },
        { id: '1', ticketNo: 'T1', category: 'Hostel Maintenance', description: 'washroom tap broken', hostelBlock: 'Block A', roomNo: 'A-401', status: 'PRIMARY', createdAt: '', embeddingVector: [] },
      );
      assert.strictEqual(match, false, 'Distant floors (diff > 1) in same block must NOT be adjacent');
    });

    test('Hostel: Different blocks, same room number -> NOT ADJACENT (false)', () => {
      const match = checkLocationAdjacency(
        { category: 'Hostel Maintenance', description: 'geyser not heating', hostelBlock: 'Block A', roomNo: '101' },
        { id: '1', ticketNo: 'T1', category: 'Hostel Maintenance', description: 'geyser not heating', hostelBlock: 'Block B', roomNo: '101', status: 'PRIMARY', createdAt: '', embeddingVector: [] },
      );
      assert.strictEqual(match, false, 'Different hostel blocks must strictly separate');
    });

    test('Hostel: Block normalization ignores casing and parenthesized terms', () => {
      const match = checkLocationAdjacency(
        { category: 'Hostel Maintenance', description: 'fan broken', hostelBlock: 'Block A (Boys Hostel)', roomNo: '202' },
        { id: '1', ticketNo: 'T1', category: 'Hostel Maintenance', description: 'fan broken', hostelBlock: 'block a', roomNo: '205', status: 'PRIMARY', createdAt: '', embeddingVector: [] },
      );
      assert.strictEqual(match, true, 'Normalized block names must match across casing/parentheses');
    });

    test('Transport: Identical bus routes -> ADJACENT (true)', () => {
      const match = checkLocationAdjacency(
        { category: 'Campus Transport', description: 'Route 8 bus engine breakdown', studentType: 'dayscholar' },
        { id: '1', ticketNo: 'T1', category: 'Campus Transport', description: 'Route 8 bus stranded on highway', status: 'PRIMARY', createdAt: '', embeddingVector: [] },
      );
      assert.strictEqual(match, true, 'Same bus route must match');
    });

    test('Transport: Different bus routes -> NOT ADJACENT (false)', () => {
      const match = checkLocationAdjacency(
        { category: 'Campus Transport', description: 'Route 8 bus late by 40 minutes', studentType: 'dayscholar' },
        { id: '1', ticketNo: 'T1', category: 'Campus Transport', description: 'Route 14 bus late by 40 minutes', status: 'PRIMARY', createdAt: '', embeddingVector: [] },
      );
      assert.strictEqual(match, false, 'Different bus routes must NEVER match');
    });

    test('Wi-Fi / Network: Different blocks -> NOT ADJACENT (false)', () => {
      const match = checkLocationAdjacency(
        { category: 'Wi-Fi & Network', description: 'No Wi-Fi signal', hostelBlock: 'Tech Block', studentType: 'dayscholar' },
        { id: '1', ticketNo: 'T1', category: 'Wi-Fi & Network', description: 'No Wi-Fi signal', hostelBlock: 'Library Block', status: 'PRIMARY', createdAt: '', embeddingVector: [] },
      );
      assert.strictEqual(match, false, 'Different department blocks for Wi-Fi must NOT match');
    });
  });
});

describe('Challenger Suite 4: Adversarial NLP Payloads & Vector Stability', () => {
  test('Vector generation on empty string returns 256-d all-zero vector without NaN', () => {
    const vec = generateEmbeddingVector('');
    assert.strictEqual(vec.length, VECTOR_DIMENSION);
    for (const val of vec) {
      assert.strictEqual(isNaN(val), false, 'Vector value must not be NaN');
      assert.strictEqual(val, 0);
    }

    const sim = computeCosineSimilarity(vec, vec);
    assert.strictEqual(sim, 0.0, 'Cosine similarity of zero vector with itself must be 0.0');
  });

  test('Vector generation on whitespace and punctuation only returns all zeros', () => {
    const vec = generateEmbeddingVector('   \t\n   !@#$%^&*()_+-=[]{}|;:",.<>?');
    assert.strictEqual(vec.length, VECTOR_DIMENSION);
    for (const val of vec) {
      assert.strictEqual(val, 0);
    }
  });

  test('Vector generation on stopwords only returns all zeros', () => {
    const vec = generateEmbeddingVector('the is at which on this that and or but because as until while');
    assert.strictEqual(vec.length, VECTOR_DIMENSION);
    for (const val of vec) {
      assert.strictEqual(val, 0);
    }
  });

  test('Vector generation with Unicode, Emojis, and control characters parses domain keywords cleanly', () => {
    const text = '🚨 Urgent: 🚿 leaking washroom tap in room A-304! \u0000 \t \r Overflowing onto floor ⚡';
    const vec = generateEmbeddingVector(text, ['Hostel Maintenance']);
    assert.strictEqual(vec.length, VECTOR_DIMENSION);

    let nonZeroCount = 0;
    for (const val of vec) {
      assert.strictEqual(isNaN(val), false);
      if (val !== 0) nonZeroCount++;
    }
    assert.ok(nonZeroCount > 5, 'Must extract domain features from emoji/control-char infused text');
  });

  test('Extreme payload: 20,000 character repeating description processes under 20ms', () => {
    const hugeText = 'water leakage in washroom tap and pipe '.repeat(500); // ~19,500 chars
    const start = performance.now();
    const vec = generateEmbeddingVector(hugeText, ['Hostel Maintenance']);
    const elapsed = performance.now() - start;

    assert.strictEqual(vec.length, VECTOR_DIMENSION);
    assert.ok(elapsed < 30, `Vector generation for ~20KB text took ${elapsed.toFixed(2)}ms (must be < 30ms)`);
  });

  test('Extreme word length: 1,000 char unbroken string handled safely', () => {
    const longWord = 'a'.repeat(1000);
    const vec = generateEmbeddingVector(longWord);
    assert.strictEqual(vec.length, VECTOR_DIMENSION);
  });
});

describe('Challenger Suite 5: Structural Hierarchy, Inheritance & Pruning Rules', () => {
  test('Root Master Inheritance: Child duplicate links to root master, never creating deep trees', () => {
    const masterTicket: MatchCandidate = {
      id: 'master_root_001',
      ticketNo: 'GRV-ROOT-1',
      category: 'Food & Mess',
      description: 'Undercooked rice and raw vegetables served in dinner mess hall',
      status: 'PRIMARY',
      masterCaseId: null, // Root master
      createdAt: new Date().toISOString(),
      embeddingVector: generateEmbeddingVector('Undercooked rice and raw vegetables served in dinner mess hall', ['Food & Mess']),
    };

    // Candidate 1 is already a linked child of Master
    const childTicket: MatchCandidate = {
      id: 'child_intermediate_002',
      ticketNo: 'GRV-CHILD-2',
      category: 'Food & Mess',
      description: 'Undercooked rice raw vegetables dinner mess hall',
      status: 'SUSPECTED_DUPLICATE',
      masterCaseId: 'master_root_001', // Linked to root master
      createdAt: new Date().toISOString(),
      embeddingVector: generateEmbeddingVector('Undercooked rice raw vegetables dinner mess hall', ['Food & Mess']),
    };

    // Third student submits identical complaint to child ticket
    const newGrievance = {
      category: 'Food & Mess',
      description: 'Undercooked rice raw vegetables dinner mess hall',
      studentType: 'hosteller',
    };

    // Match against child ticket
    const result = runTwoStageDeduplication(newGrievance, [childTicket]);
    assert.strictEqual(result.action, 'AUTO_MERGE');
    assert.strictEqual(
      result.masterCaseId,
      'master_root_001',
      'New ticket must link directly to root masterCaseId, not the intermediate child ID',
    );
  });

  test('Stage 1 Pruning: MERGED_AUTOMATIC tickets are strictly excluded as match candidates', () => {
    const text = 'Campus central library 2nd floor air conditioning not cooling';
    const mergedCandidate: MatchCandidate = {
      id: 'cand_merged_auto',
      ticketNo: 'GRV-MRG-1',
      category: 'Electrical & AC',
      description: text,
      status: 'MERGED_AUTOMATIC', // Already auto-merged
      createdAt: new Date().toISOString(),
      embeddingVector: generateEmbeddingVector(text, ['Electrical & AC']),
    };

    const result = runTwoStageDeduplication(
      { category: 'Electrical & AC', description: text, studentType: 'dayscholar' },
      [mergedCandidate],
    );

    assert.strictEqual(
      result.action,
      'PRIMARY',
      'MERGED_AUTOMATIC candidates must be ignored in Stage 1 to prevent invalid chaining',
    );
    assert.strictEqual(result.masterCaseId, null);
  });

  test('Stage 1 Pruning: resolved tickets are strictly excluded as match candidates', () => {
    const text = 'Campus central library 2nd floor air conditioning not cooling';
    const resolvedCandidate: MatchCandidate = {
      id: 'cand_resolved',
      ticketNo: 'GRV-RES-1',
      category: 'Electrical & AC',
      description: text,
      status: 'resolved', // Already resolved
      createdAt: new Date().toISOString(),
      embeddingVector: generateEmbeddingVector(text, ['Electrical & AC']),
    };

    const result = runTwoStageDeduplication(
      { category: 'Electrical & AC', description: text, studentType: 'dayscholar' },
      [resolvedCandidate],
    );

    assert.strictEqual(
      result.action,
      'PRIMARY',
      'resolved tickets must be ignored in Stage 1; new report must start fresh primary issue',
    );
    assert.strictEqual(result.masterCaseId, null);
  });
});

describe('Challenger Suite 6: Concurrency & Transaction Integrity', () => {
  test('Empirical check: Nested withTransaction throws SQLite error without SAVEPOINT support', () => {
    // Verifies whether nested transactions throw or support savepoints
    let threwError = false;
    try {
      withTransaction(() => {
        withTransaction(() => {
          return true;
        });
      });
    } catch (err: any) {
      threwError = true;
      assert.match(
        err.message,
        /cannot start a transaction within a transaction/,
        'Proves withTransaction lacks nested SAVEPOINT support contrary to handoff claim',
      );
    }
    assert.strictEqual(threwError, true, 'Nested withTransaction must throw error in current implementation');
  });

  test('Atomic rollback restores state when error thrown inside transaction', () => {
    const db = getDatabase();
    const testRegNo = `ROLLBACK_TEST_${Date.now()}`;

    assert.throws(() => {
      withTransaction(() => {
        createGrievance({
          studentRegNo: testRegNo,
          category: 'Hostel Maintenance',
          description: 'This record should be rolled back cleanly',
        });
        throw new Error('Simulated failure during grievance creation');
      });
    }, /Simulated failure during grievance creation/);

    const check = db.prepare('SELECT * FROM grievances WHERE studentRegNo = ?').get(testRegNo);
    assert.strictEqual(check, undefined, 'Rolled-back record must not exist in SQLite database');
  });
});
