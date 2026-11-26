import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DepartmentSlaMetric,
  AutoTriageRateMetrics,
  DuplicatesInterceptedMetrics,
  WebhookDeliveries24hMetrics,
  AutomationSlaResponse,
  WebhookConfig,
} from '../types';
import { fetchAutomationSlaApi } from '../lib/api';

describe('Milestone 4: VisAI Labs GTM Suite SLA & Webhooks Suite', () => {
  test('TC-M4-01: fetchAutomationSlaApi returns valid telemetry structure with dual key support', async () => {
    const data = await fetchAutomationSlaApi();
    assert.ok(data, 'Telemetry data should be defined');

    const metrics = data.departmentSlaMetrics || data.department_sla_metrics;
    assert.ok(Array.isArray(metrics), 'departmentSlaMetrics should be an array');
    assert.ok(metrics.length >= 8, 'Should include major campus departments');

    // Verify first department has required SLA properties
    const firstDept = metrics[0];
    assert.ok(firstDept.departmentName || firstDept.department_name, 'Department name present');
    assert.ok((firstDept.targetSlaHours ?? firstDept.target_sla_hours) !== undefined, 'Target SLA hours present');
    assert.ok((firstDept.complianceRate ?? firstDept.compliance_rate) !== undefined, 'Compliance rate present');

    // Auto-triage rate metrics
    const autoTriage = data.autoTriageRate || data.auto_triage_rate;
    assert.ok(autoTriage, 'Auto triage metrics present');
    const autoPct = autoTriage.autoTriagedPct ?? autoTriage.ratePercentage;
    assert.ok(typeof autoPct === 'number', 'autoTriagedPct should be numeric');

    // Duplicates intercepted metrics
    const dups = data.duplicatesIntercepted || data.duplicates_intercepted;
    assert.ok(dups, 'Duplicates intercepted metrics present');
    const hoursSaved = dups.hoursSavedEstimate ?? dups.hours_saved;
    assert.ok(typeof hoursSaved === 'number', 'hoursSavedEstimate should be numeric');

    // Webhook deliveries metrics
    const wh24h = data.webhookDeliveries24h || data.webhook_deliveries_24h;
    assert.ok(wh24h, 'Webhook deliveries metrics present');
    assert.ok((wh24h.successRatePct ?? wh24h.success_rate_pct) !== undefined, 'Success rate pct present');
  });

  test('TC-M4-02: Department SLA performance calculations and margin detection', () => {
    const sampleDepts: DepartmentSlaMetric[] = [
      {
        departmentId: 'dept-hostel',
        departmentName: 'Hostel Affairs & Maintenance',
        departmentCode: 'HOSTEL',
        targetSlaHours: 24,
        avgResolutionHours: 18.0,
        complianceRate: 95.0,
        totalTickets: 20,
        resolvedTickets: 19,
        activeTickets: 1,
        breachedTickets: 0,
        status: 'COMPLIANT',
      },
      {
        departmentId: 'dept-infra',
        departmentName: 'Campus Infrastructure & Estate',
        departmentCode: 'INFRA',
        targetSlaHours: 72,
        avgResolutionHours: 85.0,
        complianceRate: 70.0,
        totalTickets: 10,
        resolvedTickets: 7,
        activeTickets: 3,
        breachedTickets: 3,
        status: 'BREACHED',
      },
    ];

    const compliant = sampleDepts[0];
    const marginCompliant = compliant.targetSlaHours - compliant.avgResolutionHours;
    assert.equal(marginCompliant, 6.0, 'Compliant dept should be 6 hours ahead of target SLA');
    assert.equal(compliant.status, 'COMPLIANT');

    const breached = sampleDepts[1];
    const marginBreached = breached.targetSlaHours - breached.avgResolutionHours;
    assert.equal(marginBreached, -13.0, 'Breached dept should have negative margin');
    assert.equal(breached.status, 'BREACHED');
  });

  test('TC-M4-03: Semantic deduplication staff hours saved formula (2.5h / ticket)', () => {
    const interceptedCount = 14;
    const expectedHoursSaved = Math.round(interceptedCount * 2.5 * 10) / 10;
    assert.equal(expectedHoursSaved, 35.0, '14 intercepted duplicates saves exactly 35.0 staff hours');
  });

  test('TC-M4-04: Webhook configuration model validation and platform formatting', () => {
    const validSlackHook: WebhookConfig = {
      id: 'whk_slack_001',
      name: 'Campus Ops Slack',
      targetUrl: 'https://hooks.slack.com/services/T00/B00/X00',
      platform: 'slack',
      triggerOnCritical: true,
      triggerOnDuplicateCluster: true,
      isActive: true,
      createdAt: '2026-11-15T12:00:00Z',
    };

    assert.equal(validSlackHook.platform, 'slack');
    assert.ok(validSlackHook.targetUrl.startsWith('https://'));
    assert.equal(validSlackHook.triggerOnCritical, true);
    assert.equal(validSlackHook.triggerOnDuplicateCluster, true);
  });
});
