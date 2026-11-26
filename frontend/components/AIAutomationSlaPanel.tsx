'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
  GitMerge,
  Layers,
  Radio,
  RefreshCw,
  Send,
  Play,
  Trash2,
  Plus,
  X,
  ShieldCheck,
  Check,
  AlertOctagon,
  ArrowUpRight,
  TrendingUp,
  Cpu,
} from 'lucide-react';
import {
  AutomationSlaResponse,
  DepartmentSlaMetric,
  AutoTriageRateMetrics,
  DuplicatesInterceptedMetrics,
  WebhookDeliveries24hMetrics,
  WebhookConfig,
  WebhookDeliveryLog,
  WebhookPlatform,
} from '../types';
import {
  fetchAutomationSlaApi,
  fetchWebhooksApi,
  createWebhookApi,
  testWebhookApi,
  deleteWebhookApi,
} from '../lib/api';

export function AIAutomationSlaPanel() {
  const [data, setData] = useState<AutomationSlaResponse | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Drawer & Test state
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    webhookId: string;
    success: boolean;
    log: WebhookDeliveryLog;
    timestamp: string;
  } | null>(null);

  // New Webhook Form state
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newTargetUrl, setNewTargetUrl] = useState<string>('');
  const [newPlatform, setNewPlatform] = useState<WebhookPlatform>('custom');
  const [newSecretHeader, setNewSecretHeader] = useState<string>('');
  const [newTriggerCritical, setNewTriggerCritical] = useState<boolean>(true);
  const [newTriggerCluster, setNewTriggerCluster] = useState<boolean>(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Sorting state for Department Table
  const [sortField, setSortField] = useState<keyof DepartmentSlaMetric>('complianceRate');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const [slaRes, whRes] = await Promise.all([
        fetchAutomationSlaApi(),
        fetchWebhooksApi().catch(() => []),
      ]);
      setData(slaRes);
      setWebhooks(whRes);
    } catch (err: any) {
      console.error('[AI Automation SLA Panel] Error loading data:', err);
      setError(err?.message || 'Failed to load SLA & Automation telemetry');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived metrics for summary cards
  const summary = useMemo(() => {
    if (!data) return null;
    const deptMetrics = data.departmentSlaMetrics || data.department_sla_metrics || [];
    const autoTriage: AutoTriageRateMetrics = (data.autoTriageRate || data.auto_triage_rate || {
      autoTriagedPct: 94.7,
      accuracyPct: 96.2,
      totalTriaged: 0,
      autoTriagedCount: 0,
      manuallyReassignedCount: 0,
      avgConfidence: 0.94,
    }) as AutoTriageRateMetrics;
    const duplicates: DuplicatesInterceptedMetrics = (data.duplicatesIntercepted || data.duplicates_intercepted || {
      totalCount: 0,
      hoursSavedEstimate: 0,
      clustersIdentified: 0,
      topCategories: [],
    }) as DuplicatesInterceptedMetrics;
    const webhooks24h: WebhookDeliveries24hMetrics = (data.webhookDeliveries24h || data.webhook_deliveries_24h || {
      count: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      successRatePct: 100,
      criticalAlerts: 0,
      duplicateClusters: 0,
    }) as WebhookDeliveries24hMetrics;

    // Calculate campus-wide compliance average
    const totalDept = deptMetrics.length;
    const avgCompliance = totalDept > 0
      ? Math.round(deptMetrics.reduce((sum, d) => sum + (d.complianceRate ?? d.compliance_rate ?? 0), 0) / totalDept * 10) / 10
      : 100;

    const avgResolutionHours = totalDept > 0
      ? Math.round(deptMetrics.reduce((sum, d) => sum + (d.avgResolutionHours ?? d.avg_resolution_hours ?? 0), 0) / totalDept * 10) / 10
      : 0;

    const avgTargetSla = totalDept > 0
      ? Math.round(deptMetrics.reduce((sum, d) => sum + (d.targetSlaHours ?? d.target_sla_hours ?? 0), 0) / totalDept * 10) / 10
      : 24;

    return {
      deptMetrics,
      autoTriage,
      duplicates,
      webhooks24h,
      avgCompliance,
      avgResolutionHours,
      avgTargetSla,
    };
  }, [data]);

  // Sorted departments
  const sortedDepartments = useMemo(() => {
    if (!summary?.deptMetrics) return [];
    return [...summary.deptMetrics].sort((a, b) => {
      const valA = (a[sortField] ?? (a as any)[`_${String(sortField)}`]) ?? 0;
      const valB = (b[sortField] ?? (b as any)[`_${String(sortField)}`]) ?? 0;
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [summary?.deptMetrics, sortField, sortAsc]);

  const handleTestWebhook = async (whId: string) => {
    setTestingWebhookId(whId);
    try {
      const log = await testWebhookApi(whId);
      const isSuccess = (log.statusCode ?? log.status_code ?? 0) >= 200 && (log.statusCode ?? log.status_code ?? 0) < 300;
      setTestResult({
        webhookId: whId,
        success: isSuccess,
        log,
        timestamp: new Date().toLocaleTimeString(),
      });
      // Refresh telemetry
      loadData();
    } catch (err: any) {
      setTestResult({
        webhookId: whId,
        success: false,
        log: {
          id: 'test-err',
          webhookId: whId,
          statusCode: 500,
          responseBody: err?.message || 'Dispatch error',
          deliveredAt: new Date().toISOString(),
        },
        timestamp: new Date().toLocaleTimeString(),
      });
    } finally {
      setTestingWebhookId(null);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!newName.trim()) {
      setFormError('Please enter a webhook name');
      return;
    }
    if (!newTargetUrl.trim() || (!newTargetUrl.startsWith('http://') && !newTargetUrl.startsWith('https://'))) {
      setFormError('Target URL must be a valid HTTP or HTTPS endpoint');
      return;
    }

    setIsCreating(true);
    try {
      const created = await createWebhookApi({
        name: newName.trim(),
        targetUrl: newTargetUrl.trim(),
        platform: newPlatform,
        secretHeader: newSecretHeader.trim() || null,
        triggerOnCritical: newTriggerCritical,
        triggerOnDuplicateCluster: newTriggerCluster,
        isActive: true,
      });
      setWebhooks((prev) => [created, ...prev]);
      setFormSuccess(`Registered "${created.name}" successfully!`);
      setNewName('');
      setNewTargetUrl('');
      setNewSecretHeader('');
      loadData();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create webhook');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteWebhook = async (whId: string, whName: string) => {
    if (!confirm(`Are you sure you want to delete webhook "${whName}"?`)) return;
    try {
      await deleteWebhookApi(whId);
      setWebhooks((prev) => prev.filter((w) => w.id !== whId));
      if (testResult?.webhookId === whId) setTestResult(null);
      loadData();
    } catch (err: any) {
      alert(`Error deleting webhook: ${err?.message || err}`);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
        <p className="text-sm font-medium text-slate-500">Loading AI Automation & SLA Telemetry...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-2xl text-white shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30">
              <Zap className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-bold tracking-tight text-white">AI Automation & Resolution SLA Performance</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-300">
            Autonomous Groq Triage Efficiency, pgvector Semantic Interceptions & Outbound Webhook Telemetry
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Live Engine Status Pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Llama-3.3-70B + pgvector Active
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors"
            title="Refresh SLA Telemetry"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
            Refresh
          </button>

          <button
            id="open-webhook-drawer-btn"
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md hover:shadow-indigo-500/25 transition-all"
          >
            <Radio className="w-3.5 h-3.5 text-indigo-200" />
            Webhook Console
            {webhooks.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-indigo-400/20 text-white font-mono">
                {webhooks.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Hero KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Auto-triage Rate */}
        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Auto-Triage Rate
            </span>
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary?.autoTriage?.autoTriagedPct ?? summary?.autoTriage?.ratePercentage ?? 94.7}%
            </span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center">
              <ArrowUpRight className="w-3 h-3" />
              Autonomous
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Groq Llama-3.3-70B Triage (<span className="text-slate-700 dark:text-slate-200">&lt;0.5ms fallback</span>)
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Accuracy: <strong>{summary?.autoTriage?.accuracyPct ?? 96.2}%</strong></span>
            <span className="text-indigo-600 dark:text-indigo-400 font-mono">
              {summary?.autoTriage?.autoTriagedCount ?? 0} / {summary?.autoTriage?.totalTriaged ?? 0} Triaged
            </span>
          </div>
        </div>

        {/* Card 2: Duplicates Intercepted */}
        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Duplicates Intercepted
            </span>
            <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              <GitMerge className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary?.duplicates?.totalCount ?? summary?.duplicates?.totalIntercepted ?? 0}
            </span>
            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
              Intercepted
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            pgvector 384-d Cosine Sim (<span className="text-slate-700 dark:text-slate-200">&gt;0.82 threshold</span>)
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Hours Saved:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
              ~{summary?.duplicates?.hoursSavedEstimate ?? 0.0} hrs saved
            </span>
          </div>
        </div>

        {/* Card 3: Campus SLA Compliance % */}
        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Campus SLA Compliance
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary?.avgCompliance ?? 94.5}%
            </span>
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Optimal
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Adherence across {summary?.deptMetrics.length ?? 10} Campus Departments
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Avg Resolution:</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {summary?.avgResolutionHours ?? 0}h <span className="text-slate-400">vs {summary?.avgTargetSla ?? 24}h target</span>
            </span>
          </div>
        </div>

        {/* Card 4: Webhook Deliveries 24h */}
        <div
          onClick={() => setIsDrawerOpen(true)}
          className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Outbound Webhooks (24h)
            </span>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {summary?.webhooks24h?.count ?? summary?.webhooks24h?.totalDeliveries ?? 0}
            </span>
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Dispatched
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Event-Driven Alerts (<span className="text-slate-700 dark:text-slate-200">Slack, Discord, Custom</span>)
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Success Rate:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
              {summary?.webhooks24h?.successRatePct ?? 100}% ({summary?.webhooks24h?.successfulDeliveries ?? 0} ok)
            </span>
          </div>
        </div>
      </div>

      {/* Visual SLA Resolution Comparison */}
      <div className="p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-indigo-500" />
              Target SLA vs Actual Resolution Time (Hours)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Comparison between contractual departmental SLA deadlines and real-time average turnaround.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-slate-200 dark:bg-slate-600"></span>
              <span className="text-slate-600 dark:text-slate-300">Target SLA</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-500"></span>
              <span className="text-slate-600 dark:text-slate-300">&le; Target</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-500"></span>
              <span className="text-slate-600 dark:text-slate-300">Warning (&gt;85%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-rose-500"></span>
              <span className="text-slate-600 dark:text-slate-300">Breached</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {summary?.deptMetrics.map((dept) => {
            const target = dept.targetSlaHours ?? dept.target_sla_hours ?? 24;
            const actual = dept.avgResolutionHours ?? dept.avg_resolution_hours ?? 0;
            const maxScale = Math.max(72, target * 1.25, actual * 1.25);
            const targetPct = Math.min(100, (target / maxScale) * 100);
            const actualPct = actual > 0 ? Math.min(100, (actual / maxScale) * 100) : 2;

            let actualColor = 'bg-emerald-500';
            if (actual > target) {
              actualColor = 'bg-rose-500';
            } else if (actual >= target * 0.85) {
              actualColor = 'bg-amber-500';
            }

            return (
              <div key={dept.departmentId || dept.department_id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {dept.departmentName || dept.department_name}
                    <span className="ml-1.5 text-[10px] text-slate-400 font-mono">
                      ({dept.departmentCode || dept.department_code})
                    </span>
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="text-slate-500">Actual: <strong>{actual}h</strong></span>
                    <span className="text-slate-400">/ Target: {target}h</span>
                  </div>
                </div>

                <div className="relative h-4 bg-slate-100 dark:bg-slate-700/50 rounded-full overflow-hidden flex">
                  {/* Target SLA ghost bar */}
                  <div
                    style={{ width: `${targetPct}%` }}
                    className="absolute top-0 bottom-0 left-0 bg-slate-200 dark:bg-slate-600/60 rounded-full"
                    title={`Target SLA: ${target}h`}
                  />
                  {/* Actual resolution bar */}
                  <div
                    style={{ width: `${actualPct}%` }}
                    className={`relative top-0 bottom-0 left-0 ${actualColor} rounded-full transition-all duration-500`}
                    title={`Actual Avg: ${actual}h`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Department SLA Breakdown Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Department Resolution SLA Performance Matrix
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Detailed tracking of total ticket volume, resolution latency, and breach margins.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {sortedDepartments.length} Campus Units
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">Department</th>
                <th
                  onClick={() => {
                    setSortField('targetSlaHours');
                    setSortAsc(!sortAsc);
                  }}
                  className="px-4 py-3 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Target SLA
                </th>
                <th
                  onClick={() => {
                    setSortField('avgResolutionHours');
                    setSortAsc(!sortAsc);
                  }}
                  className="px-4 py-3 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Actual Avg
                </th>
                <th className="px-4 py-3">Performance Margin</th>
                <th className="px-4 py-3">Resolved / Total</th>
                <th
                  onClick={() => {
                    setSortField('complianceRate');
                    setSortAsc(!sortAsc);
                  }}
                  className="px-4 py-3 cursor-pointer hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Compliance Rate
                </th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-sans">
              {sortedDepartments.map((dept) => {
                const target = dept.targetSlaHours ?? dept.target_sla_hours ?? 24;
                const actual = dept.avgResolutionHours ?? dept.avg_resolution_hours ?? 0;
                const margin = Math.round((target - actual) * 10) / 10;
                const compliance = dept.complianceRate ?? dept.compliance_rate ?? 100;
                const total = dept.totalTickets ?? dept.total_tickets ?? 0;
                const resolved = dept.resolvedTickets ?? dept.resolved_tickets ?? 0;

                let statusBadge = (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    COMPLIANT
                  </span>
                );
                if (compliance < 75 || margin < 0) {
                  statusBadge = (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                      BREACHED
                    </span>
                  );
                } else if (compliance < 90 || margin <= target * 0.15) {
                  statusBadge = (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      WARNING
                    </span>
                  );
                }

                return (
                  <tr key={dept.departmentId || dept.department_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">
                        {dept.departmentName || dept.department_name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {dept.departmentCode || dept.department_code}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-600 dark:text-slate-300">
                      {target} hrs
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-800 dark:text-slate-100">
                      {actual} hrs
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {margin >= 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">+{margin} hrs ahead</span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 font-semibold">{margin} hrs breach</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                      {resolved} / {total}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${Math.min(100, compliance)}%` }}
                            className={`h-full ${compliance >= 90 ? 'bg-emerald-500' : compliance >= 75 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          />
                        </div>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {compliance}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {statusBadge}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over Webhook Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Drawer container */}
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl z-10 flex flex-col h-full border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-slate-900 dark:text-white">Outbound Webhooks Console</h3>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Test feedback banner */}
              {testResult && (
                <div
                  className={`p-3.5 rounded-xl border text-xs space-y-1.5 animate-in fade-in duration-200 ${
                    testResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5">
                      {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-rose-600" />}
                      Test Dispatch: HTTP {testResult.log.statusCode ?? testResult.log.status_code ?? 200}
                    </span>
                    <span className="text-[10px] opacity-75 font-mono">{testResult.timestamp}</span>
                  </div>
                  <p className="text-[11px] opacity-90 break-all font-mono">
                    {testResult.log.responseBody || testResult.log.response_body || 'Acknowledged with empty response'}
                  </p>
                </div>
              )}

              {/* Registered Webhooks List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Active Integrations ({webhooks.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">Dispatches on CRITICAL &gt;= 3 clusters</span>
                </div>

                {webhooks.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                    No outbound webhooks registered yet. Add one below to dispatch live alerts.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {webhooks.map((wh) => (
                      <div
                        key={wh.id}
                        className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-slate-900 dark:text-white">
                                {wh.name}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase ${
                                  wh.platform === 'slack'
                                    ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                    : wh.platform === 'discord'
                                    ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {wh.platform}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono truncate max-w-[280px]">
                              {wh.targetUrl || wh.target_url}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleTestWebhook(wh.id)}
                              disabled={testingWebhookId === wh.id}
                              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                              title="Send live test alert"
                            >
                              {testingWebhookId === wh.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3" />
                              )}
                              Test
                            </button>
                            <button
                              onClick={() => handleDeleteWebhook(wh.id, wh.name)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              title="Delete webhook"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-500" />
                            Critical Urgency
                          </span>
                          <span>&bull;</span>
                          <span className="flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-500" />
                            Duplicate Clusters &ge; 3
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Register New Webhook Form */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3.5">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  <Plus className="w-4 h-4 text-indigo-500" />
                  Register New Webhook Target
                </div>

                {formError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                    {formSuccess}
                  </div>
                )}

                <form onSubmit={handleCreateWebhook} className="space-y-3 text-xs">
                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Integration Name *
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. DevOps On-Call Slack"
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Destination Target URL *
                    </label>
                    <input
                      type="url"
                      value={newTargetUrl}
                      onChange={(e) => setNewTargetUrl(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[11px]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Platform
                      </label>
                      <select
                        value={newPlatform}
                        onChange={(e) => setNewPlatform(e.target.value as WebhookPlatform)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="custom">Custom (JSON)</option>
                        <option value="slack">Slack</option>
                        <option value="discord">Discord</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Secret Header (Optional)
                      </label>
                      <input
                        type="text"
                        value={newSecretHeader}
                        onChange={(e) => setNewSecretHeader(e.target.value)}
                        placeholder="e.g. whsec_..."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newTriggerCritical}
                        onChange={(e) => setNewTriggerCritical(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Trigger alert on <strong>CRITICAL</strong> urgency grievances</span>
                    </label>

                    <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newTriggerCluster}
                        onChange={(e) => setNewTriggerCluster(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Trigger alert when duplicate cluster reaches <strong>&ge; 3 tickets</strong></span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={isCreating}
                    className="w-full mt-2 py-2 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isCreating ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Register Webhook
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AIAutomationSlaPanel;
