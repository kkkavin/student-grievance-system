/**
 * Vector Similarity Performance & Load Benchmark
 * Requirements:
 * - Measures 95th percentile and mean latency for 100 consecutive vector similarity queries against candidate pool.
 * - Enforces hard assertion: P95 latency MUST be strictly < 50ms.
 * - Logs benchmark timing metrics (Mean, Median, P90, P95, P99, Min, Max).
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEmbeddingVector,
  computeCosineSimilarity,
  VECTOR_DIMENSION,
} from '../../src/ml/deduplication.ts';
import { HISTORICAL_GRIEVANCES } from '../fixtures/timeseries_fixtures.ts';
import { DEDUP_FIXTURE_PAIRS } from '../fixtures/dedup_fixtures.ts';

describe('Vector Similarity Search Benchmark (<50ms P95 Latency)', () => {
  test('TC-BM-01: Vector similarity search across candidate pool executes with P95 < 50ms under 100-query load', () => {
    // 1. Build candidate pool of pre-computed embedding vectors from 200 historical fixtures
    console.log(`\n======================================================`);
    console.log(`📊 INITIALIZING VECTOR SIMILARITY BENCHMARK`);
    console.log(`======================================================`);

    const candidatePool: Array<{ id: string; vector: number[] }> = [];
    for (const h of HISTORICAL_GRIEVANCES) {
      const vec = generateEmbeddingVector(h.description, [
        h.category,
        h.hostelBlock || '',
        h.roomNo || '',
        h.locationTag,
      ]);
      candidatePool.push({ id: h.id, vector: vec });
    }

    console.log(`Candidate Pool Size: ${candidatePool.length} grievances`);
    console.log(`Vector Dimensions: ${VECTOR_DIMENSION} (sublinear TF-IDF + n-gram L2 normalized)`);

    // 2. Prepare 100 query vectors using fixture pairs and varied campus scenarios
    const queryVectors: Array<{ queryId: string; vector: number[] }> = [];
    const numQueries = 100;

    for (let i = 0; i < numQueries; i++) {
      const pair = DEDUP_FIXTURE_PAIRS[i % DEDUP_FIXTURE_PAIRS.length];
      const text = i % 2 === 0 ? pair.primaryTicket.description : pair.candidateTicket.description;
      const vec = generateEmbeddingVector(text, [pair.category]);
      queryVectors.push({ queryId: `Q-${i + 1}`, vector: vec });
    }

    // 3. Warm-up JIT compiler
    for (let w = 0; w < 10; w++) {
      for (const cand of candidatePool.slice(0, 50)) {
        computeCosineSimilarity(queryVectors[0].vector, cand.vector);
      }
    }

    // 4. Execute 100 consecutive similarity search queries against candidate pool
    const latenciesMs: number[] = [];

    for (let q = 0; q < numQueries; q++) {
      const query = queryVectors[q];
      const start = performance.now();

      let topScore = -1;
      let topMatchId: string | null = null;

      // Exhaustive cosine similarity scan across candidate pool
      for (let c = 0; c < candidatePool.length; c++) {
        const score = computeCosineSimilarity(query.vector, candidatePool[c].vector);
        if (score > topScore) {
          topScore = score;
          topMatchId = candidatePool[c].id;
        }
      }

      const elapsed = performance.now() - start;
      latenciesMs.push(elapsed);
    }

    // 5. Statistical Computations
    latenciesMs.sort((a, b) => a - b);
    const sum = latenciesMs.reduce((acc, v) => acc + v, 0);
    const mean = sum / latenciesMs.length;
    const min = latenciesMs[0];
    const max = latenciesMs[latenciesMs.length - 1];
    const p50 = latenciesMs[Math.floor(latenciesMs.length * 0.5)];
    const p90 = latenciesMs[Math.floor(latenciesMs.length * 0.9)];
    const p95 = latenciesMs[Math.floor(latenciesMs.length * 0.95)];
    const p99 = latenciesMs[Math.floor(latenciesMs.length * 0.99)];

    // 6. Formatted Logging
    console.log(`\n------------------------------------------------------`);
    console.log(`📈 BENCHMARK TIMING RESULTS (100 CONSECUTIVE QUERIES)`);
    console.log(`------------------------------------------------------`);
    console.log(`  Candidate Pool       : ${candidatePool.length} vectors`);
    console.log(`  Total Queries Tested : ${numQueries}`);
    console.log(`  Min Latency          : ${min.toFixed(4)} ms`);
    console.log(`  Mean Latency         : ${mean.toFixed(4)} ms`);
    console.log(`  Median (P50) Latency : ${p50.toFixed(4)} ms`);
    console.log(`  90th Percentile (P90): ${p90.toFixed(4)} ms`);
    console.log(`  95th Percentile (P95): ${p95.toFixed(4)} ms (Hard SLA: < 50.00 ms)`);
    console.log(`  99th Percentile (P99): ${p99.toFixed(4)} ms`);
    console.log(`  Max Latency          : ${max.toFixed(4)} ms`);
    console.log(`  Throughput           : ${(1000 / mean).toFixed(1)} queries/sec`);
    console.log(`------------------------------------------------------\n`);

    // 7. Enforce Hard Assertion: P95 MUST be strictly < 50ms
    assert.ok(
      p95 < 50.0,
      `P95 latency must be strictly < 50ms. Observed: ${p95.toFixed(4)}ms`,
    );
    assert.ok(
      mean < 25.0,
      `Mean latency must be well below 25ms. Observed: ${mean.toFixed(4)}ms`,
    );
  });
});
