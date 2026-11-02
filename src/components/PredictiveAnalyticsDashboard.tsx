import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldAlert,
  Layers,
  Activity,
  Calendar,
  Zap,
  Bus,
  Wifi,
  Wrench,
  Sparkles,
  Clock,
  ArrowUpRight,
  Check,
  Building2,
  Radio,
  FileText,
} from 'lucide-react';
import { fetchAnalyticsTrendsApi, fetchRiskForecastApi } from '../api';
import {
  TrendAnalyticsResponse,
  RiskForecastResponse,
  ZoneRiskForecast,
} from '../types';
import {
  MultiLineChart,
  TransportHeatmap,
  WifiMatrixGrid,
  RiskScoreDial,
} from './Charts';

export interface PredictiveAnalyticsDashboardProps {
  onNavigateToTriage?: () => void;
}

export const PredictiveAnalyticsDashboard: React.FC<
  PredictiveAnalyticsDashboardProps
> = ({ onNavigateToTriage }) => {
  const [trends, setTrends] = useState<TrendAnalyticsResponse | null>(null);
  const [forecast, setForecast] = useState<RiskForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [dispatchedZones, setDispatchedZones] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sub-section tab toggle for deep inspection
  const [activeTab, setActiveTab] = useState<'all' | 'trends' | 'infrastructure' | 'forecast'>('all');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [trendData, forecastData] = await Promise.all([
        fetchAnalyticsTrendsApi(),
        fetchRiskForecastApi(),
      ]);
      setTrends(trendData);
      setForecast(forecastData);
      setLastRefreshed(new Date());
    } catch (err: any) {
      console.error('Failed to load predictive analytics data:', err);
      setError(err.message || 'Failed to load predictive analytics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Operational crew dispatch simulation
  const handleDispatch = (zone: string, recText: string) => {
    setDispatchedZones((prev) => new Set(prev).add(zone));
    setToastMessage(`Maintenance crew successfully dispatched to: ${zone}`);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // KPI Calculations
  const kpiData = useMemo(() => {
    // 1. Campus Risk Score & Level
    const riskScore = forecast?.overallCampusRiskScore ?? 0;
    const riskLevel = forecast?.overallRiskLevel ?? 'LOW';

    // 2. 7-Day Peak Velocity Category
    let peakCategory = 'Hostel Maintenance';
    let peakCount = 0;
    if (trends?.rolling7DayVelocity) {
      const catCounts = new Map<string, number>();
      trends.rolling7DayVelocity.forEach((item) => {
        catCounts.set(item.category, (catCounts.get(item.category) || 0) + item.count);
      });
      catCounts.forEach((cnt, cat) => {
        if (cnt > peakCount) {
          peakCount = cnt;
          peakCategory = cat;
        }
      });
    }

    // 3. Top Hotspot Operational Zone
    let hotspotZone = 'Hostel Block A';
    let maxZoneScore = 0;
    if (forecast?.zoneForecasts) {
      forecast.zoneForecasts.forEach((z) => {
        if (z.riskScore > maxZoneScore) {
          maxZoneScore = z.riskScore;
          hotspotZone = z.zone;
        }
      });
    }

    // 4. Overall Duplicate Consolidation Ratio
    let totalConsolidatedRatio = 0;
    if (trends?.hostelMaintenance?.byBlock && trends.hostelMaintenance.byBlock.length > 0) {
      const ratios = trends.hostelMaintenance.byBlock.map((b) => b.consolidationRatio || 0);
      const sum = ratios.reduce((a, b) => a + b, 0);
      totalConsolidatedRatio = Math.round((sum / ratios.length) * 100);
    } else {
      totalConsolidatedRatio = 38;
    }

    return {
      riskScore,
      riskLevel,
      peakCategory,
      peakCount,
      hotspotZone,
      maxZoneScore,
      totalConsolidatedRatio,
    };
  }, [trends, forecast]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 p-4 bg-slate-900 text-white rounded-2xl shadow-xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            <Sparkles className="w-4 h-4" />
            <span>Campus Intelligence & Forecasting</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
            Predictive Campus Issue Analytics & Risk Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time multidimensional aggregation, academic calendar risk weighting, and early infrastructure warnings.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 hidden md:inline">
            Updated {lastRefreshed.toLocaleTimeString()}
          </span>

          <button
            type="button"
            id="analytics-refresh-btn"
            onClick={loadData}
            disabled={isLoading}
            className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
            title="Refresh analytics data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            <span>{isLoading ? 'Syncing...' : 'Refresh'}</span>
          </button>

          {onNavigateToTriage && (
            <button
              type="button"
              onClick={onNavigateToTriage}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Review Triage</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation View Sub-tabs */}
      <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 w-fit text-xs">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Comprehensive View
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('trends')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
            activeTab === 'trends'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Category Trends
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('infrastructure')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
            activeTab === 'infrastructure'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Transport & Network
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('forecast')}
          className={`px-3 py-1.5 rounded-xl font-semibold transition-all cursor-pointer ${
            activeTab === 'forecast'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Risk Model & Actions
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-center justify-between text-xs text-rose-800 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold"
          >
            Retry
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 1: 4 KPI SUMMARY CARDS                                        */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Campus Risk Score */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Campus Risk Index</span>
            <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black text-slate-900 dark:text-white">
              {kpiData.riskScore}
            </span>
            <span className="text-xs text-slate-400 font-mono">/ 100</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
            <span
              className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                kpiData.riskLevel === 'HIGH_RISK'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : kpiData.riskLevel === 'ELEVATED'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }`}
            >
              {kpiData.riskLevel.replace('_', ' ')}
            </span>
            <span className="text-slate-400 text-[10px]">Academic Term Multiplier</span>
          </div>
        </div>

        {/* KPI 2: 7-Day Peak Velocity */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">7-Day Peak Velocity</span>
            <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {kpiData.peakCategory}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <strong className="font-mono text-base font-bold text-blue-600 dark:text-blue-400">
                {kpiData.peakCount}
              </strong>{' '}
              incidents this week
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800 text-slate-400 text-[10px]">
            <span>Fastest rolling surge</span>
            <span className="text-blue-600 font-semibold flex items-center">
              Active <ArrowUpRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* KPI 3: Top Hotspot Operational Zone */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Top Hotspot Zone</span>
            <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
              {kpiData.hotspotZone}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Score severity: <strong className="font-mono font-bold text-amber-600">{kpiData.maxZoneScore}</strong> / 100
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800 text-slate-400 text-[10px]">
            <span>Priority dispatch zone</span>
            <span className="text-amber-600 font-semibold">Flagged</span>
          </div>
        </div>

        {/* KPI 4: Overall Duplicate Consolidation Ratio */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Consolidation Ratio</span>
            <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-black text-emerald-600 dark:text-emerald-400">
              {kpiData.totalConsolidatedRatio}%
            </span>
            <span className="text-xs text-slate-400">merged to master</span>
          </div>
          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800 text-slate-400 text-[10px]">
            <span>Duplicate deduplication SLA</span>
            <span className="text-emerald-600 font-semibold">Active Pipeline</span>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION 2: CATEGORY TRENDS (MultiLineChart)                           */}
      {/* ===================================================================== */}
      {(activeTab === 'all' || activeTab === 'trends') && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-blue-600 dark:text-blue-400">
                <TrendingUp className="w-4 h-4" />
                <span>Rolling 7-Day Velocity Tracking</span>
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                Multi-Category Incident Trajectory
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Hover nodes for daily breakdown
            </span>
          </div>

          <MultiLineChart
            data={trends?.rolling7DayVelocity || []}
            noCard={true}
            height={280}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 3: CAMPUS INFRASTRUCTURE (Transport Heatmap & Wi-Fi Matrix)    */}
      {/* ===================================================================== */}
      {(activeTab === 'all' || activeTab === 'infrastructure') && (
        <div className="space-y-6">
          {/* Transport Routes Heatmap */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-amber-600 dark:text-amber-400">
                  <Bus className="w-4 h-4" />
                  <span>Campus Transit Operations</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  Transport Route Infrastructure Heatmap (Routes 1–12)
                </h2>
              </div>
            </div>

            <TransportHeatmap
              routes={trends?.campusTransport?.byRoute || []}
              peakStops={trends?.campusTransport?.peakCongestionStops}
              noCard={true}
            />
          </div>

          {/* Wi-Fi & Network Incident Density Matrix */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400">
                  <Wifi className="w-4 h-4" />
                  <span>Network Saturation Matrix</span>
                </div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  Departmental Access Point & Switch Density
                </h2>
              </div>
            </div>

            <WifiMatrixGrid
              matrix={trends?.networkWifi?.densityMatrix || []}
              noCard={true}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* SECTION 4: MONTHLY RISK FORECAST & ACTIONABLE MAINTENANCE             */}
      {/* ===================================================================== */}
      {(activeTab === 'all' || activeTab === 'forecast') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Radial Risk Dial & Academic Calendar Weights */}
          <div className="lg:col-span-1 space-y-6">
            {/* Risk Dial Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Forecast Severity
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  Term: {forecast?.academicTermPhase || 'Active Semester'}
                </span>
              </div>

              <RiskScoreDial
                score={forecast?.overallCampusRiskScore || 1}
                level={forecast?.overallRiskLevel}
                noCard={true}
                size={230}
              />
            </div>

            {/* Academic Calendar Multipliers Breakdown */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Academic Calendar Multipliers</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Deterministic seasonal multipliers scaling backlog sensitivity and infrastructure risk scores:
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <div className="text-[10px] text-slate-400">Monsoon Weather</div>
                  <div className="font-mono font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                    {forecast?.calendarMultipliers?.monsoonFactor ?? 1.65}x
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <div className="text-[10px] text-slate-400">Exam Finals Load</div>
                  <div className="font-mono font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    {forecast?.calendarMultipliers?.examFactor ?? 1.5}x
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <div className="text-[10px] text-slate-400">Term Start Surge</div>
                  <div className="font-mono font-bold text-purple-600 dark:text-purple-400 mt-0.5">
                    {forecast?.calendarMultipliers?.semesterStartFactor ?? 1.4}x
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80">
                  <div className="text-[10px] text-slate-400">Term Vacation</div>
                  <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    0.35x
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Predictive Explanation Drivers & Actionable Recommendations */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-blue-600 dark:text-blue-400">
                    <Wrench className="w-4 h-4" />
                    <span>Predictive Risk Explanation & Dispatch</span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    Actionable Maintenance Recommendations
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {forecast?.zoneForecasts?.length || 0} Zone Forecasts
                </span>
              </div>

              {/* Recommendations list */}
              <div className="space-y-3">
                {forecast?.zoneForecasts && forecast.zoneForecasts.length > 0 ? (
                  forecast.zoneForecasts.map((zoneItem, idx) => {
                    const isDispatched = dispatchedZones.has(zoneItem.zone);
                    const isUrgent = zoneItem.urgencyPriority === 'urgent';
                    const isMedium = zoneItem.urgencyPriority === 'medium';

                    return (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-white">
                              {zoneItem.zone}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                zoneItem.riskLevel === 'HIGH_RISK'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                  : zoneItem.riskLevel === 'ELEVATED'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              }`}
                            >
                              {zoneItem.riskScore} / 100 ({zoneItem.riskLevel})
                            </span>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
                              isUrgent
                                ? 'bg-rose-600 text-white'
                                : isMedium
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            Priority: {zoneItem.urgencyPriority}
                          </span>
                        </div>

                        {/* Primary Driver */}
                        <div className="text-xs text-slate-600 dark:text-slate-300 flex items-start gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-slate-800 dark:text-slate-200">
                              Predictive Driver:
                            </strong>{' '}
                            {zoneItem.primaryDriver}
                          </span>
                        </div>

                        {/* Recommendation + Dispatch CTA */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
                            {zoneItem.actionableRecommendation}
                          </p>

                          <button
                            type="button"
                            onClick={() =>
                              handleDispatch(
                                zoneItem.zone,
                                zoneItem.actionableRecommendation
                              )
                            }
                            disabled={isDispatched}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                              isDispatched
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                            }`}
                          >
                            {isDispatched ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Dispatched ✓</span>
                              </>
                            ) : (
                              <>
                                <Wrench className="w-3.5 h-3.5" />
                                <span>Dispatch Crew</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-10 text-center text-xs text-slate-400">
                    No active maintenance alerts forecasted
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PredictiveAnalyticsDashboard;
