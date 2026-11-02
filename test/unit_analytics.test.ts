/**
 * Unit Tests for Campus Analytics Rollups & Monthly Risk Forecasting Engine
 * Tests multidimensional aggregation formulas, boundary values, calendar multipliers,
 * risk score calculations, explainability drivers, and edge cases.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  inferIssueType,
  inferTransportIncidentType,
  computeHostelMaintenanceRollup,
  computeTransportRollup,
  computeWifiDensityMatrix,
  computeRolling7DayVelocity,
  getCampusTrendAnalytics,
} from '../src/services/analyticsRollup.ts';
import {
  getAcademicCalendarFactors,
  computeRiskScore,
  getZoneRecommendation,
  computeRiskForecast,
  getCampusRiskForecast,
} from '../src/services/riskForecasting.ts';
import { HISTORICAL_GRIEVANCES } from './fixtures/timeseries_fixtures.ts';

describe('Unit Tests: Heuristic Classifiers & Feature Inference', () => {
  test('inferIssueType maps descriptions to canonical maintenance types', () => {
    assert.strictEqual(inferIssueType('Drainage pipe leaking under sink', 'Hostel Maintenance'), 'plumbing');
    assert.strictEqual(inferIssueType('Ceiling rainwater seepage in room 304', 'Hostel Maintenance'), 'plumbing');
    assert.strictEqual(inferIssueType('Switchboard sparking and fuse blown', 'Electrical'), 'power');
    assert.strictEqual(inferIssueType('Ceiling fan burnt out, no air', 'Hostel Maintenance'), 'power');
    assert.strictEqual(inferIssueType('Trash can not cleared, dusty corridor', 'Hostel Maintenance'), 'cleaning');
    assert.strictEqual(inferIssueType('Water dispenser dirty with bad smell', 'Hostel Maintenance'), 'cleaning');
    assert.strictEqual(inferIssueType('Broken door latch and damaged cupboard hinge', 'Hostel Maintenance'), 'repairs');
    assert.strictEqual(inferIssueType('Window glass cracked and rattling', 'Hostel Maintenance'), 'repairs');
    // Edge case / empty strings fallback
    assert.strictEqual(inferIssueType('', ''), 'repairs');
    assert.strictEqual(inferIssueType(undefined, undefined), 'repairs');
  });

  test('inferTransportIncidentType classifies delays, maintenance, and surges', () => {
    assert.strictEqual(inferTransportIncidentType('Bus was 45 minutes late due to traffic'), 'delay');
    assert.strictEqual(inferTransportIncidentType('Tyre puncture on bypass road, bus stalled'), 'maintenance');
    assert.strictEqual(inferTransportIncidentType('Severe engine smoke and overheating'), 'maintenance');
    assert.strictEqual(inferTransportIncidentType('Overcrowded bus, students unable to board morning trip'), 'capacity_surge');
    assert.strictEqual(inferTransportIncidentType('Huge morning rush, students left standing'), 'capacity_surge');
    // Default fallback
    assert.strictEqual(inferTransportIncidentType(''), 'delay');
    assert.strictEqual(inferTransportIncidentType(undefined), 'delay');
  });
});

describe('Unit Tests: Multidimensional Hostel Maintenance Rollups', () => {
  test('computeHostelMaintenanceRollup handles empty and null inputs safely', () => {
    const emptyResult = computeHostelMaintenanceRollup([]);
    assert.deepStrictEqual(emptyResult.byBlock, []);
    assert.deepStrictEqual(emptyResult.byFloor, []);
    assert.deepStrictEqual(emptyResult.byIssueType, []);

    const nullResult = computeHostelMaintenanceRollup(null as any);
    assert.deepStrictEqual(nullResult.byBlock, []);
  });

  test('computeHostelMaintenanceRollup accurately aggregates blocks, floors, and consolidation ratios', () => {
    const sampleTickets = [
      {
        id: 'h1',
        category: 'Hostel Maintenance',
        hostelBlock: 'Block A',
        roomNo: 'A-101',
        status: 'PRIMARY',
        createdAt: '2026-10-01T08:00:00Z',
      },
      {
        id: 'h2',
        category: 'Hostel Maintenance',
        hostelBlock: 'Block A',
        roomNo: 'A-102',
        status: 'MERGED_AUTOMATIC',
        createdAt: '2026-10-01T09:00:00Z',
      },
      {
        id: 'h3',
        category: 'Hostel Maintenance',
        hostelBlock: 'Block A',
        roomNo: 'A-201',
        status: 'resolved',
        createdAt: '2026-10-01T10:00:00Z',
        resolvedAt: '2026-10-02T10:00:00Z', // 24 hours
      },
      {
        id: 'h4',
        category: 'Hostel Maintenance',
        hostelBlock: 'Block B',
        roomNo: 'B-305',
        status: 'pending',
        createdAt: '2026-10-01T11:00:00Z',
        issueType: 'plumbing',
      },
    ];

    const rollup = computeHostelMaintenanceRollup(sampleTickets);

    // Block A: 3 total, 1 pending (PRIMARY), 1 resolved, 1 merged
    const blockA = rollup.byBlock.find((b) => b.block === 'Block A');
    assert.ok(blockA, 'Block A rollup must exist');
    assert.strictEqual(blockA.total, 3);
    assert.strictEqual(blockA.resolved, 1);
    assert.strictEqual(blockA.pending, 1);
    // consolidationRatio = 1 merged / 3 total = 0.33
    assert.strictEqual(blockA.consolidationRatio, 0.33);

    // Block B: 1 total, 1 pending
    const blockB = rollup.byBlock.find((b) => b.block === 'Block B');
    assert.ok(blockB, 'Block B rollup must exist');
    assert.strictEqual(blockB.total, 1);
    assert.strictEqual(blockB.pending, 1);
    assert.strictEqual(blockB.consolidationRatio, 0);

    // Floors: Block A Floor 1 (2 tickets), Block A Floor 2 (1 ticket), Block B Floor 3 (1 ticket)
    assert.strictEqual(rollup.byFloor.length, 3);
    const floorA1 = rollup.byFloor.find((f) => f.block === 'Block A' && f.floor === 1);
    assert.ok(floorA1);
    assert.strictEqual(floorA1.total, 2);

    // Resolution hours
    const repairsIssue = rollup.byIssueType.find((i) => i.issueType === 'repairs');
    assert.ok(repairsIssue);
    assert.ok(repairsIssue.avgResolutionHours >= 20);
  });
});

describe('Unit Tests: Campus Transport Rollups', () => {
  test('computeTransportRollup calculates delay percentage and surge status thresholds', () => {
    const transportTickets = [
      // Route 1: 4 tickets, 2 delays (50%), 0 surges -> status DELAYED
      { category: 'Bus & Transport', transportRoute: 'Route 1', transportIncidentType: 'delay' },
      { category: 'Bus & Transport', transportRoute: 'Route 1', transportIncidentType: 'delay' },
      { category: 'Bus & Transport', transportRoute: 'Route 1', transportIncidentType: 'maintenance' },
      { category: 'Bus & Transport', transportRoute: 'Route 1', transportIncidentType: 'maintenance' },

      // Route 2: 3 tickets, 2 surges -> status SURGE
      { category: 'Bus & Transport', transportRoute: 'Route 2', transportIncidentType: 'capacity_surge' },
      { category: 'Bus & Transport', transportRoute: 'Route 2', transportIncidentType: 'capacity_surge' },
      { category: 'Bus & Transport', transportRoute: 'Route 2', transportIncidentType: 'maintenance' },

      // Route 3: 2 tickets, 0 delays, 0 surges -> status NORMAL
      { category: 'Bus & Transport', transportRoute: 'Route 3', transportIncidentType: 'maintenance' },
      { category: 'Bus & Transport', transportRoute: 'Route 3', transportIncidentType: 'maintenance' },
    ];

    const rollup = computeTransportRollup(transportTickets);
    assert.strictEqual(rollup.byRoute.length, 3);

    const r1 = rollup.byRoute.find((r) => r.route === 'Route 1')!;
    assert.strictEqual(r1.delayFrequencyPct, 50);
    assert.strictEqual(r1.maintenanceIncidents, 2);
    assert.strictEqual(r1.status, 'DELAYED');

    const r2 = rollup.byRoute.find((r) => r.route === 'Route 2')!;
    assert.strictEqual(r2.capacitySurgeIndex, 20); // 2 surges * 10
    assert.strictEqual(r2.status, 'SURGE');

    const r3 = rollup.byRoute.find((r) => r.route === 'Route 3')!;
    assert.strictEqual(r3.delayFrequencyPct, 0);
    assert.strictEqual(r3.status, 'NORMAL');

    assert.ok(rollup.peakCongestionStops.includes('Bypass Junction'));
  });
});

describe('Unit Tests: Wi-Fi Density Matrix & Saturation', () => {
  test('computeWifiDensityMatrix classifies LOW, MEDIUM, and HIGH density levels', () => {
    const wifiTickets: any[] = [];
    // 9 tickets for CSE AP-1 -> HIGH (>= 8)
    for (let i = 0; i < 9; i++) {
      wifiTickets.push({ category: 'Network & Wi-Fi', departmentBlock: 'CSE', apController: 'AP-CSE-F1-01', switchId: 'SW-CSE-F1' });
    }
    // 5 tickets for ECE AP-1 -> MEDIUM (>= 4 and < 8)
    for (let i = 0; i < 5; i++) {
      wifiTickets.push({ category: 'Network & Wi-Fi', departmentBlock: 'ECE', apController: 'AP-ECE-F1-01', switchId: 'SW-ECE-F1' });
    }
    // 2 tickets for MECH AP-1 -> LOW (< 4)
    for (let i = 0; i < 2; i++) {
      wifiTickets.push({ category: 'Network & Wi-Fi', departmentBlock: 'MECH', apController: 'AP-MECH-F1-01', switchId: 'SW-MECH-F1' });
    }

    const rollup = computeWifiDensityMatrix(wifiTickets);
    assert.strictEqual(rollup.densityMatrix.length, 3);

    const cseNode = rollup.densityMatrix.find((d) => d.departmentBlock === 'CSE')!;
    assert.strictEqual(cseNode.incidentCount, 9);
    assert.strictEqual(cseNode.densityLevel, 'HIGH');

    const eceNode = rollup.densityMatrix.find((d) => d.departmentBlock === 'ECE')!;
    assert.strictEqual(eceNode.incidentCount, 5);
    assert.strictEqual(eceNode.densityLevel, 'MEDIUM');

    const mechNode = rollup.densityMatrix.find((d) => d.departmentBlock === 'MECH')!;
    assert.strictEqual(mechNode.incidentCount, 2);
    assert.strictEqual(mechNode.densityLevel, 'LOW');
  });
});

describe('Unit Tests: Rolling 7-Day Velocity', () => {
  test('computeRolling7DayVelocity populates continuous 7-day timeline', () => {
    const refDate = new Date('2026-10-15T12:00:00Z');
    const sampleTickets = [
      { category: 'Hostel Maintenance', createdAt: '2026-10-15T09:00:00Z' },
      { category: 'Hostel Maintenance', createdAt: '2026-10-15T10:00:00Z' },
      { category: 'Bus & Transport', createdAt: '2026-10-14T08:00:00Z' },
    ];

    const velocity = computeRolling7DayVelocity(sampleTickets, refDate);
    assert.ok(velocity.length >= 7, 'Must generate entries across categories');

    const oct15Hostel = velocity.find((v) => v.date === '2026-10-15' && v.category === 'Hostel Maintenance');
    assert.ok(oct15Hostel);
    assert.strictEqual(oct15Hostel.count, 2);

    const oct14Transport = velocity.find((v) => v.date === '2026-10-14' && v.category === 'Bus & Transport');
    assert.ok(oct14Transport);
    assert.strictEqual(oct14Transport.count, 1);
  });
});

describe('Unit Tests: Academic Calendar Multipliers', () => {
  test('getAcademicCalendarFactors assigns correct factors per academic calendar phase', () => {
    // Monsoon & Odd Finals: Oct, Nov
    const oct = getAcademicCalendarFactors(new Date('2026-10-15'));
    assert.strictEqual(oct.monsoonFactor, 1.65);
    assert.strictEqual(oct.examFactor, 1.50);
    assert.strictEqual(oct.overallMultiplier, 1.65);

    const nov = getAcademicCalendarFactors(new Date('2026-11-05'));
    assert.strictEqual(nov.monsoonFactor, 1.65);
    assert.strictEqual(nov.phase, 'Monsoon Season & Odd Semester Finals');

    // Winter Break: Dec
    const dec = getAcademicCalendarFactors(new Date('2026-12-20'));
    assert.strictEqual(dec.breakFactor, 0.35);
    assert.strictEqual(dec.overallMultiplier, 0.35);

    // Spring Start: Jan
    const jan = getAcademicCalendarFactors(new Date('2026-01-10'));
    assert.strictEqual(jan.semesterStartFactor, 1.40);

    // Mid-semester: Feb, Mar
    const feb = getAcademicCalendarFactors(new Date('2026-02-15'));
    assert.strictEqual(feb.overallMultiplier, 1.0);

    // Even Finals & Summer: Apr, May
    const may = getAcademicCalendarFactors(new Date('2026-05-10'));
    assert.strictEqual(may.examFactor, 1.50);

    // Summer Break: Jun
    const jun = getAcademicCalendarFactors(new Date('2026-06-15'));
    assert.strictEqual(jun.breakFactor, 0.35);

    // Fall Start: Jul, Aug
    const jul = getAcademicCalendarFactors(new Date('2026-07-20'));
    assert.strictEqual(jul.semesterStartFactor, 1.40);
  });
});

describe('Unit Tests: Risk Score Math, Bounds, and Drivers', () => {
  test('computeRiskScore adheres strictly to [1, 100] bounds', () => {
    // Negative or 0 inputs clamp to >= 1
    const minTest = computeRiskScore(0, 100, 0, 0, 0.1, 0);
    assert.ok(minTest.score >= 1, 'Score must not fall below 1');
    assert.strictEqual(minTest.level, 'LOW');

    // Massive values clamp to <= 100
    const maxTest = computeRiskScore(500, 10, 300, 50, 3.0, 200);
    assert.ok(maxTest.score <= 100, 'Score must not exceed 100');
    assert.strictEqual(maxTest.level, 'HIGH_RISK');
  });

  test('Component contributions follow PROJECT.md weight ceilings', () => {
    // c_velocity ceiling = 35
    // c_backlog ceiling  = 30
    // c_calendar ceiling = 25
    // c_urgency ceiling  = 10
    // 35 + 30 + 25 + 10 = 100 total max points

    // High velocity only
    const vResult = computeRiskScore(100, 1, 0, 0, 1.0, 0);
    assert.ok(vResult.primaryDriver.includes('velocity'));

    // High backlog aging only
    const bResult = computeRiskScore(5, 5, 20, 10, 1.0, 0);
    assert.ok(bResult.primaryDriver.includes('backlog') || bResult.primaryDriver.includes('aging'));

    // High urgency only
    const uResult = computeRiskScore(10, 10, 0, 0, 1.0, 10);
    assert.ok(uResult.score > 15);
  });
});

describe('Unit Tests: Zone Recommendations and Full Risk Forecast', () => {
  test('getZoneRecommendation provides actionable advice with appropriate urgency', () => {
    const hostelHigh = getZoneRecommendation('Hostel Block A', 'HIGH_RISK');
    assert.strictEqual(hostelHigh.priority, 'urgent');
    assert.ok(hostelHigh.recommendation.includes('plumbing') || hostelHigh.recommendation.includes('drainage'));

    const transportElevated = getZoneRecommendation('Campus Transport Network', 'ELEVATED');
    assert.strictEqual(transportElevated.priority, 'medium');
    assert.ok(transportElevated.recommendation.includes('bus') || transportElevated.recommendation.includes('route'));

    const wifiLow = getZoneRecommendation('Departmental & Library Wi-Fi', 'LOW');
    assert.strictEqual(wifiLow.priority, 'low');
  });

  test('computeRiskForecast generates comprehensive forecast across all campus zones', () => {
    const forecast = computeRiskForecast(HISTORICAL_GRIEVANCES);

    assert.ok(forecast.overallCampusRiskScore >= 1 && forecast.overallCampusRiskScore <= 100);
    assert.ok(['LOW', 'ELEVATED', 'HIGH_RISK'].includes(forecast.overallRiskLevel));
    assert.ok(forecast.academicTermPhase);
    assert.ok(forecast.calendarMultipliers.monsoonFactor >= 1.0);

    assert.strictEqual(forecast.zoneForecasts.length, 9, 'Must forecast all 9 campus operational zones');
    const expectedZones = [
      'Hostel Block A',
      'Hostel Block B',
      'Hostel Block C',
      'Hostel Block D',
      'Hostel Block E',
      'Campus Bus Transport Network',
      'Departmental & Library Wi-Fi',
      'Campus Electrical & AC Utilities',
      'Dining & Mess Facilities',
    ];

    for (const expected of expectedZones) {
      const zone = forecast.zoneForecasts.find((z) => z.zone === expected);
      assert.ok(zone, `Zone ${expected} must exist in forecast`);
      assert.ok(zone.riskScore >= 1 && zone.riskScore <= 100);
      assert.ok(['LOW', 'ELEVATED', 'HIGH_RISK'].includes(zone.riskLevel));
      assert.ok(zone.primaryDriver);
      assert.ok(zone.actionableRecommendation);
      assert.ok(['low', 'medium', 'urgent'].includes(zone.urgencyPriority));
    }
  });

  test('getCampusTrendAnalytics and getCampusRiskForecast gracefully integrate live database state', () => {
    const trends = getCampusTrendAnalytics([]);
    assert.ok(trends.hostelMaintenance.byBlock.length >= 5);
    assert.ok(trends.campusTransport.byRoute.length > 0);
    assert.ok(trends.networkWifi.densityMatrix.length > 0);

    const forecast = getCampusRiskForecast([]);
    assert.ok(forecast.overallCampusRiskScore >= 1 && forecast.overallCampusRiskScore <= 100);
    assert.ok(forecast.zoneForecasts.length >= 9);
  });
});
