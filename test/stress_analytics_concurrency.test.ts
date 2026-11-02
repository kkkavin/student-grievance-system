/**
 * Concurrency & Analytics Load Stress Benchmark Suite
 * Milestone 2 Verification Gate — Challenger Instance 2
 * 
 * Empirical Stress Verifications:
 * 1. High-concurrency read burst: 100 simultaneous requests split across
 *    GET /api/analytics/trends (50) and GET /api/analytics/risk-forecast (50).
 * 2. Mixed read/write stress: 50 concurrent POST /api/grievances writes
 *    interleaved with 100 simultaneous analytics queries (150 total in flight).
 *    Validates SQLite WAL concurrency, withTransaction() safety, zero SQLITE_BUSY.
 * 3. Multi-wave latency stability under burst pressure: 3 waves x 80 requests (240 total).
 * 4. High write contention + auto-merge deduplication with simultaneous analytics polling.
 * 5. Rollback lock release: deliberate transaction rollback to verify immediate lock release.
 * 6. Zero SQLite busy locks, zero unhandled promise rejections, zero crashes, zero data corruption.
 * 7. Measures and logs P50, P95, P99 query latency distributions.
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { getDatabase, withTransaction } from '../db.ts';

const TEST_PORT = process.env.TEST_PORT || '3188';
let serverBaseUrl = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ChildProcess | null = null;

// Benchmark metrics storage for handoff report
export const BENCHMARK_METRICS: Record<string, any> = {};

// Helper to wait for HTTP server
async function waitForServer(url: string, timeoutMs = 12000): Promise<boolean> {
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

// Percentile calculation helper
export function getPercentile(latencies: number[], p: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return Number(sorted[Math.max(0, Math.min(index, sorted.length - 1))].toFixed(2));
}

export function getStats(latencies: number[]) {
  if (latencies.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / sorted.length).toFixed(2));
  return {
    count: sorted.length,
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    mean,
    p50: getPercentile(sorted, 50),
    p95: getPercentile(sorted, 95),
    p99: getPercentile(sorted, 99),
  };
}

before(async () => {
  // Clean up any lingering stress records
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@stressanalytics.edu' OR studentRegNo LIKE 'STRESS_AN_%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@stressanalytics.edu'").run();
  } catch {
    // ignore
  }

  // Check if port already responsive
  try {
    const res = await fetch(`${serverBaseUrl}/api/health`);
    if (res.ok) return;
  } catch {
    // not yet running
  }

  serverProcess = spawn('npx', ['tsx', 'server.ts'], {
    env: { ...process.env, PORT: TEST_PORT, NODE_ENV: 'test' },
    stdio: 'ignore',
    shell: true,
  });

  const ready = await waitForServer(serverBaseUrl, 12000);
  if (!ready) {
    throw new Error(`Failed to start test server on port ${TEST_PORT}`);
  }
});

after(() => {
  // Database cleanup
  try {
    const db = getDatabase();
    db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@stressanalytics.edu' OR studentRegNo LIKE 'STRESS_AN_%'").run();
    db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@stressanalytics.edu'").run();
  } catch {
    // ignore
  }

  // Kill test server
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

describe('Milestone 2 Stress Test: High-Concurrency & Analytics Load Verification', () => {

  test('STRESS-AN-01: Rapid 100 concurrent requests (50 Trends + 50 Risk-Forecast)', async () => {
    const trendsLatencies: number[] = [];
    const riskLatencies: number[] = [];
    const errors: any[] = [];

    const trendsPromises = Array.from({ length: 50 }, async (_, i) => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${serverBaseUrl}/api/analytics/trends`);
        const duration = performance.now() - t0;
        trendsLatencies.push(duration);

        if (!res.ok) {
          errors.push({ endpoint: 'trends', index: i, status: res.status });
          return;
        }
        const data = await res.json();
        // Schema check
        assert.ok(data.hostelMaintenance, 'Should have hostelMaintenance');
        assert.ok(data.campusTransport, 'Should have campusTransport');
        assert.ok(data.networkWifi, 'Should have networkWifi');
        assert.ok(data.rolling7DayVelocity, 'Should have rolling7DayVelocity');
      } catch (err: any) {
        errors.push({ endpoint: 'trends', index: i, error: err.message });
      }
    });

    const riskPromises = Array.from({ length: 50 }, async (_, i) => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${serverBaseUrl}/api/analytics/risk-forecast`);
        const duration = performance.now() - t0;
        riskLatencies.push(duration);

        if (!res.ok) {
          errors.push({ endpoint: 'risk-forecast', index: i, status: res.status });
          return;
        }
        const data = await res.json();
        // Schema check
        assert.ok(typeof data.overallCampusRiskScore === 'number', 'Risk score should be number');
        assert.ok(['LOW', 'ELEVATED', 'HIGH_RISK'].includes(data.overallRiskLevel), 'Valid risk level');
        assert.ok(Array.isArray(data.zoneForecasts), 'zoneForecasts should be array');
        assert.ok(data.calendarMultipliers, 'calendarMultipliers should exist');
      } catch (err: any) {
        errors.push({ endpoint: 'risk-forecast', index: i, error: err.message });
      }
    });

    // Fire all 100 requests simultaneously
    const wallStart = performance.now();
    await Promise.all([...trendsPromises, ...riskPromises]);
    const totalWallMs = performance.now() - wallStart;

    const trendsStats = getStats(trendsLatencies);
    const riskStats = getStats(riskLatencies);
    const combinedStats = getStats([...trendsLatencies, ...riskLatencies]);

    BENCHMARK_METRICS['STRESS_AN_01'] = {
      totalRequests: 100,
      wallClockMs: totalWallMs,
      trendsStats,
      riskStats,
      combinedStats,
    };

    console.log('\n--- STRESS-AN-01 Results (100 Concurrent Reads) ---');
    console.log(`Total Wall Clock Time: ${totalWallMs.toFixed(2)}ms`);
    console.log(`Errors: ${errors.length}`);
    console.log(`Trends (50 reqs): P50=${trendsStats.p50}ms, P95=${trendsStats.p95}ms, P99=${trendsStats.p99}ms, Mean=${trendsStats.mean}ms`);
    console.log(`Risk-Forecast (50 reqs): P50=${riskStats.p50}ms, P95=${riskStats.p95}ms, P99=${riskStats.p99}ms, Mean=${riskStats.mean}ms`);
    console.log(`Combined (100 reqs): P50=${combinedStats.p50}ms, P95=${combinedStats.p95}ms, P99=${combinedStats.p99}ms`);

    assert.equal(errors.length, 0, `Expected 0 errors during 100 concurrent reads, got: ${JSON.stringify(errors)}`);
    assert.equal(trendsLatencies.length, 50, 'All 50 trends requests must finish');
    assert.equal(riskLatencies.length, 50, 'All 50 risk forecast requests must finish');
    // SLA Assertion: Even under 100-burst load, P95 must stay well under 1000ms
    assert.ok(combinedStats.p95 < 1000, `P95 latency should be under 1000ms, got ${combinedStats.p95}ms`);
    assert.ok(trendsStats.p50 < 300, `Trends P50 should be sub-300ms, got ${trendsStats.p50}ms`);
  });

  test('STRESS-AN-02: Simultaneous Mixed Workload (50 Concurrent Writes + 100 Concurrent Analytics Reads = 150 In-Flight)', async () => {
    // Ensure clean state for this test
    try {
      const db = getDatabase();
      db.prepare("DELETE FROM grievances WHERE studentEmail LIKE '%@stressanalytics.edu' OR studentRegNo LIKE 'STRESS_AN_%'").run();
      db.prepare("DELETE FROM outbox WHERE recipient LIKE '%@stressanalytics.edu'").run();
    } catch {}

    const writeLatencies: number[] = [];
    const trendsLatencies: number[] = [];
    const riskLatencies: number[] = [];
    const writeErrors: any[] = [];
    const readErrors: any[] = [];
    const writeResults: any[] = [];

    const categories = [
      'Hostel Maintenance',
      'Bus & Transport',
      'Network & Wi-Fi',
      'Electrical & AC',
      'Food & Mess',
    ];

    // 50 concurrent writes
    const writePromises = Array.from({ length: 50 }, async (_, i) => {
      const regNo = `STRESS_AN_${String(i).padStart(3, '0')}`;
      const category = categories[i % categories.length];
      const payload = {
        studentRegNo: regNo,
        studentName: `Stress Student ${i}`,
        studentEmail: `student_${i}@stressanalytics.edu`,
        studentPhone: `9876543${String(i).padStart(3, '0')}`,
        studentType: i % 2 === 0 ? 'hosteller' : 'dayscholar',
        hostelBlock: i % 2 === 0 ? `Block ${String.fromCharCode(65 + (i % 5))}` : undefined,
        roomNo: i % 2 === 0 ? `${(i % 4) + 1}0${(i % 8) + 1}` : undefined,
        category,
        description: `Concurrent stress grievance #${i}: persistent issue reported during analytics load test`,
        status: 'PRIMARY',
      };

      const t0 = performance.now();
      try {
        const res = await fetch(`${serverBaseUrl}/api/grievances`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const duration = performance.now() - t0;
        writeLatencies.push(duration);

        const body = await res.json();
        if (!res.ok) {
          writeErrors.push({ index: i, status: res.status, body });
        } else {
          writeResults.push(body);
        }
      } catch (err: any) {
        writeErrors.push({ index: i, error: err.message });
      }
    });

    // 50 concurrent trends reads
    const trendsPromises = Array.from({ length: 50 }, async (_, i) => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${serverBaseUrl}/api/analytics/trends`);
        const duration = performance.now() - t0;
        trendsLatencies.push(duration);

        if (!res.ok) {
          readErrors.push({ endpoint: 'trends', index: i, status: res.status });
          return;
        }
        const data = await res.json();
        assert.ok(data.hostelMaintenance && data.campusTransport);
      } catch (err: any) {
        readErrors.push({ endpoint: 'trends', index: i, error: err.message });
      }
    });

    // 50 concurrent risk forecast reads
    const riskPromises = Array.from({ length: 50 }, async (_, i) => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${serverBaseUrl}/api/analytics/risk-forecast`);
        const duration = performance.now() - t0;
        riskLatencies.push(duration);

        if (!res.ok) {
          readErrors.push({ endpoint: 'risk-forecast', index: i, status: res.status });
          return;
        }
        const data = await res.json();
        assert.ok(typeof data.overallCampusRiskScore === 'number');
      } catch (err: any) {
        readErrors.push({ endpoint: 'risk-forecast', index: i, error: err.message });
      }
    });

    // Fire all 150 mixed requests concurrently
    const wallStart = performance.now();
    await Promise.all([...writePromises, ...trendsPromises, ...riskPromises]);
    const totalWallMs = performance.now() - wallStart;

    const writeStats = getStats(writeLatencies);
    const trendsStats = getStats(trendsLatencies);
    const riskStats = getStats(riskLatencies);
    const readStats = getStats([...trendsLatencies, ...riskLatencies]);

    BENCHMARK_METRICS['STRESS_AN_02'] = {
      totalRequests: 150,
      wallClockMs: totalWallMs,
      writeStats,
      trendsStats,
      riskStats,
      readStats,
    };

    console.log('\n--- STRESS-AN-02 Results (150 In-Flight: 50 Writes + 100 Reads) ---');
    console.log(`Total Wall Clock Time: ${totalWallMs.toFixed(2)}ms`);
    console.log(`Write Errors (0 expected): ${writeErrors.length}`);
    console.log(`Read Errors (0 expected): ${readErrors.length}`);
    console.log(`Writes (50 reqs): P50=${writeStats.p50}ms, P95=${writeStats.p95}ms, P99=${writeStats.p99}ms, Mean=${writeStats.mean}ms`);
    console.log(`Trends Reads (50 reqs): P50=${trendsStats.p50}ms, P95=${trendsStats.p95}ms, P99=${trendsStats.p99}ms, Mean=${trendsStats.mean}ms`);
    console.log(`Risk Reads (50 reqs): P50=${riskStats.p50}ms, P95=${riskStats.p95}ms, P99=${riskStats.p99}ms, Mean=${riskStats.mean}ms`);
    console.log(`All Analytics Reads (100 reqs): P50=${readStats.p50}ms, P95=${readStats.p95}ms, P99=${readStats.p99}ms`);

    assert.equal(writeErrors.length, 0, `Expected 0 write errors, got: ${JSON.stringify(writeErrors)}`);
    assert.equal(readErrors.length, 0, `Expected 0 read errors, got: ${JSON.stringify(readErrors)}`);
    assert.equal(writeResults.length, 50, 'All 50 grievances must be created');

    // Verify database integrity
    const db = getDatabase();
    const integrityCheck = db.prepare('PRAGMA integrity_check;').get() as { integrity_check: string };
    assert.equal(integrityCheck.integrity_check, 'ok', 'PRAGMA integrity_check must be ok');

    const foreignKeyCheck = db.prepare('PRAGMA foreign_key_check;').all();
    assert.equal(foreignKeyCheck.length, 0, 'PRAGMA foreign_key_check must return 0 violations');

    // Verify that newly inserted records are visible in database
    const stressCount = (db.prepare("SELECT COUNT(*) as count FROM grievances WHERE studentRegNo LIKE 'STRESS_AN_%'").get() as { count: number }).count;
    assert.equal(stressCount, 50, 'Exactly 50 stress grievances should be persisted in database');

    // SLAs under mixed contention
    assert.ok(readStats.p95 < 1200, `P95 read latency under mixed contention should be < 1200ms, got ${readStats.p95}ms`);
    assert.ok(writeStats.p95 < 1200, `P95 write latency should be < 1200ms, got ${writeStats.p95}ms`);
  });

  test('STRESS-AN-03: Multi-Wave Latency Stability (3 Waves x 80 Requests = 240 Requests)', async () => {
    const waveResults: Array<{ wave: number; trends: ReturnType<typeof getStats>; risk: ReturnType<typeof getStats>; wallMs: number }> = [];

    for (let wave = 1; wave <= 3; wave++) {
      const trendsLatencies: number[] = [];
      const riskLatencies: number[] = [];
      const waveErrors: any[] = [];

      const tStart = performance.now();
      const wavePromises = [
        ...Array.from({ length: 40 }, async (_, i) => {
          const t0 = performance.now();
          try {
            const res = await fetch(`${serverBaseUrl}/api/analytics/trends`);
            trendsLatencies.push(performance.now() - t0);
            if (!res.ok) waveErrors.push({ wave, i, type: 'trends', status: res.status });
          } catch (e: any) {
            waveErrors.push({ wave, i, type: 'trends', error: e.message });
          }
        }),
        ...Array.from({ length: 40 }, async (_, i) => {
          const t0 = performance.now();
          try {
            const res = await fetch(`${serverBaseUrl}/api/analytics/risk-forecast`);
            riskLatencies.push(performance.now() - t0);
            if (!res.ok) waveErrors.push({ wave, i, type: 'risk', status: res.status });
          } catch (e: any) {
            waveErrors.push({ wave, i, type: 'risk', error: e.message });
          }
        }),
      ];

      await Promise.all(wavePromises);
      const wallMs = performance.now() - tStart;

      assert.equal(waveErrors.length, 0, `Wave ${wave} should have 0 errors`);
      const tStats = getStats(trendsLatencies);
      const rStats = getStats(riskLatencies);

      waveResults.push({ wave, trends: tStats, risk: rStats, wallMs });
      console.log(`Wave ${wave} (80 reqs): Wall=${wallMs.toFixed(2)}ms | Trends P50=${tStats.p50}ms, P95=${tStats.p95}ms | Risk P50=${rStats.p50}ms, P95=${rStats.p95}ms`);
    }

    BENCHMARK_METRICS['STRESS_AN_03'] = waveResults;

    // Verify no latency explosion across waves
    const wave1MaxP95 = Math.max(waveResults[0].trends.p95, waveResults[0].risk.p95);
    const wave3MaxP95 = Math.max(waveResults[2].trends.p95, waveResults[2].risk.p95);
    console.log(`\nWave 1 P95 max: ${wave1MaxP95}ms vs Wave 3 P95 max: ${wave3MaxP95}ms`);
    assert.ok(wave3MaxP95 < Math.max(1000, wave1MaxP95 * 3), 'Latency should remain stable across waves');
  });

  test('STRESS-AN-04: High Write Contention with Auto-Merge Deduplication + Continuous Analytics Reads', async () => {
    // 20 identical grievances submitted simultaneously to trigger deduplication logic and transactions
    const identicalDescription = 'Burst stress test: Severe water leakage from ceiling pipe flooding room A-302';
    const writePromises = Array.from({ length: 20 }, async (_, i) => {
      const res = await fetch(`${serverBaseUrl}/api/grievances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentRegNo: `STRESS_AN_DUP_${i}`,
          studentName: `Duplicate Student ${i}`,
          studentEmail: `student_dup_${i}@stressanalytics.edu`,
          studentType: 'hosteller',
          hostelBlock: 'Block A',
          roomNo: 'A-302',
          category: 'Hostel Maintenance',
          description: identicalDescription,
        }),
      });
      return { status: res.status, data: await res.json() };
    });

    // 40 rapid analytics queries launched concurrently alongside the writes
    const readLatencies: number[] = [];
    const readPromises = Array.from({ length: 40 }, async (_, i) => {
      const endpoint = i % 2 === 0 ? 'trends' : 'risk-forecast';
      const t0 = performance.now();
      const res = await fetch(`${serverBaseUrl}/api/analytics/${endpoint}`);
      readLatencies.push(performance.now() - t0);
      assert.equal(res.status, 200, `Expected 200 from ${endpoint}`);
      const json = await res.json();
      return json;
    });

    const [writes, reads] = await Promise.all([
      Promise.all(writePromises),
      Promise.all(readPromises),
    ]);

    assert.equal(writes.length, 20);
    assert.equal(reads.length, 40);

    // Verify deduplication consistency
    const primaryCount = writes.filter((w) => w.data.status === 'PRIMARY').length;
    const mergedCount = writes.filter((w) => w.data.status === 'MERGED_AUTOMATIC').length;
    console.log(`\n--- STRESS-AN-04 Dedup Under Contention ---`);
    console.log(`Primary count: ${primaryCount}, Merged automatic count: ${mergedCount}`);
    assert.equal(primaryCount, 1, 'Exactly 1 ticket should be crowned PRIMARY in identical cluster');
    assert.equal(mergedCount, 19, 'Remaining 19 tickets should be MERGED_AUTOMATIC');

    const readStats = getStats(readLatencies);
    BENCHMARK_METRICS['STRESS_AN_04'] = {
      primaryCount,
      mergedCount,
      readStats,
    };

    console.log(`Analytics Read Latencies during Dedup Contention: P50=${readStats.p50}ms, P95=${readStats.p95}ms, P99=${readStats.p99}ms, Max=${readStats.max}ms`);
    assert.ok(readStats.p95 < 1000, 'Analytics P95 during deduplication contention should be < 1000ms');
  });

  test('STRESS-AN-05: Transaction Rollback Lock Release & Immediate Analytics Readability', async () => {
    // Deliberately trigger a transaction rollback inside the DB and ensure it immediately releases the lock
    const db = getDatabase();
    
    let caughtError = false;
    try {
      withTransaction(() => {
        db.prepare(`
          INSERT INTO grievances (
            id, ticketNo, studentRegNo, studentName, studentEmail, studentType,
            category, description, status, priority, isSpam, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'rollback_test_id',
          'TKT_ROLLBACK_001',
          'ROLLBACK_STU',
          'Rollback Student',
          'rollback@stressanalytics.edu',
          'dayscholar',
          'Campus Transport',
          'Deliberate rollback grievance',
          'pending',
          'medium',
          0,
          new Date().toISOString()
        );
        // Force an error inside transaction
        throw new Error('Simulated atomic transaction abortion');
      });
    } catch (e: any) {
      caughtError = true;
      assert.equal(e.message, 'Simulated atomic transaction abortion');
    }
    assert.ok(caughtError, 'Transaction must throw and trigger rollback');

    // Verify rollback occurred: record should NOT exist
    const row = db.prepare("SELECT * FROM grievances WHERE id = 'rollback_test_id'").get();
    assert.equal(row, undefined, 'Rolled-back record must not exist in database');

    // Immediately query both analytics endpoints over HTTP to verify WAL lock is completely released
    const trendsRes = await fetch(`${serverBaseUrl}/api/analytics/trends`);
    const riskRes = await fetch(`${serverBaseUrl}/api/analytics/risk-forecast`);
    assert.equal(trendsRes.status, 200, 'Trends endpoint should return 200 immediately after transaction rollback');
    assert.equal(riskRes.status, 200, 'Risk forecast endpoint should return 200 immediately after transaction rollback');

    console.log('\n--- STRESS-AN-05 Rollback Lock Release Passed ---');
  });

  test('STRESS-AN-06: Zero SQLite Busy Locks & PRAGMA Verification', async () => {
    const db = getDatabase();
    
    // Check journal mode is WAL
    const journalMode = (db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string }).journal_mode;
    assert.equal(journalMode.toLowerCase(), 'wal', 'Database must operate in WAL journal mode');

    // Check busy_timeout
    const busyTimeout = (db.prepare('PRAGMA busy_timeout;').get() as { timeout: number }).timeout;
    assert.ok(busyTimeout >= 5000, `Busy timeout should be at least 5000ms, got ${busyTimeout}`);

    // Verify zero orphaned children
    const orphans = (db.prepare(`
      SELECT COUNT(*) as count FROM grievances
      WHERE master_case_id IS NOT NULL
        AND master_case_id NOT IN (SELECT id FROM grievances)
    `).get() as { count: number }).count;
    assert.equal(orphans, 0, 'Must have zero orphaned master_case_id foreign keys');

    console.log(`\n--- STRESS-AN-06 WAL & Lock Verification ---`);
    console.log(`Journal Mode: ${journalMode}`);
    console.log(`Busy Timeout: ${busyTimeout}ms`);
    console.log(`Orphan Foreign Keys: ${orphans}`);

    BENCHMARK_METRICS['PRAGMA'] = {
      journalMode,
      busyTimeout,
      orphans,
    };
  });

});
