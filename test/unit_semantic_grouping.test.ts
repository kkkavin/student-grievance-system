/**
 * test/unit_semantic_grouping.test.ts
 *
 * Dedicated Unit Test Suite for Semantic Grievance Grouping
 * Tests:
 * 1. Earliest submitted grievance parent designation (T0 vs T+1h vs T+2h)
 * 2. Exact semantic similarity grouping (s >= 0.92)
 * 3. Boundary value analysis (s = 0.919 vs s = 0.920, sub-milliprecision, custom threshold)
 * 4. Category filtering guardrails (Hostel vs Food, Electrical vs Academic, bypass option)
 * 5. Location adjacency filtering (Block A vs Block D, floor distance, bus routes)
 * 6. Temporal rolling window cutoff (71h vs 73h, custom window, window disabled)
 * 7. Disjoint multi-group partitioning (Wi-Fi, Hostel, Bus, Mess)
 * 8. Mathematical partition conservation (totalCount sum === input length)
 * 9. Idempotency & order-independence (permutation invariance across shuffles)
 * 10. Degenerate edge cases (empty array, single ticket, identical timestamps, emojis, missing fields)
 * 11. Curated benchmark fixtures integration (Tier 1 auto-merges, Tier 3 divergent singletons)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupSemanticGrievances,
  GroupedSemanticGrievance,
  AUTO_MERGE_THRESHOLD,
  VECTOR_DIMENSION,
} from '../src/ml/deduplication.ts';
import { Grievance } from '../src/types.ts';
import { DEDUP_FIXTURE_PAIRS } from './fixtures/dedup_fixtures.ts';

// ============================================================================
// Fixture Helpers
// ============================================================================

let idCounter = 1000;

function makeGrievance(overrides: Partial<Grievance> = {}): Grievance {
  idCounter++;
  const id = overrides.id || `grv_${idCounter}`;
  return {
    id,
    ticketNo: overrides.ticketNo || `GRV-${idCounter}`,
    studentRegNo: '2023CS0101',
    studentName: 'Test Student',
    studentEmail: `student_${idCounter}@campus.edu`,
    studentPhone: '9876543210',
    studentType: 'hosteller',
    hostelBlock: 'A',
    roomNo: 'A-304',
    category: 'Hostel Maintenance',
    description: 'Severe water leak under washroom sink in room A-304 flooding floor',
    status: 'PRIMARY',
    isSpam: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

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

function assertPartitionConservation(input: Grievance[], output: GroupedSemanticGrievance[]): void {
  let totalAccounted = 0;
  const seenIds = new Set<string>();

  for (const group of output) {
    assert.strictEqual(
      group.totalCount,
      1 + group.children.length,
      `totalCount must equal 1 + children.length for parent ${group.parent.id}`
    );
    totalAccounted += group.totalCount;

    assert.ok(!seenIds.has(group.parent.id), `Duplicate parent ID: ${group.parent.id}`);
    seenIds.add(group.parent.id);

    for (const child of group.children) {
      assert.ok(!seenIds.has(child.id), `Duplicate child ID: ${child.id}`);
      seenIds.add(child.id);
    }
  }

  assert.strictEqual(
    totalAccounted,
    input.length,
    `Total accounted tickets (${totalAccounted}) must equal input length (${input.length})`
  );

  const inputIds = new Set(input.map((g) => g.id));
  assert.deepStrictEqual(
    seenIds,
    inputIds,
    'Set of all parent + child IDs must match input IDs exactly'
  );
}

// ============================================================================
// Test Suites
// ============================================================================

describe('Unit Tests: groupSemanticGrievances', () => {

  // --------------------------------------------------------------------------
  // Suite 1: Earliest Submitted Grievance Parent Designation
  // --------------------------------------------------------------------------
  describe('1. Earliest Parent Designation', () => {
    test('designates earliest grievance as parent when submitted chronologically (T0 < T1 < T2)', () => {
      const t0 = new Date('2026-11-01T08:00:00Z').toISOString();
      const t1 = new Date('2026-11-01T09:00:00Z').toISOString();
      const t2 = new Date('2026-11-01T10:00:00Z').toISOString();

      const gA = makeGrievance({ id: 'tkt_A', ticketNo: 'GRV-A', createdAt: t0, description: 'Water leak under washroom sink in room A-304' });
      const gB = makeGrievance({ id: 'tkt_B', ticketNo: 'GRV-B', createdAt: t1, description: 'Water leaking heavily from washroom pipe under sink in room A-304' });
      const gC = makeGrievance({ id: 'tkt_C', ticketNo: 'GRV-C', createdAt: t2, description: 'Water leaking from washroom pipe under sink in room A-304' });

      const groups = groupSemanticGrievances([gA, gB, gC]);

      assert.strictEqual(groups.length, 1, 'All 3 matching tickets must group into 1 group');
      assert.strictEqual(groups[0].parent.id, 'tkt_A', 'Earliest ticket A must be parent');
      assert.strictEqual(groups[0].totalCount, 3);
      assert.strictEqual(groups[0].children.length, 2);

      const childIds = groups[0].children.map((c) => c.id).sort();
      assert.deepStrictEqual(childIds, ['tkt_B', 'tkt_C']);
    });

    test('preserves earliest parent when input array is in reverse chronological order (T2, T1, T0)', () => {
      const t0 = new Date('2026-11-01T08:00:00Z').toISOString();
      const t1 = new Date('2026-11-01T09:00:00Z').toISOString();
      const t2 = new Date('2026-11-01T10:00:00Z').toISOString();

      const gA = makeGrievance({ id: 'tkt_A', ticketNo: 'GRV-A', createdAt: t0, description: 'Water leak under washroom sink in room A-304' });
      const gB = makeGrievance({ id: 'tkt_B', ticketNo: 'GRV-B', createdAt: t1, description: 'Water leaking heavily from washroom pipe under sink in room A-304' });
      const gC = makeGrievance({ id: 'tkt_C', ticketNo: 'GRV-C', createdAt: t2, description: 'Water leaking from washroom pipe under sink in room A-304' });

      const groups = groupSemanticGrievances([gC, gB, gA]);

      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].parent.id, 'tkt_A', 'Earliest ticket A must remain parent regardless of input order');
      assert.strictEqual(groups[0].totalCount, 3);
    });

    test('child tickets reference parent ID via masterCaseId', () => {
      const t0 = new Date('2026-11-01T08:00:00Z').toISOString();
      const t1 = new Date('2026-11-01T09:00:00Z').toISOString();

      const gA = makeGrievance({
        id: 'tkt_A',
        createdAt: t0,
        hostelBlock: 'B',
        roomNo: 'B-210',
        category: 'Electrical & AC',
        description: 'Ceiling fan regulator burnt out in B-210',
      });
      const gB = makeGrievance({
        id: 'tkt_B',
        createdAt: t1,
        hostelBlock: 'B',
        roomNo: 'B-210',
        category: 'Electrical & AC',
        description: 'Switchboard sparking and fan regulator burning in B-210',
      });

      const groups = groupSemanticGrievances([gA, gB]);
      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].parent.id, 'tkt_A');
      assert.strictEqual(groups[0].children[0].masterCaseId, 'tkt_A');
      assert.strictEqual(groups[0].parent.masterCaseId, null);
    });

    test('multiple complaints across 5 hours designate earliest as root parent', () => {
      const baseTime = new Date('2026-11-01T06:00:00Z').getTime();
      const tickets: Grievance[] = [0, 1, 2, 3, 4].map((i) =>
        makeGrievance({
          id: `burst_${i}`,
          createdAt: new Date(baseTime + i * 3600000).toISOString(),
          description: 'Water leak under washroom sink in room A-304',
        })
      );

      // Pass in scrambled order
      const groups = groupSemanticGrievances([tickets[3], tickets[0], tickets[4], tickets[1], tickets[2]]);
      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].parent.id, 'burst_0');
      assert.strictEqual(groups[0].totalCount, 5);
      assert.strictEqual(groups[0].children.length, 4);
      for (const child of groups[0].children) {
        assert.strictEqual(child.masterCaseId, 'burst_0');
      }
    });
  });

  // --------------------------------------------------------------------------
  // Suite 2: Identical Semantic Complaints Grouping (s >= 0.92)
  // --------------------------------------------------------------------------
  describe('2. Semantic Grouping Accuracy', () => {
    test('groups high-confidence paraphrased duplicates (s >= 0.92)', () => {
      const g1 = makeGrievance({
        category: 'Network & Wi-Fi',
        hostelBlock: 'CSE',
        locationTag: 'CSE Block, Floor 2, AP-CSE-F2-01',
        description: 'Wi-Fi completely offline in CSE department 2nd floor lab, access point gateway unreachable.',
        createdAt: '2026-11-02T10:00:00Z',
      });
      const g2 = makeGrievance({
        category: 'Network & Wi-Fi',
        hostelBlock: 'CSE',
        locationTag: 'CSE Block, Floor 2, AP-CSE-F2-01',
        description: 'No internet connection in CSE 2nd floor lab, Wi-Fi AP gateway down and unreachable.',
        createdAt: '2026-11-02T10:30:00Z',
      });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].parent.id, g1.id);
      assert.strictEqual(groups[0].totalCount, 2);
      assert.ok(groups[0].matchScore !== undefined && groups[0].matchScore >= 0.92);
    });

    test('groups multi-reporter incident into single parent with N-1 children', () => {
      const baseTime = new Date('2026-11-02T08:00:00Z').getTime();
      const complaints: Grievance[] = [
        'Route 14 college bus AC failed completely and bus delayed by 45 minutes near Junction stop.',
        'Route 14 morning bus air conditioner breakdown and delayed by 45 mins near Junction.',
        'Bus Route 14 AC not working and delayed 45 minutes at Junction.',
        'Air conditioning failure on Route 14 morning bus, stuck at Junction 45 mins late.',
      ].map((desc, idx) =>
        makeGrievance({
          category: 'Bus & Transport',
          studentType: 'dayscholar',
          locationTag: 'Campus Transport Route 14',
          description: desc,
          createdAt: new Date(baseTime + idx * 15 * 60 * 1000).toISOString(),
        })
      );

      const groups = groupSemanticGrievances(complaints);
      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].parent.id, complaints[0].id);
      assert.strictEqual(groups[0].totalCount, 4);
      assert.strictEqual(groups[0].children.length, 3);
    });

    test('high-volume burst of 10 identical Wi-Fi complaints forms 1 parent and 9 children', () => {
      const baseTime = new Date('2026-11-02T09:00:00Z').getTime();
      const complaints: Grievance[] = [];
      for (let i = 0; i < 10; i++) {
        complaints.push(
          makeGrievance({
            id: `wifi_burst_${i}`,
            category: 'Network & Wi-Fi',
            hostelBlock: 'CSE',
            locationTag: 'CSE Block, AP-CSE-01',
            description: 'Wi-Fi AP offline in CSE 2nd floor lab',
            createdAt: new Date(baseTime + i * 60000).toISOString(),
          })
        );
      }

      const groups = groupSemanticGrievances(complaints);
      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].parent.id, 'wifi_burst_0');
      assert.strictEqual(groups[0].totalCount, 10);
      assert.strictEqual(groups[0].children.length, 9);
      assertPartitionConservation(complaints, groups);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 3: Boundary Value Analysis (s = 0.919 vs s = 0.920)
  // --------------------------------------------------------------------------
  describe('3. Boundary Transitions (s = 0.919 vs s = 0.920)', () => {
    test('s = 0.919 does NOT group (remains standalone)', () => {
      const [vecA, vecB] = makeVectorPairWithDotProduct(0.919);
      const g1 = makeGrievance({ embeddingVector: vecA, createdAt: '2026-11-01T08:00:00Z' });
      const g2 = makeGrievance({ embeddingVector: vecB, createdAt: '2026-11-01T09:00:00Z' });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 2, 'Score 0.919 must NOT group; must yield 2 standalone groups');
      assert.strictEqual(groups[0].totalCount, 1);
      assert.strictEqual(groups[1].totalCount, 1);
      assert.strictEqual(groups[0].matchScore, undefined);
      assert.strictEqual(groups[1].matchScore, undefined);
    });

    test('s = 0.920 MUST group under parent issue', () => {
      const [vecA, vecB] = makeVectorPairWithDotProduct(0.920);
      const g1 = makeGrievance({ embeddingVector: vecA, createdAt: '2026-11-01T08:00:00Z' });
      const g2 = makeGrievance({ embeddingVector: vecB, createdAt: '2026-11-01T09:00:00Z' });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 1, 'Score 0.920 MUST group');
      assert.strictEqual(groups[0].totalCount, 2);
      assert.strictEqual(groups[0].parent.id, g1.id);
      assert.ok(groups[0].matchScore !== undefined);
      assert.ok(groups[0].matchScore >= 0.920);
    });

    test('sub-milliprecision 0.9199 must NOT group with default threshold 0.92', () => {
      const [vecA, vecB] = makeVectorPairWithDotProduct(0.9199);
      const g1 = makeGrievance({ embeddingVector: vecA, createdAt: '2026-11-01T08:00:00Z' });
      const g2 = makeGrievance({ embeddingVector: vecB, createdAt: '2026-11-01T09:00:00Z' });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 2);
    });

    test('supports custom similarityThreshold option', () => {
      const [vecA, vecB] = makeVectorPairWithDotProduct(0.85);
      const g1 = makeGrievance({ embeddingVector: vecA, createdAt: '2026-11-01T08:00:00Z' });
      const g2 = makeGrievance({ embeddingVector: vecB, createdAt: '2026-11-01T09:00:00Z' });

      // Default threshold (0.92) -> does not group
      const defaultGroups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(defaultGroups.length, 2);

      // Custom threshold (0.80) -> groups
      const customGroups = groupSemanticGrievances([g1, g2], { similarityThreshold: 0.80 });
      assert.strictEqual(customGroups.length, 1);
      assert.strictEqual(customGroups[0].totalCount, 2);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 4: Category Filtering (Stage 1 Hard Filter)
  // --------------------------------------------------------------------------
  describe('4. Category Filtering', () => {
    test('identical text across different categories does NOT group', () => {
      const g1 = makeGrievance({
        category: 'Hostel Maintenance',
        description: 'Severe water leak under washroom sink, floor flooded',
        createdAt: '2026-11-01T08:00:00Z',
      });
      const g2 = makeGrievance({
        category: 'Food & Mess',
        description: 'Severe water leak under washroom sink, floor flooded',
        createdAt: '2026-11-01T09:00:00Z',
      });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 2, 'Different categories must never group');
      assert.strictEqual(groups[0].totalCount, 1);
      assert.strictEqual(groups[1].totalCount, 1);
    });

    test('identical text across Electrical vs Academic does NOT group', () => {
      const g1 = makeGrievance({
        category: 'Electrical & AC',
        description: 'Projector and fan power not working',
        createdAt: '2026-11-01T08:00:00Z',
      });
      const g2 = makeGrievance({
        category: 'Academic Infrastructure',
        description: 'Projector and fan power not working',
        createdAt: '2026-11-01T09:00:00Z',
      });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 2);
    });

    test('supports checkCategory: false to bypass category restriction', () => {
      const g1 = makeGrievance({
        category: 'Hostel Maintenance',
        description: 'Severe water leak under washroom sink, floor flooded',
        createdAt: '2026-11-01T08:00:00Z',
      });
      const g2 = makeGrievance({
        category: 'Hostel Cleanliness',
        description: 'Severe water leak under washroom sink, floor flooded',
        createdAt: '2026-11-01T09:00:00Z',
      });

      const defaultGroups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(defaultGroups.length, 2, 'Default checkCategory: true separates categories');

      const groups = groupSemanticGrievances([g1, g2], { checkCategory: false });
      assert.strictEqual(groups.length, 1, 'When checkCategory is false, identical text groups');
      assert.strictEqual(groups[0].totalCount, 2);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 5: Location Adjacency Filtering
  // --------------------------------------------------------------------------
  describe('5. Location Adjacency Filtering', () => {
    test('identical descriptions in different hostel blocks (Block A vs Block D) do NOT group', () => {
      const g1 = makeGrievance({
        hostelBlock: 'A',
        roomNo: 'A-304',
        category: 'Hostel Maintenance',
        description: 'Water leak under washroom sink in room A-304 flooding floor',
        createdAt: '2026-11-01T08:00:00Z',
      });
      const g2 = makeGrievance({
        hostelBlock: 'D',
        roomNo: 'D-102',
        category: 'Hostel Maintenance',
        description: 'Water leak under washroom sink in room D-102 flooding floor',
        createdAt: '2026-11-01T09:00:00Z',
      });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 2, 'Different blocks must NOT group');
    });

    test('distant floors (> 1 floor difference) do NOT group', () => {
      const g1 = makeGrievance({
        hostelBlock: 'A',
        roomNo: 'A-102',
        category: 'Hostel Maintenance',
        description: 'Water pipe leak under washbasin washroom sink drain overflowing flood',
        createdAt: '2026-11-01T08:00:00Z',
      });
      const g2 = makeGrievance({
        hostelBlock: 'A',
        roomNo: 'A-402',
        category: 'Hostel Maintenance',
        description: 'Water pipe leak under washbasin washroom sink drain overflowing flood',
        createdAt: '2026-11-01T09:00:00Z',
      });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 2, 'Floors 1 vs 4 must NOT group');
    });

    test('adjacent floors (+/- 1 floor) DO group for plumbing leaks', () => {
      const g1 = makeGrievance({
        hostelBlock: 'A',
        roomNo: 'A-304',
        category: 'Hostel Maintenance',
        description: 'Water pipe leak under washbasin washroom sink drain overflowing flood',
        createdAt: '2026-11-01T08:00:00Z',
      });
      const g2 = makeGrievance({
        hostelBlock: 'A',
        roomNo: 'A-204',
        category: 'Hostel Maintenance',
        description: 'Water pipe leak under washbasin washroom sink drain overflowing flood',
        createdAt: '2026-11-01T09:00:00Z',
      });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 1, 'Vertical plumbing adjacency must group');
      assert.strictEqual(groups[0].totalCount, 2);
    });

    test('different bus routes do NOT group', () => {
      const g1 = makeGrievance({
        category: 'Bus & Transport',
        studentType: 'dayscholar',
        description: 'Route 14 bus broken down near tollgate bridge',
        createdAt: '2026-11-01T08:00:00Z',
      });
      const g2 = makeGrievance({
        category: 'Bus & Transport',
        studentType: 'dayscholar',
        description: 'Route 3 bus broken down near tollgate bridge',
        createdAt: '2026-11-01T09:00:00Z',
      });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 2, 'Route 14 vs Route 3 must NOT group');
    });
  });

  // --------------------------------------------------------------------------
  // Suite 6: Temporal Rolling Window Boundaries (72-Hour Cutoff)
  // --------------------------------------------------------------------------
  describe('6. Temporal Window Boundaries', () => {
    test('grievance within 72 hours (71h) groups with parent', () => {
      const t0 = new Date('2026-11-01T08:00:00Z');
      const t71 = new Date(t0.getTime() + 71 * 60 * 60 * 1000);

      const g1 = makeGrievance({ createdAt: t0.toISOString(), description: 'Water leak in washroom sink A-304' });
      const g2 = makeGrievance({ createdAt: t71.toISOString(), description: 'Water leak in washroom sink A-304' });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 1, '71h is within 72h window, must group');
      assert.strictEqual(groups[0].totalCount, 2);
    });

    test('grievance outside 72 hours (73h) does NOT group with parent', () => {
      const t0 = new Date('2026-11-01T08:00:00Z');
      const t73 = new Date(t0.getTime() + 73 * 60 * 60 * 1000);

      const g1 = makeGrievance({ createdAt: t0.toISOString(), description: 'Water leak in washroom sink A-304' });
      const g2 = makeGrievance({ createdAt: t73.toISOString(), description: 'Water leak in washroom sink A-304' });

      const groups = groupSemanticGrievances([g1, g2]);
      assert.strictEqual(groups.length, 2, '73h is outside 72h window, must be independent');
    });

    test('supports custom windowHours option', () => {
      const t0 = new Date('2026-11-01T08:00:00Z');
      const t24 = new Date(t0.getTime() + 24 * 60 * 60 * 1000);

      const g1 = makeGrievance({ createdAt: t0.toISOString(), description: 'Water leak in washroom sink A-304' });
      const g2 = makeGrievance({ createdAt: t24.toISOString(), description: 'Water leak in washroom sink A-304' });

      // windowHours = 12 -> 24h gap does NOT group
      const groups12 = groupSemanticGrievances([g1, g2], { windowHours: 12 });
      assert.strictEqual(groups12.length, 2);

      // windowHours = 48 -> 24h gap DOES group
      const groups48 = groupSemanticGrievances([g1, g2], { windowHours: 48 });
      assert.strictEqual(groups48.length, 1);
      assert.strictEqual(groups48[0].totalCount, 2);
    });

    test('windowHours: 0 disables time window constraint', () => {
      const t0 = new Date('2026-11-01T08:00:00Z');
      const t120 = new Date(t0.getTime() + 120 * 60 * 60 * 1000); // 5 days later

      const g1 = makeGrievance({ createdAt: t0.toISOString(), description: 'Water leak in washroom sink A-304' });
      const g2 = makeGrievance({ createdAt: t120.toISOString(), description: 'Water leak in washroom sink A-304' });

      const groups = groupSemanticGrievances([g1, g2], { windowHours: 0 });
      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].totalCount, 2);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 7: Disjoint Multi-Group Partitioning
  // --------------------------------------------------------------------------
  describe('7. Disjoint Multi-Group Partitioning', () => {
    test('correctly partitions heterogeneous batch into distinct clusters and singletons', () => {
      const now = new Date('2026-11-02T10:00:00Z').getTime();

      // Cluster 1: Wi-Fi (3 tickets)
      const w1 = makeGrievance({ category: 'Network & Wi-Fi', hostelBlock: 'CSE', locationTag: 'CSE Block, AP-CSE-01', description: 'Wi-Fi AP offline in CSE 2nd floor lab', createdAt: new Date(now).toISOString() });
      const w2 = makeGrievance({ category: 'Network & Wi-Fi', hostelBlock: 'CSE', locationTag: 'CSE Block, AP-CSE-01', description: 'No internet access point down in CSE 2nd floor lab', createdAt: new Date(now + 10000).toISOString() });
      const w3 = makeGrievance({ category: 'Network & Wi-Fi', hostelBlock: 'CSE', locationTag: 'CSE Block, AP-CSE-01', description: 'CSE floor 2 lab Wi-Fi gateway unreachable', createdAt: new Date(now + 20000).toISOString() });

      // Cluster 2: Hostel Plumbing (2 tickets from PAIR-EXACT-01)
      const p1 = makeGrievance({
        category: 'Hostel Maintenance',
        hostelBlock: 'A',
        roomNo: 'A-304',
        locationTag: 'Hostel Block A, Floor 3, Room A-304',
        description: 'Severe water leak under washroom sink in room A-304. Water is flooding the bathroom floor.',
        createdAt: new Date(now + 30000).toISOString(),
      });
      const p2 = makeGrievance({
        category: 'Hostel Maintenance',
        hostelBlock: 'A',
        roomNo: 'A-304',
        locationTag: 'Hostel Block A, Floor 3, Room A-304',
        description: 'Water leaking heavily from pipe under sink in room A-304, washroom floor completely flooded.',
        createdAt: new Date(now + 40000).toISOString(),
      });

      // Singleton 1: Bus delay (1 ticket)
      const b1 = makeGrievance({ category: 'Bus & Transport', studentType: 'dayscholar', description: 'Route 8 bus flat tire near tollgate', createdAt: new Date(now + 50000).toISOString() });

      // Singleton 2: Food & Mess (1 ticket)
      const m1 = makeGrievance({ category: 'Food & Mess', locationTag: 'Central Dining', description: 'Mess 1 dinner rice raw and uncooked', createdAt: new Date(now + 60000).toISOString() });

      const all = [w1, w2, w3, p1, p2, b1, m1];
      const groups = groupSemanticGrievances(all);

      assert.strictEqual(groups.length, 4, 'Must return exactly 4 groups (2 clusters + 2 singletons)');

      const wifiGroup = groups.find((g) => g.parent.id === w1.id);
      assert.ok(wifiGroup, 'Wi-Fi group must be present');
      assert.strictEqual(wifiGroup.totalCount, 3);
      assert.strictEqual(wifiGroup.children.length, 2);

      const plumbGroup = groups.find((g) => g.parent.id === p1.id);
      assert.ok(plumbGroup, 'Plumbing group must be present');
      assert.strictEqual(plumbGroup.totalCount, 2);
      assert.strictEqual(plumbGroup.children.length, 1);

      const busGroup = groups.find((g) => g.parent.id === b1.id);
      assert.ok(busGroup, 'Bus group must be present');
      assert.strictEqual(busGroup.totalCount, 1);
      assert.strictEqual(busGroup.children.length, 0);

      const messGroup = groups.find((g) => g.parent.id === m1.id);
      assert.ok(messGroup, 'Mess group must be present');
      assert.strictEqual(messGroup.totalCount, 1);
      assert.strictEqual(messGroup.children.length, 0);

      assertPartitionConservation(all, groups);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 8: Mathematical Invariants & Partition Conservation
  // --------------------------------------------------------------------------
  describe('8. Partition Conservation Invariant', () => {
    test('total input tickets === sum of totalCount across all returned groups', () => {
      const tickets: Grievance[] = [];
      const now = Date.now();

      // Create 20 tickets with mixed clusters and singletons
      for (let i = 0; i < 20; i++) {
        tickets.push(
          makeGrievance({
            id: `test_inv_${i}`,
            ticketNo: `GRV-INV-${i}`,
            category: i % 2 === 0 ? 'Hostel Maintenance' : 'Electrical & AC',
            description: i < 6
              ? 'Severe water leak under washroom sink in room A-304 flooding floor'
              : `Independent unique complaint description number ${i}`,
            createdAt: new Date(now + i * 60000).toISOString(),
          })
        );
      }

      const groups = groupSemanticGrievances(tickets);
      assertPartitionConservation(tickets, groups);
    });

    test('standalone tickets have children: [] and matchScore: undefined', () => {
      const solo = makeGrievance({ id: 'standalone_01', description: 'Unique lone complaint' });
      const groups = groupSemanticGrievances([solo]);

      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].totalCount, 1);
      assert.deepStrictEqual(groups[0].children, []);
      assert.strictEqual(groups[0].matchScore, undefined);
    });
  });

  // --------------------------------------------------------------------------
  // Suite 9: Idempotency & Permutation Invariance (Order-Independence)
  // --------------------------------------------------------------------------
  describe('9. Permutation Invariance', () => {
    test('shuffling input array produces strictly identical parent election and grouping', () => {
      const now = new Date('2026-11-01T10:00:00Z').getTime();

      const a1 = makeGrievance({ id: 'a1', createdAt: new Date(now).toISOString(), description: 'Severe water leak under washroom sink in room A-304 flooding floor' });
      const a2 = makeGrievance({ id: 'a2', createdAt: new Date(now + 1000).toISOString(), description: 'Water leak under washroom sink in room A-304 flooding floor' });
      const b1 = makeGrievance({ id: 'b1', category: 'Bus & Transport', studentType: 'dayscholar', locationTag: 'Campus Transport Route 14', createdAt: new Date(now + 2000).toISOString(), description: 'Route 14 college bus broken down near Junction' });
      const b2 = makeGrievance({ id: 'b2', category: 'Bus & Transport', studentType: 'dayscholar', locationTag: 'Campus Transport Route 14', createdAt: new Date(now + 3000).toISOString(), description: 'Route 14 morning bus broken down near Junction' });
      const c1 = makeGrievance({ id: 'c1', category: 'Food & Mess', createdAt: new Date(now + 4000).toISOString(), description: 'Dinner rice uncooked' });

      const baseList = [a1, a2, b1, b2, c1];
      const baseResult = groupSemanticGrievances(baseList);

      assert.strictEqual(baseResult.length, 3);
      const baseParentIds = baseResult.map((g) => g.parent.id).sort();

      const permutations = [
        [c1, b2, a1, b1, a2],
        [b1, a2, c1, a1, b2],
        [a2, b2, c1, b1, a1],
        [b2, b1, a2, a1, c1],
        [a1, c1, b2, a2, b1],
      ];

      for (let pIdx = 0; pIdx < permutations.length; pIdx++) {
        const permResult = groupSemanticGrievances(permutations[pIdx]);
        const permParentIds = permResult.map((g) => g.parent.id).sort();

        assert.deepStrictEqual(
          permParentIds,
          baseParentIds,
          `Permutation ${pIdx} produced different parent IDs`
        );

        for (const baseGroup of baseResult) {
          const matchingGroup = permResult.find((g) => g.parent.id === baseGroup.parent.id);
          assert.ok(matchingGroup, `Parent ${baseGroup.parent.id} missing in permutation ${pIdx}`);
          assert.strictEqual(matchingGroup.totalCount, baseGroup.totalCount);

          const baseChildren = baseGroup.children.map((c) => c.id).sort();
          const permChildren = matchingGroup.children.map((c) => c.id).sort();
          assert.deepStrictEqual(
            permChildren,
            baseChildren,
            `Children mismatch for parent ${baseGroup.parent.id} in permutation ${pIdx}`
          );
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Suite 10: Degenerate, Empty & Robustness Cases
  // --------------------------------------------------------------------------
  describe('10. Degenerate Edge Cases', () => {
    test('handles empty input array gracefully', () => {
      const groups = groupSemanticGrievances([]);
      assert.deepStrictEqual(groups, []);
    });

    test('handles single-ticket input array', () => {
      const single = makeGrievance({ id: 'solo_1' });
      const groups = groupSemanticGrievances([single]);

      assert.strictEqual(groups.length, 1);
      assert.strictEqual(groups[0].parent.id, 'solo_1');
      assert.strictEqual(groups[0].totalCount, 1);
      assert.deepStrictEqual(groups[0].children, []);
    });

    test('deterministically breaks ties when timestamps are identical', () => {
      const sameTime = '2026-11-01T12:00:00.000Z';
      const gX = makeGrievance({ id: 'tkt_01', ticketNo: 'GRV-001', createdAt: sameTime, description: 'Leak in washroom sink A-304' });
      const gY = makeGrievance({ id: 'tkt_02', ticketNo: 'GRV-002', createdAt: sameTime, description: 'Leak in washroom sink A-304' });

      // Run with [gX, gY]
      const res1 = groupSemanticGrievances([gX, gY]);
      // Run with [gY, gX]
      const res2 = groupSemanticGrievances([gY, gX]);

      assert.strictEqual(res1.length, 1);
      assert.strictEqual(res2.length, 1);
      assert.strictEqual(
        res1[0].parent.id,
        res2[0].parent.id,
        'Tie-break must elect identical parent regardless of input order'
      );
      assert.strictEqual(res1[0].parent.id, 'tkt_01', 'Lower ticketNo/id is elected parent');
    });

    test('handles missing optional fields without runtime exceptions', () => {
      const gMinimal = makeGrievance({
        hostelBlock: undefined,
        roomNo: undefined,
        locationTag: undefined,
        priority: undefined,
        description: 'Simple complaint with missing optional metadata',
      });

      assert.doesNotThrow(() => {
        const groups = groupSemanticGrievances([gMinimal]);
        assert.strictEqual(groups.length, 1);
        assert.strictEqual(groups[0].totalCount, 1);
      });
    });

    test('handles unicode, emojis, and special characters', () => {
      const g1 = makeGrievance({
        description: '🚨 Major water burst in washroom! 💧 Floor flooded 100% 🌊',
        createdAt: '2026-11-01T08:00:00Z',
      });
      const g2 = makeGrievance({
        description: 'Water burst in washroom floor flooded',
        createdAt: '2026-11-01T08:30:00Z',
      });

      assert.doesNotThrow(() => {
        const groups = groupSemanticGrievances([g1, g2]);
        assert.ok(groups.length >= 1);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Suite 11: Curated Benchmark Fixtures Integration
  // --------------------------------------------------------------------------
  describe('11. Curated Benchmark Fixtures Integration', () => {
    test('Tier 1 exact duplicate pairs (>= 0.92) group into totalCount: 2', () => {
      const tier1Pairs = DEDUP_FIXTURE_PAIRS.filter((p) => p.tier === 'EXACT_DUPLICATE');
      assert.strictEqual(tier1Pairs.length, 15, 'Must have exactly 15 Tier 1 pairs');

      const now = new Date('2026-11-01T10:00:00Z').getTime();

      for (const pair of tier1Pairs) {
        const primaryGrievance = makeGrievance({
          id: `pri_${pair.pairId}`,
          ticketNo: `TKT-P-${pair.pairId}`,
          category: pair.category,
          studentType: pair.primaryTicket.studentType,
          hostelBlock: pair.primaryTicket.hostelBlock,
          roomNo: pair.primaryTicket.roomNo,
          locationTag: pair.primaryTicket.locationTag,
          description: pair.primaryTicket.description,
          createdAt: new Date(now).toISOString(),
        });

        const candidateGrievance = makeGrievance({
          id: `cand_${pair.pairId}`,
          ticketNo: `TKT-C-${pair.pairId}`,
          category: pair.category,
          studentType: pair.candidateTicket.studentType,
          hostelBlock: pair.candidateTicket.hostelBlock,
          roomNo: pair.candidateTicket.roomNo,
          locationTag: pair.candidateTicket.locationTag,
          description: pair.candidateTicket.description,
          createdAt: new Date(now + (pair.timeOffsetHours || 1) * 3600000).toISOString(),
        });

        const groups = groupSemanticGrievances([primaryGrievance, candidateGrievance]);
        assert.strictEqual(
          groups.length,
          1,
          `Pair ${pair.pairId} (${pair.description}) failed to group into 1 cluster`
        );
        assert.strictEqual(groups[0].totalCount, 2, `Pair ${pair.pairId} must have totalCount === 2`);
        assert.strictEqual(
          groups[0].parent.id,
          primaryGrievance.id,
          `Pair ${pair.pairId} earliest grievance must be parent`
        );
      }
    });

    test('Tier 3 divergent pairs (< 0.80) remain separate standalone groups', () => {
      const tier3Pairs = DEDUP_FIXTURE_PAIRS.filter((p) => p.tier === 'DIVERGENT');
      assert.strictEqual(tier3Pairs.length, 13, 'Must have exactly 13 Tier 3 pairs');

      const now = new Date('2026-11-01T10:00:00Z').getTime();

      for (const pair of tier3Pairs) {
        const primaryGrievance = makeGrievance({
          id: `pri_${pair.pairId}`,
          ticketNo: `TKT-P-${pair.pairId}`,
          category: pair.category,
          studentType: pair.primaryTicket.studentType,
          hostelBlock: pair.primaryTicket.hostelBlock,
          roomNo: pair.primaryTicket.roomNo,
          locationTag: pair.primaryTicket.locationTag,
          description: pair.primaryTicket.description,
          createdAt: new Date(now).toISOString(),
        });

        const candidateGrievance = makeGrievance({
          id: `cand_${pair.pairId}`,
          ticketNo: `TKT-C-${pair.pairId}`,
          category: pair.category,
          studentType: pair.candidateTicket.studentType,
          hostelBlock: pair.candidateTicket.hostelBlock,
          roomNo: pair.candidateTicket.roomNo,
          locationTag: pair.candidateTicket.locationTag,
          description: pair.candidateTicket.description,
          createdAt: new Date(now + (pair.timeOffsetHours || 1) * 3600000).toISOString(),
        });

        const groups = groupSemanticGrievances([primaryGrievance, candidateGrievance]);
        assert.strictEqual(
          groups.length,
          2,
          `Pair ${pair.pairId} (${pair.description}) should NOT group; expected 2 groups`
        );
        assert.strictEqual(groups[0].totalCount, 1);
        assert.strictEqual(groups[1].totalCount, 1);
      }
    });
  });
});
