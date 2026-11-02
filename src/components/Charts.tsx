import React, { useState, useId } from 'react';
import {
  Bus,
  Wifi,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Activity,
  Gauge,
  Server,
  Radio,
  Clock,
  ShieldAlert,
  Layers,
} from 'lucide-react';
import { Rolling7DayVelocityItem, TransportRouteRollup, WifiDensityNode } from '../types';

// ---------------------------------------------------------------------------
// Accessible & vibrant color palette for charts
// ---------------------------------------------------------------------------
export const CHART_COLORS: string[] = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // purple-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
  '#84cc16', // lime-500
  '#64748b', // slate-500
];

export interface ChartDatum {
  label: string;
  value: number;
  color: string;
}

// ---------------------------------------------------------------------------
// Math helpers for SVG arcs
// ---------------------------------------------------------------------------
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describePieSlice(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ---------------------------------------------------------------------------
// Card wrapper component
// ---------------------------------------------------------------------------
interface ChartCardProps {
  title?: string;
  subtitle?: string;
  badge?: string;
  noCard?: boolean;
  children: React.ReactNode;
}

function ChartCard({ title, subtitle, badge, noCard, children }: ChartCardProps) {
  if (noCard) {
    return (
      <div className="w-full flex flex-col justify-center">
        {title && (
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
            {badge && (
              <span className="text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {badge}
              </span>
            )}
          </div>
        )}
        <div className="flex-1 flex flex-col justify-center">{children}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors flex flex-col justify-between">
      {title && (
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {badge && (
            <span className="text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {badge}
            </span>
          )}
        </div>
      )}
      <div className="flex-1 flex flex-col justify-center">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unified Legend component
// ---------------------------------------------------------------------------
function Legend({ data, total }: { data: ChartDatum[]; total: number }) {
  if (data.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap gap-x-4 gap-y-2 justify-center">
      {data.map((d, i) => {
        const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0';
        return (
          <div
            key={i}
            className={`inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors ${
              d.value === 0 ? 'opacity-40' : ''
            }`}
            title={`${d.label}: ${d.value} ticket${d.value === 1 ? '' : 's'} (${pct}%)`}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-xs shrink-0 shadow-2xs"
              style={{ backgroundColor: d.color }}
            />
            <span className="font-medium truncate max-w-[180px] sm:max-w-[220px]">{d.label}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 font-mono text-[10px]">
              {d.value}
            </span>
            <span className="text-slate-400 dark:text-slate-500 text-[10px]">
              ({pct}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// 1. PieChart Component
// ===========================================================================
export interface PieChartProps {
  data: ChartDatum[];
  size?: number;
  title?: string;
  subtitle?: string;
  noCard?: boolean;
}

export function PieChart({ data, size = 180, title, subtitle, noCard }: PieChartProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const activeItems = data.filter((d) => d.value > 0);

  return (
    <ChartCard title={title} subtitle={subtitle} badge={`${total} total`} noCard={noCard}>
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-xs text-slate-400 dark:text-slate-500">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center mb-2">
            —
          </div>
          <span>No grievance records</span>
        </div>
      ) : (
        <>
          <div className="relative flex items-center justify-center">
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="overflow-visible"
            >
              {activeItems.length === 1 ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={activeItems[0].color}
                  className="stroke-white dark:stroke-slate-900 cursor-pointer"
                  strokeWidth={2}
                >
                  <title>{`${activeItems[0].label}: ${activeItems[0].value} (100%)`}</title>
                </circle>
              ) : (
                (() => {
                  let cumAngle = 0;
                  return data.map((d, i) => {
                    if (d.value === 0) return null;
                    const sliceAngle = (d.value / total) * 360;
                    const startAngle = cumAngle;
                    const endAngle = cumAngle + sliceAngle;
                    cumAngle = endAngle;
                    return (
                      <path
                        key={i}
                        d={describePieSlice(cx, cy, r, startAngle, endAngle)}
                        fill={d.color}
                        className="stroke-white dark:stroke-slate-900 transition-opacity hover:opacity-90 cursor-pointer"
                        strokeWidth={2}
                        strokeLinejoin="round"
                      >
                        <title>{`${d.label}: ${d.value} (${((d.value / total) * 100).toFixed(1)}%)`}</title>
                      </path>
                    );
                  });
                })()
              )}
            </svg>
          </div>
          <Legend data={data} total={total} />
        </>
      )}
    </ChartCard>
  );
}

// ===========================================================================
// 2. DonutChart Component
// ===========================================================================
export interface DonutChartProps {
  data: ChartDatum[];
  size?: number;
  title?: string;
  subtitle?: string;
  noCard?: boolean;
}

export function DonutChart({ data, size = 180, title, subtitle, noCard }: DonutChartProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const thickness = outerR * 0.34;
  const midR = outerR - thickness / 2;
  const activeItems = data.filter((d) => d.value > 0);

  return (
    <ChartCard title={title} subtitle={subtitle} badge={`${total} records`} noCard={noCard}>
      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-xs text-slate-400 dark:text-slate-500">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center mb-2">
            0
          </div>
          <span>No records found</span>
        </div>
      ) : (
        <>
          <div className="relative flex items-center justify-center">
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="overflow-visible"
            >
              {activeItems.length === 1 ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={midR}
                  fill="none"
                  stroke={activeItems[0].color}
                  strokeWidth={thickness}
                  className="cursor-pointer"
                >
                  <title>{`${activeItems[0].label}: ${activeItems[0].value} (100%)`}</title>
                </circle>
              ) : (
                (() => {
                  let cumAngle = 0;
                  return data.map((d, i) => {
                    if (d.value === 0) return null;
                    const sliceAngle = (d.value / total) * 360;
                    const gap = 1.0;
                    const startAngle = cumAngle + gap / 2;
                    const endAngle = cumAngle + sliceAngle - gap / 2;
                    cumAngle += sliceAngle;

                    if (endAngle <= startAngle) return null;

                    return (
                      <path
                        key={i}
                        d={describeArc(cx, cy, midR, startAngle, endAngle)}
                        fill="none"
                        stroke={d.color}
                        strokeWidth={thickness}
                        strokeLinecap="round"
                        className="transition-opacity hover:opacity-85 cursor-pointer"
                      >
                        <title>{`${d.label}: ${d.value} (${((d.value / total) * 100).toFixed(1)}%)`}</title>
                      </path>
                    );
                  });
                })()
              )}

              {/* Central counter */}
              <text
                x={cx}
                y={cy - 4}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-900 dark:fill-white text-xl font-bold font-mono tracking-tight"
              >
                {total}
              </text>
              <text
                x={cx}
                y={cy + 14}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-400 dark:fill-slate-500 text-[10px] uppercase font-bold tracking-wider"
              >
                Total
              </text>
            </svg>
          </div>
          <Legend data={data} total={total} />
        </>
      )}
    </ChartCard>
  );
}

// ===========================================================================
// 3. BarChart Component (Properly scaled, responsive, collision-free crisp SVG)
// ===========================================================================
export interface BarChartProps {
  data: ChartDatum[];
  title?: string;
  subtitle?: string;
  height?: number;
  noCard?: boolean;
}

export function BarChart({ data, title, subtitle, height, noCard }: BarChartProps) {
  const count = data.length;
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((acc, d) => acc + d.value, 0);

  // Automatically determine if labels should be rotated based on item count and label length
  const shouldRotate = count > 4 || data.some((d) => d.label.length > 12);

  // Layout metrics dynamically calculated to prevent any label collision or text clipping
  const effectiveHeight = height ?? (shouldRotate ? 280 : 230);
  const paddingTop = 28;
  const paddingBottom = shouldRotate ? 88 : 42;
  const paddingLeft = shouldRotate ? 68 : 36;
  const paddingRight = shouldRotate ? 32 : 36;

  const svgWidth = shouldRotate ? Math.max(540, count * 76) : Math.max(420, count * 90);
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = Math.max(80, effectiveHeight - paddingTop - paddingBottom);

  const slotWidth = count > 0 ? plotWidth / count : plotWidth;
  const barWidth = Math.min(36, Math.max(18, slotWidth * 0.46));

  return (
    <ChartCard title={title} subtitle={subtitle} badge={`${total} total`} noCard={noCard}>
      {count === 0 ? (
        <div className="flex items-center justify-center py-10 text-xs text-slate-400 dark:text-slate-500">
          No data available
        </div>
      ) : (
        <div className="w-full overflow-x-auto scrollbar-thin">
          <svg
            viewBox={`0 0 ${svgWidth} ${effectiveHeight}`}
            className="w-full h-auto overflow-visible select-none"
            style={{ minWidth: shouldRotate ? Math.min(svgWidth, 480) : undefined }}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Horizontal guideline markers */}
            {[0.25, 0.5, 0.75, 1.0].map((ratio) => {
              const lineY = paddingTop + plotHeight * (1 - ratio);
              const val = Math.round(maxVal * ratio);
              return (
                <g key={ratio}>
                  <line
                    x1={paddingLeft}
                    y1={lineY}
                    x2={svgWidth - paddingRight}
                    y2={lineY}
                    className="stroke-slate-100 dark:stroke-slate-800/80"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={paddingLeft - 8}
                    y={lineY + 3}
                    textAnchor="end"
                    className="fill-slate-400 dark:fill-slate-600 font-mono text-[9px]"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {/* Baseline */}
            <line
              x1={paddingLeft}
              y1={paddingTop + plotHeight}
              x2={svgWidth - paddingRight}
              y2={paddingTop + plotHeight}
              className="stroke-slate-200 dark:stroke-slate-700"
              strokeWidth="1"
            />

            {/* Bars and labels */}
            {data.map((d, i) => {
              const barH = Math.max((d.value / maxVal) * plotHeight, d.value > 0 ? 4 : 0);
              const x = paddingLeft + i * slotWidth + (slotWidth - barWidth) / 2;
              const y = paddingTop + (plotHeight - barH);
              const labelX = x + barWidth / 2;
              const labelY = paddingTop + plotHeight + (shouldRotate ? 12 : 20);

              return (
                <g key={i} className="group cursor-pointer">
                  {/* Subtle hover backdrop for column */}
                  <rect
                    x={paddingLeft + i * slotWidth}
                    y={paddingTop}
                    width={slotWidth}
                    height={plotHeight}
                    className="fill-transparent group-hover:fill-slate-500/5 transition-colors rounded-lg"
                  />

                  {/* Tick marker */}
                  {shouldRotate && (
                    <line
                      x1={labelX}
                      y1={paddingTop + plotHeight}
                      x2={labelX}
                      y2={paddingTop + plotHeight + 5}
                      className="stroke-slate-300 dark:stroke-slate-700"
                      strokeWidth="1"
                    />
                  )}

                  {/* Bar */}
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barH}
                    rx={5}
                    ry={5}
                    fill={d.color}
                    className="transition-all hover:brightness-110"
                  >
                    <title>{`${d.label}: ${d.value} ticket${d.value === 1 ? '' : 's'} (${total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%)`}</title>
                  </rect>

                  {/* Value label on top of bar */}
                  <text
                    x={x + barWidth / 2}
                    y={Math.max(16, y - 6)}
                    textAnchor="middle"
                    className="fill-slate-800 dark:fill-slate-200 font-mono text-[11px] font-bold"
                  >
                    {d.value}
                  </text>

                  {/* X-axis category label (Angled or Horizontal) */}
                  <text
                    x={labelX}
                    y={labelY}
                    textAnchor={shouldRotate ? 'end' : 'middle'}
                    transform={shouldRotate ? `rotate(-35, ${labelX}, ${labelY})` : undefined}
                    className="fill-slate-600 dark:fill-slate-300 group-hover:fill-blue-600 dark:group-hover:fill-blue-400 text-[11px] font-medium transition-colors"
                    title={d.label}
                  >
                    {truncate(d.label, shouldRotate ? 19 : 16)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </ChartCard>
  );
}

// ===========================================================================
// 4. HorizontalBarChart Component (Clean flex layout, proportional bars)
// ===========================================================================
export interface HorizontalBarChartProps {
  data: ChartDatum[];
  title?: string;
  subtitle?: string;
  noCard?: boolean;
}

export function HorizontalBarChart({ data, title, subtitle, noCard }: HorizontalBarChartProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <ChartCard title={title} subtitle={subtitle} badge={`${data.length} items`} noCard={noCard}>
      {data.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-xs text-slate-400 dark:text-slate-500">
          No categories recorded
        </div>
      ) : (
        <div className="space-y-2.5">
          {data.map((d, i) => {
            const pct = (d.value / maxVal) * 100;
            const shareOfTotal = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0';

            return (
              <div key={i} className="group space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className="font-medium text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate max-w-[240px] sm:max-w-[360px]"
                    title={d.label}
                  >
                    {d.label}
                  </span>
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {d.value}
                    </span>
                    <span className="text-slate-400 dark:text-slate-500 text-[10px]">
                      ({shareOfTotal}%)
                    </span>
                  </div>
                </div>

                {/* Bar Track */}
                <div className="relative h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: d.color,
                      minWidth: d.value > 0 ? '6px' : '0',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

// ===========================================================================
// 5. MultiLineChart Component (Rolling 7-day category trends)
// ===========================================================================
export interface MultiLineSeries {
  id: string;
  name: string;
  color: string;
  points: Array<{ date: string; count: number }>;
}

export interface MultiLineChartProps {
  data?: Rolling7DayVelocityItem[];
  series?: MultiLineSeries[];
  title?: string;
  subtitle?: string;
  noCard?: boolean;
  height?: number;
}

const CATEGORY_COLOR_MAP: Record<string, string> = {
  'Hostel Maintenance': '#3b82f6',
  'Bus & Transport': '#f59e0b',
  'Network & Wi-Fi': '#10b981',
  'Electrical & AC': '#8b5cf6',
  'Food & Mess': '#ec4899',
  'Academic & Ragging': '#06b6d4',
  General: '#64748b',
};

export function MultiLineChart({
  data,
  series: propSeries,
  title,
  subtitle,
  noCard,
  height = 280,
}: MultiLineChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    date: string;
    category: string;
    count: number;
    x: number;
    y: number;
    color: string;
  } | null>(null);

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);

  // Derive series if raw rolling data is provided
  const series: MultiLineSeries[] = React.useMemo(() => {
    if (propSeries && propSeries.length > 0) return propSeries;
    if (!data || data.length === 0) return [];

    const dateSet = new Set<string>();
    const categoryMap = new Map<string, Map<string, number>>();

    data.forEach((item) => {
      dateSet.add(item.date);
      if (!categoryMap.has(item.category)) {
        categoryMap.set(item.category, new Map());
      }
      categoryMap.get(item.category)!.set(item.date, item.count);
    });

    const sortedDates = Array.from(dateSet).sort();
    const categories = Array.from(categoryMap.keys());

    return categories.map((cat, idx) => {
      const color =
        CATEGORY_COLOR_MAP[cat] ||
        CHART_COLORS[idx % CHART_COLORS.length];
      const points = sortedDates.map((d) => ({
        date: d,
        count: categoryMap.get(cat)?.get(d) ?? 0,
      }));
      return {
        id: cat,
        name: cat,
        color,
        points,
      };
    });
  }, [data, propSeries]);

  const allDates = React.useMemo(() => {
    if (series.length === 0) return [];
    return series[0].points.map((p) => p.date);
  }, [series]);

  const maxCount = React.useMemo(() => {
    let max = 0;
    series.forEach((s) => {
      s.points.forEach((p) => {
        if (p.count > max) max = p.count;
      });
    });
    return Math.max(max, 4);
  }, [series]);

  // Round up to nearest nice step
  const yMax = Math.ceil(maxCount / 5) * 5 || 5;

  // Layout math
  const width = 680;
  const paddingLeft = 45;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 40;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  const getX = (index: number): number => {
    if (allDates.length <= 1) return paddingLeft + plotWidth / 2;
    return paddingLeft + (index / (allDates.length - 1)) * plotWidth;
  };

  const getY = (count: number): number => {
    const clamped = Math.max(0, Math.min(yMax, count));
    return paddingTop + plotHeight - (clamped / yMax) * plotHeight;
  };

  const formatShortDate = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const visibleSeries = activeCategoryFilter
    ? series.filter((s) => s.name === activeCategoryFilter)
    : series;

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      badge={`${series.length} Categories`}
      noCard={noCard}
    >
      {series.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-xs text-slate-400 dark:text-slate-500">
          No rolling trend data recorded
        </div>
      ) : (
        <div className="space-y-3">
          {/* Category Filter Pills / Legend */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setActiveCategoryFilter(null)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                activeCategoryFilter === null
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All Categories
            </button>
            {series.map((s) => {
              const isSelected = activeCategoryFilter === s.name;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setActiveCategoryFilter(isSelected ? null : s.name)
                  }
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-offset-1 ring-blue-500 bg-slate-50 dark:bg-slate-800'
                      : 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span>{s.name}</span>
                </button>
              );
            })}
          </div>

          {/* Pure SVG Multi-Line Plot */}
          <div className="relative w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-auto select-none overflow-visible"
              aria-label="7-Day Rolling Incident Trend Multi-Line Chart"
            >
              {/* Horizontal Gridlines & Y-Axis Ticks */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                const tickVal = Math.round(yMax * ratio);
                const yPos = paddingTop + plotHeight - ratio * plotHeight;
                return (
                  <g key={i}>
                    <line
                      x1={paddingLeft}
                      y1={yPos}
                      x2={paddingLeft + plotWidth}
                      y2={yPos}
                      stroke="currentColor"
                      strokeDasharray={ratio === 0 ? '0' : '3 3'}
                      className="text-slate-200 dark:text-slate-800 stroke-[1]"
                    />
                    <text
                      x={paddingLeft - 8}
                      y={yPos + 3}
                      textAnchor="end"
                      className="text-[10px] font-mono fill-slate-400 dark:fill-slate-500"
                    >
                      {tickVal}
                    </text>
                  </g>
                );
              })}

              {/* X-Axis Dates */}
              {allDates.map((dateStr, i) => {
                const xPos = getX(i);
                return (
                  <g key={i}>
                    <line
                      x1={xPos}
                      y1={paddingTop + plotHeight}
                      x2={xPos}
                      y2={paddingTop + plotHeight + 5}
                      stroke="currentColor"
                      className="text-slate-300 dark:text-slate-700 stroke-[1]"
                    />
                    <text
                      x={xPos}
                      y={paddingTop + plotHeight + 18}
                      textAnchor="middle"
                      className="text-[10px] font-mono fill-slate-500 dark:fill-slate-400"
                    >
                      {formatShortDate(dateStr)}
                    </text>
                  </g>
                );
              })}

              {/* Series Lines & Data Points */}
              {visibleSeries.map((s) => {
                const pathCommands = s.points
                  .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx)} ${getY(p.count)}`)
                  .join(' ');

                return (
                  <g key={s.id} className="transition-opacity duration-200">
                    {/* Shadow / Glow line */}
                    <path
                      d={pathCommands}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="5"
                      strokeOpacity="0.12"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {/* Main stroke line */}
                    <path
                      d={pathCommands}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Nodes / Dots */}
                    {s.points.map((p, idx) => {
                      const cx = getX(idx);
                      const cy = getY(p.count);
                      const isHovered =
                        hoveredPoint?.category === s.name &&
                        hoveredPoint?.date === p.date;

                      return (
                        <g key={idx}>
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isHovered ? 6 : 3.5}
                            fill={s.color}
                            stroke="#ffffff"
                            strokeWidth="2"
                            className="cursor-pointer transition-all"
                            onMouseEnter={() =>
                              setHoveredPoint({
                                date: p.date,
                                category: s.name,
                                count: p.count,
                                x: cx,
                                y: cy,
                                color: s.color,
                              })
                            }
                            onMouseLeave={() => setHoveredPoint(null)}
                          />
                          {/* Larger invisible hitbox */}
                          <circle
                            cx={cx}
                            cy={cy}
                            r={12}
                            fill="transparent"
                            className="cursor-pointer"
                            onMouseEnter={() =>
                              setHoveredPoint({
                                date: p.date,
                                category: s.name,
                                count: p.count,
                                x: cx,
                                y: cy,
                                color: s.color,
                              })
                            }
                            onMouseLeave={() => setHoveredPoint(null)}
                          />
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Hover Tooltip Overlay */}
              {hoveredPoint && (
                <g
                  transform={`translate(${Math.min(
                    width - 130,
                    Math.max(paddingLeft, hoveredPoint.x - 60)
                  )}, ${Math.max(10, hoveredPoint.y - 50)})`}
                  className="pointer-events-none drop-shadow-md"
                >
                  <rect
                    width="120"
                    height="42"
                    rx="8"
                    className="fill-slate-900/95 dark:fill-slate-800/95 stroke stroke-slate-700/80"
                  />
                  <circle
                    cx="14"
                    cy="16"
                    r="4"
                    fill={hoveredPoint.color}
                  />
                  <text
                    x="24"
                    y="19"
                    className="text-[10px] font-bold fill-white"
                  >
                    {truncate(hoveredPoint.category, 14)}
                  </text>
                  <text
                    x="14"
                    y="34"
                    className="text-[10px] font-mono fill-slate-300"
                  >
                    {hoveredPoint.count} incidents &bull; {formatShortDate(hoveredPoint.date)}
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

// ===========================================================================
// 6. TransportHeatmap Component (Routes 1-12 Operational Matrix)
// ===========================================================================
export interface TransportHeatmapProps {
  routes: TransportRouteRollup[];
  peakStops?: string[];
  title?: string;
  subtitle?: string;
  noCard?: boolean;
}

export function TransportHeatmap({
  routes,
  peakStops = ['Bypass Junction', 'Tollgate Highway', 'South Gate Stop', 'Main Terminal'],
  title = 'Campus Transport Route Matrix (Routes 1–12)',
  subtitle = 'Delay frequencies, maintenance breakdowns, and capacity surges',
  noCard,
}: TransportHeatmapProps) {
  // Sort routes by numeric route number if available
  const sortedRoutes = React.useMemo(() => {
    return [...routes].sort((a, b) => {
      const numA = parseInt(a.route.replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(b.route.replace(/\D/g, ''), 10) || 0;
      return numA - numB;
    });
  }, [routes]);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      badge={`${routes.length} Active Routes`}
      noCard={noCard}
    >
      {/* Peak Congestion Corridors Strip */}
      {peakStops && peakStops.length > 0 && (
        <div className="mb-3.5 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-xl flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Peak Congestion Stops:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {peakStops.map((stop, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              >
                {stop}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Routes Grid / Matrix Table */}
      {sortedRoutes.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
          No transport route records found
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[10px] font-bold">
              <tr>
                <th className="py-2.5 px-3">Route ID</th>
                <th className="py-2.5 px-3">Delay Frequency</th>
                <th className="py-2.5 px-3">Maintenance Issues</th>
                <th className="py-2.5 px-3">Surge Index</th>
                <th className="py-2.5 px-3 text-right">Operational Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {sortedRoutes.map((r, i) => {
                const delayColor =
                  r.delayFrequencyPct >= 40
                    ? 'text-rose-600 dark:text-rose-400'
                    : r.delayFrequencyPct >= 20
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400';

                const progressBg =
                  r.delayFrequencyPct >= 40
                    ? 'bg-rose-500'
                    : r.delayFrequencyPct >= 20
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';

                return (
                  <tr
                    key={i}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Bus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>{r.route}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`font-mono font-bold text-xs ${delayColor}`}>
                          {r.delayFrequencyPct}%
                        </span>
                        <div className="w-20 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full ${progressBg}`}
                            style={{ width: `${Math.min(100, r.delayFrequencyPct)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700 dark:text-slate-300">
                      {r.maintenanceIncidents} reported
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[11px]">
                        {r.capacitySurgeIndex} pts
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          r.status === 'DELAYED'
                            ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                            : r.status === 'SURGE'
                            ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                            : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

// ===========================================================================
// 7. WifiMatrixGrid Component (Departmental AP & Switch Saturation Grid)
// ===========================================================================
export interface WifiMatrixGridProps {
  matrix: WifiDensityNode[];
  title?: string;
  subtitle?: string;
  noCard?: boolean;
}

export function WifiMatrixGrid({
  matrix,
  title = 'Wi-Fi & Network Incident Density Matrix',
  subtitle = 'AP controllers, floor distribution switches, and saturation levels',
  noCard,
}: WifiMatrixGridProps) {
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      badge={`${matrix.length} Access Nodes`}
      noCard={noCard}
    >
      {matrix.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
          No network matrix nodes recorded
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {matrix.map((node, i) => {
            const isHigh = node.densityLevel === 'HIGH';
            const isMedium = node.densityLevel === 'MEDIUM';

            const badgeBg = isHigh
              ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900'
              : isMedium
              ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900'
              : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900';

            const dotBg = isHigh
              ? 'bg-rose-500'
              : isMedium
              ? 'bg-amber-500'
              : 'bg-emerald-500';

            return (
              <div
                key={i}
                className="p-3.5 bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-blue-300 dark:hover:border-blue-700 transition-all space-y-2.5 shadow-2xs"
              >
                {/* Header: Dept Block & Density Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Wifi className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                      {node.departmentBlock}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${badgeBg}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dotBg}`} />
                    <span>{node.densityLevel}</span>
                  </span>
                </div>

                {/* Infrastructure Identifiers */}
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Radio className="w-3 h-3" /> AP Controller
                    </span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-[11px] block truncate">
                      {node.apController}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <Server className="w-3 h-3" /> Core Switch
                    </span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-[11px] block truncate">
                      {node.switchId}
                    </span>
                  </div>
                </div>

                {/* Incident count footer */}
                <div className="flex items-center justify-between text-[11px] pt-1 text-slate-500 dark:text-slate-400">
                  <span>Reported Incidents:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {node.incidentCount}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}

// ===========================================================================
// 8. RiskScoreDial Component (1-100 Monthly Severity Score Radial Dial)
// ===========================================================================
export interface RiskScoreDialProps {
  score: number; // 1-100
  level?: 'LOW' | 'ELEVATED' | 'HIGH_RISK';
  title?: string;
  subtitle?: string;
  size?: number;
  noCard?: boolean;
}

export function RiskScoreDial({
  score,
  level: propLevel,
  title = 'Campus Risk Severity Score',
  subtitle = 'Predictive monthly multi-factor index',
  size = 220,
  noCard,
}: RiskScoreDialProps) {
  const clampedScore = Math.min(100, Math.max(1, Math.round(score || 1)));

  const level =
    propLevel ||
    (clampedScore >= 75
      ? 'HIGH_RISK'
      : clampedScore >= 40
      ? 'ELEVATED'
      : 'LOW');

  const strokeColor =
    level === 'HIGH_RISK'
      ? '#ef4444' // red-500
      : level === 'ELEVATED'
      ? '#f59e0b' // amber-500
      : '#10b981'; // emerald-500

  const badgeStyle =
    level === 'HIGH_RISK'
      ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900'
      : level === 'ELEVATED'
      ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900'
      : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900';

  const badgeLabel =
    level === 'HIGH_RISK'
      ? 'HIGH RISK'
      : level === 'ELEVATED'
      ? 'ELEVATED RISK'
      : 'LOW RISK';

  // Indicator coordinate on semicircle (cx=120, cy=125, r=95)
  // angle 0 = left (25, 125), angle PI = right (215, 125)
  const angleRad = Math.PI * (1 - clampedScore / 100);
  const indicatorX = 120 - Math.cos(angleRad) * 95;
  const indicatorY = 125 - Math.sin(angleRad) * 95;

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      badge={`${clampedScore} / 100`}
      noCard={noCard}
    >
      <div className="flex flex-col items-center justify-center p-2">
        <div className="relative" style={{ width: size, height: size * 0.65 }}>
          <svg
            viewBox="0 0 240 150"
            className="w-full h-auto overflow-visible select-none"
            aria-label={`Campus Risk Score Gauge: ${clampedScore} / 100 (${badgeLabel})`}
          >
            {/* Background Semicircle Arc */}
            <path
              d="M 25,125 A 95,95 0 0,1 215,125"
              fill="none"
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-800 stroke-[14]"
              strokeLinecap="round"
            />

            {/* Colored Progress Arc */}
            <path
              d="M 25,125 A 95,95 0 0,1 215,125"
              fill="none"
              stroke={strokeColor}
              strokeWidth="14"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray="100"
              strokeDashoffset={100 - clampedScore}
              className="transition-all duration-700 ease-out"
            />

            {/* Indicator Dot */}
            <circle
              cx={indicatorX}
              cy={indicatorY}
              r="6.5"
              fill={strokeColor}
              stroke="#ffffff"
              strokeWidth="2.5"
              className="drop-shadow-xs transition-all duration-700 ease-out"
            />

            {/* Center Numeric Readout */}
            <text
              x="120"
              y="108"
              textAnchor="middle"
              className="font-mono font-black text-3xl fill-slate-900 dark:fill-white"
            >
              {clampedScore}
            </text>
            <text
              x="120"
              y="125"
              textAnchor="middle"
              className="text-[10px] font-semibold uppercase tracking-wider fill-slate-400 dark:fill-slate-500"
            >
              Severity Score
            </text>

            {/* Min / Max Labels */}
            <text
              x="25"
              y="142"
              textAnchor="middle"
              className="text-[9px] font-mono fill-slate-400 dark:fill-slate-500"
            >
              1
            </text>
            <text
              x="215"
              y="142"
              textAnchor="middle"
              className="text-[9px] font-mono fill-slate-400 dark:fill-slate-500"
            >
              100
            </text>
          </svg>
        </div>

        {/* Qualitative Level Pill */}
        <div className="mt-2 text-center">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border shadow-2xs ${badgeStyle}`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{badgeLabel}</span>
          </span>
        </div>
      </div>
    </ChartCard>
  );
}

