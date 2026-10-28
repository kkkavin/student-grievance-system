import React from 'react';

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
