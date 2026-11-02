/**
 * End-to-End Campus Analytics & Risk Forecasting Test Suite
 * Tests Multidimensional Rollup Aggregations and Monthly Risk Forecasting Engine:
 * - Hostel Maintenance Rollups (by block, floor, issue type, consolidation ratio)
 * - Campus Transport Status & Surges (by route, delay frequency, capacity surge, status NORMAL/SURGE/DELAYED)
 * - Network/Wi-Fi Incident Density Matrix (AP controller, floor switch, departmental block, density levels)
 * - 7-Day Rolling Velocity Trends
 * - Monthly Risk Forecasting Engine (1-100 score bounds, qualitative levels LOW/ELEVATED/HIGH_RISK, calendar weights)
 * - Predictive Explanation Drivers & Actionable Recommendations
 * - Contract verification against GET /api/analytics/trends and GET /api/analytics/risk-forecast
 */

import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import {
  HISTORICAL_GRIEVANCES,
  HistoricalGrievance,
  getGrievancesByMonth,
  getGrievancesByHostelBlock,
  getGrievancesByRoute,
  getGrievancesByDepartment,
} from '../fixtures/timeseries_fixtures.ts';

const TEST_PORT = process.env.TEST_PORT || '3099';
let serverBaseUrl = `http://127.0.0.1:${TEST_PORT}`;
let serverProcess: ChildProcess | null = null;

// Helper to wait for HTTP server
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

// ============================================================================
// PRODUCTION ANALYTICS ENGINES INTEGRATION
// ============================================================================

import {
  computeHostelMaintenanceRollup,
  computeTransportRollup,
  computeWifiDensityMatrix,
} from '../../src/services/analyticsRollup.ts';
import {
  computeRiskScore,
} from '../../src/services/riskForecasting.ts';

export {
  computeHostelMaintenanceRollup,
  computeTransportRollup,
  computeWifiDensityMatrix,
  computeRiskScore,
};


// ============================================================================
// TESTS: MULTIDIMENSIONAL ROLLUPS
// ============================================================================
describe('E2E Analytics: Multidimensional Rollup Aggregations', () => {
  test('TC-AN-01: Hostel Maintenance rollups compute Block, Floor, and Issue Type aggregations', () => {
    assert.strictEqual(HISTORICAL_GRIEVANCES.length, 200, 'Historical fixture count must be exactly 200');

    const rollups = computeHostelMaintenanceRollup(HISTORICAL_GRIEVANCES);

    // Block assertions
    assert.ok(rollups.byBlock.length >= 5, 'Must cover Blocks A, B, C, D, E');
    for (const b of rollups.byBlock) {
      assert.ok(b.total > 0, `Block ${b.block} total grievances must be > 0`);
      assert.ok(b.resolved >= 0, 'Resolved count must be non-negative');
      assert.ok(b.pending >= 0, 'Pending count must be non-negative');
      assert.ok(b.consolidationRatio >= 0 && b.consolidationRatio <= 1.0, 'Consolidation ratio must be bounded in [0.0, 1.0]');
    }

    // Floor assertions
    assert.ok(rollups.byFloor.length > 0, 'Floor breakdown must be populated');
    for (const f of rollups.byFloor) {
      assert.ok(f.floor >= 1 && f.floor <= 4, 'Floor numbers must be between 1 and 4');
      assert.ok(f.total > 0, 'Total grievances per floor must be > 0');
    }

    // Issue Type assertions
    assert.ok(rollups.byIssueType.length > 0, 'Issue types breakdown must be populated');
    for (const it of rollups.byIssueType) {
      assert.ok(['plumbing', 'power', 'cleaning', 'repairs', 'other'].includes(it.issueType), 'Issue type must be valid category');
      assert.ok(it.count > 0, 'Issue count must be positive');
      assert.ok(it.avgResolutionHours >= 0, 'Resolution hours must be positive');
    }
  });

  test('TC-AN-02: Campus Transport rollups evaluate delay percentage and capacity surges', () => {
    const rollups = computeTransportRollup(HISTORICAL_GRIEVANCES);

    assert.ok(rollups.byRoute.length > 0, 'Transport routes must be aggregated');
    for (const r of rollups.byRoute) {
      assert.ok(r.route.startsWith('Route'), 'Route must be formatted as Route X');
      assert.ok(r.delayFrequencyPct >= 0 && r.delayFrequencyPct <= 100, 'Delay percentage must be bounded [0, 100]');
      assert.ok(['NORMAL', 'SURGE', 'DELAYED'].includes(r.status), 'Status must be strictly NORMAL, SURGE, or DELAYED');
    }
    assert.ok(rollups.peakCongestionStops.length > 0, 'Must identify peak congestion stops');
  });

  test('TC-AN-03: Network/Wi-Fi Incident Density Matrix calculates AP controller saturation', () => {
    const rollups = computeWifiDensityMatrix(HISTORICAL_GRIEVANCES);

    assert.ok(rollups.densityMatrix.length > 0, 'Density matrix must have entries');
    for (const d of rollups.densityMatrix) {
      assert.ok(d.departmentBlock, 'Must specify departmental block');
      assert.ok(d.apController.startsWith('AP-'), 'AP controller must follow AP- naming pattern');
      assert.ok(d.switchId.startsWith('SW-'), 'Switch ID must follow SW- naming pattern');
      assert.ok(d.incidentCount > 0, 'Incident count must be positive');
      assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(d.densityLevel), 'Density level must be strictly LOW, MEDIUM, or HIGH');
    }
  });
});

// ============================================================================
// TESTS: RISK FORECASTING ENGINE
// ============================================================================
describe('E2E Analytics: Monthly Risk Forecasting Engine', () => {
  test('TC-RF-01: Score bounds [1, 100] and qualitative indicator classification', () => {
    // 1. Extreme low conditions
    const low = computeRiskScore(2, 5, 0, 0.5, 0.35, 0);
    assert.ok(low.score >= 1 && low.score <= 100, 'Score must be clamped between 1 and 100');
    assert.ok(low.score < 40, 'Low volume must yield score < 40');
    assert.strictEqual(low.level, 'LOW', 'Score < 40 must map to qualitative level LOW');

    // 2. Elevated mid-semester conditions
    const elevated = computeRiskScore(15, 14, 5, 2.0, 1.30, 2);
    assert.ok(elevated.score >= 40 && elevated.score <= 74, 'Mid-level volume must yield score 40-74');
    assert.strictEqual(elevated.level, 'ELEVATED', 'Score 40-74 must map to qualitative level ELEVATED');

    // 3. Extreme high monsoon + exam surge conditions
    const high = computeRiskScore(35, 10, 25, 4.5, 1.65, 12);
    assert.ok(high.score >= 75 && high.score <= 100, 'Surge conditions must yield score >= 75');
    assert.strictEqual(high.level, 'HIGH_RISK', 'Score >= 75 must map to qualitative level HIGH_RISK');
  });

  test('TC-RF-02: Academic calendar weight multipliers affect risk severity', () => {
    const baseVolume = 20;
    const prevVolume = 15;
    const unresolved = 8;
    const avgAge = 2;
    const urgent = 4;

    // Standard baseline month (calendar factor 1.0)
    const base = computeRiskScore(baseVolume, prevVolume, unresolved, avgAge, 1.0, urgent);

    // Monsoon surge month (calendar factor 1.65)
    const monsoon = computeRiskScore(baseVolume, prevVolume, unresolved, avgAge, 1.65, urgent);

    assert.ok(monsoon.score > base.score, 'Monsoon multiplier 1.65x must produce strictly higher risk score than baseline');
    assert.ok(monsoon.primaryDriver.includes('Monsoon'), 'Primary driver must reflect monsoon weather surge');
  });

  test('TC-RF-03: Predictive explanation driver generation and explainability', () => {
    // Backlog heavy case
    const backlogHeavy = computeRiskScore(10, 10, 30, 8.0, 1.0, 1);
    assert.ok(backlogHeavy.primaryDriver.includes('backlog') || backlogHeavy.primaryDriver.includes('aging'), 'Must detect backlog aging driver');

    // Urgency heavy case
    const urgencyHeavy = computeRiskScore(15, 15, 2, 1.0, 1.0, 14);
    assert.ok(urgencyHeavy.primaryDriver.includes('urgent') || urgencyHeavy.primaryDriver.includes('velocity'), 'Must detect urgency or velocity driver');
  });

  test('TC-RF-04: API endpoint contracts (GET /api/analytics/trends & /api/analytics/risk-forecast)', async () => {
    const trendsRes = await fetch(`${serverBaseUrl}/api/analytics/trends`);
    assert.strictEqual(trendsRes.status, 200, 'GET /api/analytics/trends must return HTTP 200');
    const trends = await trendsRes.json();
    assert.ok(trends.hostelMaintenance, 'Trends payload must have hostelMaintenance');
    assert.ok(trends.hostelMaintenance.byBlock.length >= 5, 'Must cover Blocks A-E');
    assert.ok(trends.hostelMaintenance.byFloor.length > 0, 'Must cover floors');
    assert.ok(trends.hostelMaintenance.byIssueType.length > 0, 'Must cover issue types');
    assert.ok(trends.campusTransport, 'Trends payload must have campusTransport');
    assert.ok(trends.campusTransport.byRoute.length > 0, 'Transport routes must be aggregated');
    assert.ok(trends.campusTransport.peakCongestionStops.length > 0, 'Peak congestion stops must be present');
    assert.ok(trends.networkWifi, 'Trends payload must have networkWifi');
    assert.ok(trends.networkWifi.densityMatrix.length > 0, 'Network density matrix must be populated');
    assert.ok(Array.isArray(trends.rolling7DayVelocity), 'Rolling 7-day velocity must be an array');
    assert.ok(trends.rolling7DayVelocity.length > 0, 'Rolling 7-day velocity must have entries');

    const riskRes = await fetch(`${serverBaseUrl}/api/analytics/risk-forecast`);
    assert.strictEqual(riskRes.status, 200, 'GET /api/analytics/risk-forecast must return HTTP 200');
    const risk = await riskRes.json();
    assert.ok(risk.overallCampusRiskScore >= 1 && risk.overallCampusRiskScore <= 100);
    assert.ok(['LOW', 'ELEVATED', 'HIGH_RISK'].includes(risk.overallRiskLevel));
    assert.ok(risk.academicTermPhase, 'Must provide academic term phase');
    assert.ok(risk.calendarMultipliers, 'Must provide calendar multipliers');
    assert.strictEqual(typeof risk.calendarMultipliers.monsoonFactor, 'number');
    assert.strictEqual(typeof risk.calendarMultipliers.examFactor, 'number');
    assert.strictEqual(typeof risk.calendarMultipliers.semesterStartFactor, 'number');
    assert.ok(Array.isArray(risk.zoneForecasts) && risk.zoneForecasts.length > 0, 'Zone forecasts must be populated');
    for (const z of risk.zoneForecasts) {
      assert.ok(z.riskScore >= 1 && z.riskScore <= 100, `Zone ${z.zone} risk score must be bounded [1, 100]`);
      assert.ok(['LOW', 'ELEVATED', 'HIGH_RISK'].includes(z.riskLevel));
      assert.ok(z.primaryDriver, `Zone ${z.zone} must have a primary driver string`);
      assert.ok(z.actionableRecommendation, `Zone ${z.zone} must have actionable recommendation`);
      assert.ok(['low', 'medium', 'urgent'].includes(z.urgencyPriority));
    }
  });
});
