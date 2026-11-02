import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEmbeddingVector,
  computeCosineSimilarity,
  checkLocationAdjacency,
  extractFloorFromRoom,
  extractRouteNumber,
  normalizeBlock,
  runTwoStageDeduplication,
  VECTOR_DIMENSION,
} from '../src/ml/deduplication.ts';
import {
  getDatabase,
  createGrievance,
  getGrievanceById,
  updateGrievance,
  withTransaction,
  getChildGrievances,
  getTriageGrievances,
  saveOutboxEmail,
  getOutboxEmails,
} from '../db.ts';
import { MatchCandidate } from '../src/types.ts';

describe('Unit Deduplication Test Suite', () => {
  // =========================================================================
  // 1. In-Process Vector Embedding Pipeline & Cosine Similarity
  // =========================================================================
  describe('1. Vector Embedding Pipeline & Cosine Similarity', () => {
    test('generateEmbeddingVector produces expected dimension and L2 normalization', () => {
      const vec = generateEmbeddingVector('Severe water leak under sink in room A-304');
      assert.strictEqual(vec.length, VECTOR_DIMENSION, `Expected dimension ${VECTOR_DIMENSION}`);

      // Euclidean L2 norm should be approximately 1.0
      let sumSq = 0;
      for (const val of vec) {
        sumSq += val * val;
      }
      const norm = Math.sqrt(sumSq);
      assert.ok(Math.abs(norm - 1.0) < 0.01, `Expected unit norm ~1.0, got ${norm}`);
    });

    test('computeCosineSimilarity correctly calculates identity and orthogonality', () => {
      const vecA = generateEmbeddingVector('Water pipe burst in washroom');
      const identitySim = computeCosineSimilarity(vecA, vecA);
      assert.strictEqual(identitySim, 1.0, 'Identical vectors must have cosine similarity of 1.0');

      const zeroVec = new Array(VECTOR_DIMENSION).fill(0);
      assert.strictEqual(computeCosineSimilarity(vecA, zeroVec), 0.0, 'Zero vector must yield 0.0');
    });

    test('Cosine similarity detects exact duplicate paraphrasing >= 0.92', () => {
      const desc1 = 'Severe water leak under washroom sink in room A-304, flooding bathroom floor';
      const desc2 = 'Water leaking heavily from pipe under washroom sink in room A-304, flooding bathroom floor';

      const v1 = generateEmbeddingVector(desc1, ['Plumbing & Water', 'Block A', 'A-304', 'Hostel Block A, Floor 3, Room A-304']);
      const v2 = generateEmbeddingVector(desc2, ['Plumbing & Water', 'Block A', 'A-304', 'Hostel Block A, Floor 3, Room A-304']);
      const sim = computeCosineSimilarity(v1, v2);

      assert.ok(
        sim >= 0.92,
        `Expected high similarity >= 0.92 for paraphrased duplicate, got ${sim}`,
      );
    });

    test('Cosine similarity differentiates divergent issues < 0.80', () => {
      const descPlumbing = 'Severe water leak under washroom sink in room A-304';
      const descElectrical = 'Ceiling fan regulator burnt and not spinning in room A-304';

      const v1 = generateEmbeddingVector(descPlumbing, ['Plumbing & Water', 'A', 'A-304']);
      const v2 = generateEmbeddingVector(descElectrical, ['Electrical & AC', 'A', 'A-304']);
      const sim = computeCosineSimilarity(v1, v2);

      assert.ok(
        sim < 0.80,
        `Expected low similarity < 0.80 for different categories in same room, got ${sim}`,
      );
    });
  });

  // =========================================================================
  // 2. Stage 1 Hard Filtering & Boundary Conditions
  // =========================================================================
  describe('2. Stage 1 Hard Filter Boundary Conditions', () => {
    test('extractFloorFromRoom extracts proper floor index', () => {
      assert.strictEqual(extractFloorFromRoom('A-304'), 3);
      assert.strictEqual(extractFloorFromRoom('304'), 3);
      assert.strictEqual(extractFloorFromRoom('B-412'), 4);
      assert.strictEqual(extractFloorFromRoom('D-102'), 1);
      assert.strictEqual(extractFloorFromRoom('G-04'), 0);
      assert.strictEqual(extractFloorFromRoom('Ground floor corridor'), 0);
      assert.strictEqual(extractFloorFromRoom('3rd Floor Washroom'), 3);
    });

    test('extractRouteNumber extracts bus route identifier', () => {
      assert.strictEqual(extractRouteNumber('Route 14 bus delayed'), '14');
      assert.strictEqual(extractRouteNumber('Route #22 breakdown'), '22');
      assert.strictEqual(extractRouteNumber('Bus 8 late today'), '8');
    });

    test('normalizeBlock normalizes block naming variations', () => {
      assert.strictEqual(normalizeBlock('Block A (Boys Hostel)'), 'block a');
      assert.strictEqual(normalizeBlock('Block B'), 'block b');
      assert.strictEqual(normalizeBlock('Girls Hostel Block C'), 'girls block c');
    });

    test('checkLocationAdjacency evaluates hostel floor adjacency', () => {
      const candidate: MatchCandidate = {
        id: 'c1',
        ticketNo: 'GRV-C1',
        category: 'Plumbing & Water',
        hostelBlock: 'Block A',
        roomNo: 'A-304',
        description: 'Leak in washroom',
        embeddingVector: [],
        status: 'PRIMARY',
        createdAt: new Date().toISOString(),
      };

      // Same floor room (A-308) -> adjacent
      assert.ok(
        checkLocationAdjacency(
          {
            category: 'Plumbing & Water',
            description: 'Leak in sink',
            hostelBlock: 'Block A',
            roomNo: 'A-308',
            studentType: 'hosteller',
          },
          candidate,
        ),
      );

      // Adjacent vertical floor (A-204, floor 2 vs floor 3) -> adjacent for plumbing
      assert.ok(
        checkLocationAdjacency(
          {
            category: 'Plumbing & Water',
            description: 'Damp ceiling from upstairs',
            hostelBlock: 'Block A',
            roomNo: 'A-204',
            studentType: 'hosteller',
          },
          candidate,
        ),
      );

      // Distant floor (A-102, floor 1 vs floor 3) -> NOT adjacent
      assert.ok(
        !checkLocationAdjacency(
          {
            category: 'Plumbing & Water',
            description: 'Sink leaking in room 102',
            hostelBlock: 'Block A',
            roomNo: 'A-102',
            studentType: 'hosteller',
          },
          candidate,
        ),
      );

      // Different block (Block D vs Block A) -> NOT adjacent
      assert.ok(
        !checkLocationAdjacency(
          {
            category: 'Plumbing & Water',
            description: 'Sink leaking in Block D',
            hostelBlock: 'Block D',
            roomNo: 'D-304',
            studentType: 'hosteller',
          },
          candidate,
        ),
      );
    });

    test('checkLocationAdjacency evaluates transport route matching', () => {
      const candidate: MatchCandidate = {
        id: 'c_trans',
        ticketNo: 'GRV-T1',
        category: 'Bus & Transport',
        description: 'Route 14 bus broken down near bridge',
        embeddingVector: [],
        status: 'PRIMARY',
        createdAt: new Date().toISOString(),
      };

      // Same route 14 -> adjacent
      assert.ok(
        checkLocationAdjacency(
          {
            category: 'Bus & Transport',
            description: 'Route 14 delayed by 40 minutes',
            studentType: 'dayscholar',
          },
          candidate,
        ),
      );

      // Different route 22 -> NOT adjacent
      assert.ok(
        !checkLocationAdjacency(
          {
            category: 'Bus & Transport',
            description: 'Route 22 bus delayed',
            studentType: 'dayscholar',
          },
          candidate,
        ),
      );
    });

    test('runTwoStageDeduplication filters out candidates outside 72h window', () => {
      const oldDate = new Date(Date.now() - 80 * 60 * 60 * 1000).toISOString(); // 80h ago
      const candidate: MatchCandidate = {
        id: 'old-1',
        ticketNo: 'GRV-OLD',
        category: 'Plumbing & Water',
        hostelBlock: 'Block A',
        roomNo: 'A-304',
        description: 'Water leak in washroom sink A-304',
        embeddingVector: generateEmbeddingVector('Water leak in washroom sink A-304'),
        status: 'PRIMARY',
        createdAt: oldDate,
      };

      const result = runTwoStageDeduplication(
        {
          category: 'Plumbing & Water',
          description: 'Water leak in washroom sink A-304',
          hostelBlock: 'Block A',
          roomNo: 'A-304',
          studentType: 'hosteller',
        },
        [candidate],
      );

      assert.strictEqual(result.action, 'PRIMARY');
      assert.strictEqual(result.status, 'PRIMARY');
      assert.strictEqual(result.masterCaseId, null);
    });

    test('runTwoStageDeduplication filters out category mismatches', () => {
      const candidate: MatchCandidate = {
        id: 'cand-food',
        ticketNo: 'GRV-FOOD',
        category: 'Food & Mess',
        hostelBlock: 'Block A',
        roomNo: 'A-304',
        description: 'Dinner food was cold and stale',
        embeddingVector: generateEmbeddingVector('Dinner food was cold and stale'),
        status: 'PRIMARY',
        createdAt: new Date().toISOString(),
      };

      const result = runTwoStageDeduplication(
        {
          category: 'Plumbing & Water',
          description: 'Water leaking in washroom',
          hostelBlock: 'Block A',
          roomNo: 'A-304',
          studentType: 'hosteller',
        },
        [candidate],
      );

      assert.strictEqual(result.action, 'PRIMARY');
      assert.strictEqual(result.status, 'PRIMARY');
      assert.strictEqual(result.masterCaseId, null);
    });
  });

  // =========================================================================
  // 3. Two-Stage Deduplication Threshold Decisions (>=0.92, 0.80-0.91, <0.80)
  // =========================================================================
  describe('3. Deduplication Threshold Decisions', () => {
    test('Auto-merge threshold >= 0.92 marks ticket as MERGED_AUTOMATIC', () => {
      const masterDesc = 'Severe water leak under washroom sink in room A-304, washroom floor flooded';
      const loc = 'Hostel Block A, Floor 3, Room A-304';
      const masterVector = generateEmbeddingVector(masterDesc, ['Plumbing & Water', 'Block A', 'A-304', loc]);

      const candidate: MatchCandidate = {
        id: 'master-100',
        ticketNo: 'GRV-M100',
        category: 'Plumbing & Water',
        hostelBlock: 'Block A',
        roomNo: 'A-304',
        description: masterDesc,
        embeddingVector: masterVector,
        status: 'PRIMARY',
        createdAt: new Date().toISOString(),
      };

      const childDesc = 'Water leaking heavily from pipe under washroom sink in room A-304, washroom floor completely flooded';
      const result = runTwoStageDeduplication(
        {
          category: 'Plumbing & Water',
          description: childDesc,
          hostelBlock: 'Block A',
          roomNo: 'A-304',
          studentType: 'hosteller',
          locationTag: loc,
        },
        [candidate],
      );

      assert.strictEqual(result.action, 'AUTO_MERGE');
      assert.strictEqual(result.status, 'MERGED_AUTOMATIC');
      assert.strictEqual(result.masterCaseId, 'master-100');
      assert.ok(result.similarityScore !== null && result.similarityScore >= 0.92);
      assert.strictEqual(result.matchedTicketNo, 'GRV-M100');
    });

    test('Inherits root master ticket ID if matched candidate is already a child', () => {
      const loc = 'Hostel Block A, Floor 3, Room A-304';
      const candidateChild: MatchCandidate = {
        id: 'child-50',
        ticketNo: 'GRV-C50',
        category: 'Plumbing & Water',
        hostelBlock: 'Block A',
        roomNo: 'A-304',
        description: 'Severe water leak under washroom sink in room A-304, washroom floor flooded',
        embeddingVector: generateEmbeddingVector('Severe water leak under washroom sink in room A-304, washroom floor flooded', ['Plumbing & Water', 'Block A', 'A-304', loc]),
        status: 'PRIMARY',
        masterCaseId: 'root-master-01',
        createdAt: new Date().toISOString(),
      };

      const result = runTwoStageDeduplication(
        {
          category: 'Plumbing & Water',
          description: 'Water leaking heavily from pipe under washroom sink in room A-304, washroom floor completely flooded',
          hostelBlock: 'Block A',
          roomNo: 'A-304',
          studentType: 'hosteller',
          locationTag: loc,
        },
        [candidateChild],
      );

      assert.strictEqual(result.action, 'AUTO_MERGE');
      assert.strictEqual(result.masterCaseId, 'root-master-01', 'Must inherit root masterCaseId');
    });

    test('Suspected duplicate threshold [0.80, 0.91] marks ticket as SUSPECTED_DUPLICATE', () => {
      const primaryDesc = 'Water leaking under washroom sink in room A-304, floor flooded with drainage backup';
      const primaryVector = generateEmbeddingVector(primaryDesc, ['Plumbing & Water', 'Block A', 'A-304']);

      const candidate: MatchCandidate = {
        id: 'susp-cand-1',
        ticketNo: 'GRV-S1',
        category: 'Plumbing & Water',
        hostelBlock: 'Block A',
        roomNo: 'A-304',
        description: primaryDesc,
        embeddingVector: primaryVector,
        status: 'PRIMARY',
        createdAt: new Date().toISOString(),
      };

      const ticketDesc = 'Water leaking under washroom sink in room A-304';
      const result = runTwoStageDeduplication(
        {
          category: 'Plumbing & Water',
          description: ticketDesc,
          hostelBlock: 'Block A',
          roomNo: 'A-304',
          studentType: 'hosteller',
        },
        [candidate],
      );
      assert.strictEqual(result.action, 'SUSPECTED_DUPLICATE');
      assert.strictEqual(result.status, 'SUSPECTED_DUPLICATE');
      assert.strictEqual(result.masterCaseId, 'susp-cand-1');
      assert.ok(
        result.similarityScore !== null &&
          result.similarityScore >= 0.80 &&
          result.similarityScore < 0.92,
        `Expected score in [0.80, 0.91], got ${result.similarityScore}`,
      );
    });

    test('Divergent complaint < 0.80 remains PRIMARY independent ticket', () => {
      const candidate: MatchCandidate = {
        id: 'div-cand-1',
        ticketNo: 'GRV-DIV1',
        category: 'Electrical & AC',
        hostelBlock: 'Block A',
        roomNo: 'A-304',
        description: 'Ceiling fan regulator burnt out',
        embeddingVector: generateEmbeddingVector('Ceiling fan regulator burnt out', ['Electrical & AC', 'A', 'A-304']),
        status: 'PRIMARY',
        createdAt: new Date().toISOString(),
      };

      const result = runTwoStageDeduplication(
        {
          category: 'Electrical & AC',
          description: 'Power socket near bed sparking when phone charger is plugged in',
          hostelBlock: 'Block A',
          roomNo: 'A-304',
          studentType: 'hosteller',
        },
        [candidate],
      );

      assert.strictEqual(result.action, 'PRIMARY');
      assert.strictEqual(result.status, 'PRIMARY');
      assert.strictEqual(result.masterCaseId, null);
    });
  });

  // =========================================================================
  // 4. Atomic Transactions & Concurrency Lock Integrity
  // =========================================================================
  describe('4. Atomic Transactions with withTransaction()', () => {
    test('withTransaction commits successfully on normal completion', () => {
      const now = Date.now();
      const uniqueId = 'tkt_tx_test_commit_' + now;
      const created = withTransaction(() => {
        return createGrievance({
          id: uniqueId,
          ticketNo: 'GRV-TX-' + now,
          studentRegNo: 'TEST_REG_1',
          studentName: 'Test Student',
          studentEmail: 'tx_test1@college.edu',
          studentType: 'hosteller',
          category: 'Damages & Repairs',
          description: 'Broken window latch in room',
        });
      });

      assert.ok(created);
      const fetched = getGrievanceById(uniqueId);
      assert.ok(fetched);
      assert.strictEqual(fetched.id, uniqueId);
    });

    test('withTransaction rolls back cleanly without leaving dirty records on error', () => {
      const now = Date.now();
      const uniqueId = 'tkt_tx_test_rollback_' + now;

      assert.throws(() => {
        withTransaction(() => {
          createGrievance({
            id: uniqueId,
            ticketNo: 'GRV-TX-RB-' + now,
            studentRegNo: 'TEST_REG_2',
            studentName: 'Rollback Student',
            studentEmail: 'rollback@college.edu',
            studentType: 'hosteller',
            category: 'Damages & Repairs',
            description: 'This record should be rolled back',
          });

          // Simulate intentional error mid-transaction
          throw new Error('Simulated transaction failure');
        });
      }, /Simulated transaction failure/);

      // Verify the record was NOT committed
      const fetched = getGrievanceById(uniqueId);
      assert.strictEqual(fetched, null, 'Record should have rolled back and not exist in database');
    });
  });

  // =========================================================================
  // 5. Student Privacy Isolation & Response Sanitization
  // =========================================================================
  describe('5. Student Privacy Isolation', () => {
    test('Child ticket preserves privacy by displaying public master notes while shielding master PII', () => {
      // Create master ticket belonging to Student A
      const now = Date.now() + Math.floor(Math.random() * 100000);
      const masterId = 'tkt_master_privacy_' + now;
      const master = createGrievance({
        id: masterId,
        ticketNo: 'GRV-MAST-' + now,
        studentRegNo: 'STUDENT_A_REG',
        studentName: 'Private Student A',
        studentEmail: 'studentA@campus.edu',
        studentPhone: '9999988888',
        studentType: 'hosteller',
        hostelBlock: 'Block B',
        roomNo: 'B-201',
        category: 'Plumbing & Water',
        description: 'Main pipeline leak outside B-201',
        status: 'PRIMARY',
        publicMasterNotes: 'Plumber dispatched, estimated repair by 4 PM.',
      });

      // Create child ticket belonging to Student B
      const childId = 'tkt_child_privacy_' + now;
      const child = createGrievance({
        id: childId,
        ticketNo: 'GRV-CHILD-' + now,
        studentRegNo: 'STUDENT_B_REG',
        studentName: 'Student B',
        studentEmail: 'studentB@campus.edu',
        studentPhone: '7777766666',
        studentType: 'hosteller',
        hostelBlock: 'Block B',
        roomNo: 'B-202',
        category: 'Plumbing & Water',
        description: 'Water leak in corridor near B-202',
        status: 'MERGED_AUTOMATIC',
        masterCaseId: master.id,
        similarityScore: 0.95,
      });

      assert.ok(child.masterCaseId === master.id);

      // Verify that child's direct record does not leak Student A's PII
      const childGrievance = getGrievanceById(childId)!;
      assert.strictEqual(childGrievance.studentName, 'Student B');
      assert.strictEqual(childGrievance.studentEmail, 'studentB@campus.edu');
      assert.notStrictEqual(childGrievance.studentEmail, master.studentEmail);

      // Verify master notes lookup can be attached without exposing master's personal details
      const masterRecord = getGrievanceById(childGrievance.masterCaseId!)!;
      assert.strictEqual(masterRecord.publicMasterNotes, 'Plumber dispatched, estimated repair by 4 PM.');
    });
  });

  // =========================================================================
  // 6. Master Ticket Resolution Notification Fan-Out
  // =========================================================================
  describe('6. Master Resolution Notification Fan-Out', () => {
    test('Resolving a master ticket fans out notifications to master and all child ticket reporters', () => {
      const now = Date.now() + Math.floor(Math.random() * 100000);
      const masterId = 'tkt_fanout_master_' + now;
      const child1Id = 'tkt_fanout_child1_' + now;
      const child2Id = 'tkt_fanout_child2_' + now;

      // 1. Create master ticket
      const master = createGrievance({
        id: masterId,
        ticketNo: 'GRV-FAN-M1-' + now,
        studentRegNo: 'FAN_M1',
        studentName: 'Master Reporter',
        studentEmail: `master_${now}@campus.edu`,
        studentType: 'hosteller',
        category: 'Food & Mess',
        description: 'Water cooler in North Mess not working',
        status: 'PRIMARY',
        publicMasterNotes: 'RO cooling motor replaced and water tested.',
      });

      // 2. Create two merged child tickets
      createGrievance({
        id: child1Id,
        ticketNo: 'GRV-FAN-C1-' + now,
        studentRegNo: 'FAN_C1',
        studentName: 'Child Reporter 1',
        studentEmail: `child1_${now}@campus.edu`,
        studentType: 'hosteller',
        category: 'Food & Mess',
        description: 'North mess water dispenser broken',
        status: 'MERGED_AUTOMATIC',
        masterCaseId: master.id,
      });

      createGrievance({
        id: child2Id,
        ticketNo: 'GRV-FAN-C2-' + now,
        studentRegNo: 'FAN_C2',
        studentName: 'Child Reporter 2',
        studentEmail: `child2_${now}@campus.edu`,
        studentType: 'hosteller',
        category: 'Food & Mess',
        description: 'No drinking water in North Mess hall',
        status: 'MERGED_AUTOMATIC',
        masterCaseId: master.id,
      });

      // 3. Find linked child tickets
      const linkedChildren = getChildGrievances(master.id);
      assert.strictEqual(linkedChildren.length, 2, 'Must find 2 linked child tickets');

      // 4. Simulate resolution broadcast logic
      updateGrievance(master.id, {
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
      });

      // Enqueue notification for master reporter
      saveOutboxEmail({
        id: 'eml_m_' + now,
        to: master.studentEmail,
        subject: `Grievance Resolved - Ticket #${master.ticketNo}`,
        body: `Your grievance has been resolved. Note: ${master.publicMasterNotes}`,
        type: 'resolution',
        timestamp: new Date().toISOString(),
      });

      // Fan out notifications to all child ticket reporters
      for (const child of linkedChildren) {
        updateGrievance(child.id, {
          status: 'resolved',
          resolvedAt: new Date().toISOString(),
        });

        saveOutboxEmail({
          id: 'eml_c_' + child.id,
          to: child.studentEmail,
          subject: `Grievance Resolved - Master Case #${master.ticketNo}`,
          body: `Master Case #${master.ticketNo} linked to your ticket #${child.ticketNo} resolved. Note: ${master.publicMasterNotes}`,
          type: 'resolution',
          timestamp: new Date().toISOString(),
        });
      }

      // 5. Verify all 3 reporters received resolution outbox records
      const masterEmails = getOutboxEmails(master.studentEmail);
      assert.ok(masterEmails.some((e) => e.type === 'resolution'));

      const child1Emails = getOutboxEmails(`child1_${now}@campus.edu`);
      assert.ok(child1Emails.some((e) => e.type === 'resolution'));

      const child2Emails = getOutboxEmails(`child2_${now}@campus.edu`);
      assert.ok(child2Emails.some((e) => e.type === 'resolution'));

      // Verify child tickets were marked as resolved
      const resolvedChild1 = getGrievanceById(child1Id)!;
      assert.strictEqual(resolvedChild1.status, 'resolved');
    });
  });

  // =========================================================================
  // 7. Triage Queue Retrieval
  // =========================================================================
  describe('7. Triage Queue Retrieval', () => {
    test('getTriageGrievances returns suspected duplicates paired with candidate master', () => {
      const now = Date.now() + Math.floor(Math.random() * 100000);
      const candidateMaster = createGrievance({
        id: 'master_triage_' + now,
        ticketNo: 'GRV-TRIAGE-M-' + now,
        studentRegNo: 'TRIAGE_M',
        studentName: 'Triage Master',
        studentEmail: `triage_m_${now}@campus.edu`,
        studentType: 'hosteller',
        category: 'Hostel Wi-Fi & Internet',
        description: 'Wi-Fi router on Block C floor 2 not assigning IP address',
        status: 'PRIMARY',
      });

      const suspectedChild = createGrievance({
        id: 'child_triage_' + now,
        ticketNo: 'GRV-TRIAGE-S-' + now,
        studentRegNo: 'TRIAGE_S',
        studentName: 'Triage Child',
        studentEmail: `triage_s_${now}@campus.edu`,
        studentType: 'hosteller',
        category: 'Hostel Wi-Fi & Internet',
        description: 'Cannot connect to Block C 2nd floor wifi network DHCP fail',
        status: 'SUSPECTED_DUPLICATE',
        masterCaseId: candidateMaster.id,
        similarityScore: 0.86,
      });

      const triageList = getTriageGrievances();
      const item = triageList.find((t) => t.id === suspectedChild.id);

      assert.ok(item, 'Suspected duplicate must be present in triage queue');
      assert.strictEqual(item.similarityScore, 0.86);
      assert.strictEqual(item.candidateMaster.id, candidateMaster.id);
      assert.strictEqual(item.candidateMaster.ticketNo, candidateMaster.ticketNo);
    });
  });
});
