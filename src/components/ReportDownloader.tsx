import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, ChevronDown, FileText, Check, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Grievance } from '../types';

interface ReportDownloaderProps {
  grievances: Grievance[];
}

// ---------------------------------------------------------------------------
// Date & Time formatting helpers
// ---------------------------------------------------------------------------

function formatDate(isoStr?: string): string {
  if (!isoStr) return 'N/A';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return isoStr || 'N/A';
  }
}

function formatTime(isoStr?: string): string {
  if (!isoStr) return 'N/A';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

function formatDateTime(isoStr?: string): string {
  if (!isoStr) return 'N/A';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return `${formatDate(isoStr)} ${formatTime(isoStr)}`;
  } catch {
    return isoStr || 'N/A';
  }
}

// ---------------------------------------------------------------------------
// Column width auto-calculation for Excel worksheets
// ---------------------------------------------------------------------------

function calculateColWidths(aoa: (string | number | undefined | null)[][]): { wch: number }[] {
  const colWidths: number[] = [];
  aoa.forEach((row) => {
    row.forEach((cell, colIndex) => {
      if (cell != null) {
        // Use first line length if multi-line string
        const str = String(cell).split('\n')[0];
        const len = str.length;
        colWidths[colIndex] = Math.max(colWidths[colIndex] || 10, Math.min(len + 3, 60));
      }
    });
  });
  return colWidths.map((w) => ({ wch: w }));
}

// ---------------------------------------------------------------------------
// Excel report workbook generator (.xlsx)
// ---------------------------------------------------------------------------

export function generateExcelWorkbook(grievances: Grievance[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // 1. Data sorting: newest first
  const sorted = [...grievances].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // 2. Metrics calculation
  const total = grievances.length;
  const active = grievances.filter((g) => g.status !== 'resolved' && !g.isSpam).length;
  const resolved = grievances.filter((g) => g.status === 'resolved').length;
  const spam = grievances.filter((g) => g.isSpam).length;
  const pending = grievances.filter((g) => (g.status === 'pending' || !g.status) && !g.isSpam).length;
  const inProgress = grievances.filter((g) => g.status === 'in_progress' && !g.isSpam).length;
  const urgent = grievances.filter((g) => g.priority === 'urgent' && !g.isSpam).length;
  const medium = grievances.filter((g) => g.priority === 'medium' && !g.isSpam).length;
  const lessImportant = grievances.filter((g) => g.priority === 'less_important' && !g.isSpam).length;
  const hosteller = grievances.filter((g) => g.studentType === 'hosteller' && !g.isSpam).length;
  const dayscholar = grievances.filter((g) => g.studentType === 'dayscholar' && !g.isSpam).length;
  const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) : '0.0';

  // =========================================================================
  // SHEET 1: ALL GRIEVANCES (Comprehensive tabular data)
  // =========================================================================
  const grievancesHeaders = [
    'Ticket No',
    'Status',
    'Priority',
    'Category',
    'Student Name',
    'Student Reg No',
    'Student Email',
    'Student Phone',
    'Student Type',
    'Hostel Block',
    'Room No',
    'Date Submitted',
    'Time Submitted',
    'Date Resolved',
    'Is Spam',
    'Spam Reason',
    'AI Suggested Category',
    'AI Confidence',
    'Admin Remarks / Notes',
    'Description',
  ];

  const grievancesRows: (string | number)[][] = sorted.map((g) => {
    const statusLabel = g.isSpam
      ? 'Spam'
      : g.status === 'resolved'
      ? 'Resolved'
      : g.status === 'in_progress'
      ? 'In Progress'
      : 'Pending';

    const priorityLabel =
      g.priority === 'urgent'
        ? 'Urgent'
        : g.priority === 'medium'
        ? 'Medium'
        : g.priority === 'less_important'
        ? 'Less Important'
        : 'Unassigned';

    const studentTypeLabel =
      g.studentType === 'hosteller'
        ? 'Hosteller'
        : g.studentType === 'dayscholar'
        ? 'Day Scholar'
        : g.studentType || 'N/A';

    const hostelBlockLabel = g.hostelBlock
      ? g.hostelBlock
      : g.studentType === 'dayscholar'
      ? 'N/A (Day Scholar)'
      : 'N/A';

    const roomNoLabel = g.roomNo
      ? g.roomNo
      : g.studentType === 'dayscholar'
      ? 'N/A (Day Scholar)'
      : 'N/A';

    const resolvedDateLabel = g.resolvedAt ? formatDateTime(g.resolvedAt) : 'Pending Resolution';

    const spamReasonLabel =
      g.spamReason ||
      (g.aiClassification?.isSpam ? g.aiClassification.reason : '') ||
      (g.isSpam ? 'Flagged as Spam' : 'N/A');

    const aiCategoryLabel = g.aiClassification?.suggestedCategory || 'N/A';

    const aiConfidenceLabel =
      g.aiClassification?.confidence != null
        ? `${Math.round(g.aiClassification.confidence * 100)}%`
        : 'N/A';

    return [
      g.ticketNo || g.id,
      statusLabel,
      priorityLabel,
      g.category || 'General',
      g.studentName || 'Anonymous',
      g.studentRegNo || 'N/A',
      g.studentEmail || 'N/A',
      g.studentPhone || 'N/A',
      studentTypeLabel,
      hostelBlockLabel,
      roomNoLabel,
      formatDate(g.createdAt),
      formatTime(g.createdAt),
      resolvedDateLabel,
      g.isSpam ? 'Yes' : 'No',
      spamReasonLabel,
      aiCategoryLabel,
      aiConfidenceLabel,
      g.adminNotes || '',
      g.description || '',
    ];
  });

  const allGrievancesAoa = [
    grievancesHeaders,
    ...(grievancesRows.length > 0 ? grievancesRows : [['No grievances recorded yet']]),
  ];

  const wsGrievances = XLSX.utils.aoa_to_sheet(allGrievancesAoa);
  wsGrievances['!cols'] = calculateColWidths(allGrievancesAoa);
  XLSX.utils.book_append_sheet(wb, wsGrievances, 'All Grievances');

  // =========================================================================
  // SHEET 2: EXECUTIVE SUMMARY (High-level KPIs, distributions, statistics)
  // =========================================================================
  const summaryAoa: (string | number)[][] = [
    ['STUDENT GRIEVANCE REDRESSAL SYSTEM - EXECUTIVE SUMMARY REPORT'],
    ['Report Generated Date:', `${dateStr} at ${timeStr}`],
    ['Total Grievance Records:', total],
    [],
    ['KEY PERFORMANCE INDICATORS (KPIs)', 'COUNT', 'SHARE / DETAILS'],
    ['Total Grievances Logged', total, '100.0%'],
    ['Active Unresolved Complaints', active, total > 0 ? `${((active / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Successfully Resolved Complaints', resolved, total > 0 ? `${((resolved / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Overall Resolution Rate', `${resolutionRate}%`, 'Resolved vs Total'],
    ['Flagged as Spam / Inappropriate', spam, total > 0 ? `${((spam / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Urgent Attention Required', urgent, total > 0 ? `${((urgent / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Medium Priority', medium, total > 0 ? `${((medium / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Low / Less Important Priority', lessImportant, total > 0 ? `${((lessImportant / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Hosteller Grievances', hosteller, total > 0 ? `${((hosteller / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Day Scholar Grievances', dayscholar, total > 0 ? `${((dayscholar / total) * 100).toFixed(1)}%` : '0.0%'],
    [],
    ['STATUS DISTRIBUTION', 'COUNT', 'PERCENTAGE'],
    ['Pending Triage', pending, total > 0 ? `${((pending / total) * 100).toFixed(1)}%` : '0.0%'],
    ['In Progress', inProgress, total > 0 ? `${((inProgress / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Resolved', resolved, total > 0 ? `${((resolved / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Flagged as Spam', spam, total > 0 ? `${((spam / total) * 100).toFixed(1)}%` : '0.0%'],
    [],
    ['PRIORITY BREAKDOWN', 'COUNT', 'PERCENTAGE'],
    ['Urgent', urgent, total > 0 ? `${((urgent / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Medium', medium, total > 0 ? `${((medium / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Less Important', lessImportant, total > 0 ? `${((lessImportant / total) * 100).toFixed(1)}%` : '0.0%'],
    [],
    ['STUDENT DEMOGRAPHICS', 'COUNT', 'PERCENTAGE'],
    ['Hostellers', hosteller, total > 0 ? `${((hosteller / total) * 100).toFixed(1)}%` : '0.0%'],
    ['Day Scholars', dayscholar, total > 0 ? `${((dayscholar / total) * 100).toFixed(1)}%` : '0.0%'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  wsSummary['!cols'] = calculateColWidths(summaryAoa);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // =========================================================================
  // SHEET 3: CATEGORY ANALYTICS (Detailed category-level metrics)
  // =========================================================================
  const categoryMap = new Map<
    string,
    { total: number; active: number; resolved: number; urgent: number; spam: number }
  >();

  grievances.forEach((g) => {
    const cat = g.category || 'General';
    const entry = categoryMap.get(cat) || { total: 0, active: 0, resolved: 0, urgent: 0, spam: 0 };
    entry.total += 1;
    if (g.isSpam) {
      entry.spam += 1;
    } else if (g.status === 'resolved') {
      entry.resolved += 1;
    } else {
      entry.active += 1;
    }
    if (g.priority === 'urgent' && !g.isSpam) {
      entry.urgent += 1;
    }
    categoryMap.set(cat, entry);
  });

  const categoryRows = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, data]) => {
      const catResRate = data.total > 0 ? `${((data.resolved / data.total) * 100).toFixed(1)}%` : '0.0%';
      const catShare = total > 0 ? `${((data.total / total) * 100).toFixed(1)}%` : '0.0%';
      return [
        cat,
        data.total,
        data.active,
        data.resolved,
        data.urgent,
        data.spam,
        catResRate,
        catShare,
      ];
    });

  const categoryAoa: (string | number)[][] = [
    [
      'Category Name',
      'Total Complaints',
      'Active (Unresolved)',
      'Resolved',
      'Urgent Priority',
      'Flagged as Spam',
      'Resolution Rate',
      'Share of Total',
    ],
    ...(categoryRows.length > 0
      ? categoryRows
      : [['No categories recorded', 0, 0, 0, 0, 0, '0.0%', '0.0%']]),
    [],
    [
      'TOTAL',
      total,
      active,
      resolved,
      urgent,
      spam,
      `${resolutionRate}%`,
      '100.0%',
    ],
  ];

  const wsCategory = XLSX.utils.aoa_to_sheet(categoryAoa);
  wsCategory['!cols'] = calculateColWidths(categoryAoa);
  XLSX.utils.book_append_sheet(wb, wsCategory, 'Category Analytics');

  return wb;
}

// ---------------------------------------------------------------------------
// Export helper functions
// ---------------------------------------------------------------------------

export function downloadExcelReport(grievances: Grievance[]) {
  const wb = generateExcelWorkbook(grievances);
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const fileName = `grievance-report-${yyyy}-${mm}-${dd}.xlsx`;

  triggerBrowserDownload(blob, fileName);
}

export function downloadCSVReport(grievances: Grievance[]) {
  const wb = generateExcelWorkbook(grievances);
  const ws = wb.Sheets['All Grievances'];
  const csvContent = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const fileName = `grievance-report-${yyyy}-${mm}-${dd}.csv`;

  triggerBrowserDownload(blob, fileName);
}

export function downloadHTMLReport(grievances: Grievance[]) {
  const html = generateReportHTML(grievances);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const fileName = `grievance-report-${yyyy}-${mm}-${dd}.html`;

  triggerBrowserDownload(blob, fileName);
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// SVG math helpers & HTML report generator (Retained for printable report)
// ---------------------------------------------------------------------------

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describePieSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#84cc16', '#e11d48',
];

function generateReportHTML(grievances: Grievance[]): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // Summary stats
  const total = grievances.length;
  const active = grievances.filter((g) => g.status !== 'resolved' && !g.isSpam).length;
  const resolved = grievances.filter((g) => g.status === 'resolved').length;
  const spam = grievances.filter((g) => g.isSpam).length;
  const urgent = grievances.filter((g) => g.priority === 'urgent').length;
  const medium = grievances.filter((g) => g.priority === 'medium').length;
  const lessImportant = grievances.filter((g) => g.priority === 'less_important').length;
  const resolutionRate = total > 0 ? ((resolved / total) * 100).toFixed(1) : '0.0';

  // Category distribution
  const categoryMap = new Map<string, number>();
  grievances.forEach((g) => categoryMap.set(g.category, (categoryMap.get(g.category) || 0) + 1));
  const categoryData = Array.from(categoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: CHART_COLORS[i % CHART_COLORS.length] }));

  // Status distribution
  const pending = grievances.filter((g) => g.status === 'pending' || g.status === 'in_progress').length;
  const statusData = [
    { label: 'Pending', value: pending, color: '#3b82f6' },
    { label: 'Resolved', value: resolved, color: '#10b981' },
    { label: 'Spam', value: spam, color: '#f59e0b' },
  ].filter((d) => d.value > 0);

  // Priority distribution
  const priorityData = [
    { label: 'Urgent', value: urgent, color: '#ef4444' },
    { label: 'Medium', value: medium, color: '#f59e0b' },
    { label: 'Less Important', value: lessImportant, color: '#9ca3af' },
  ].filter((d) => d.value > 0);

  // Student type distribution
  const hosteller = grievances.filter((g) => g.studentType === 'hosteller').length;
  const dayscholar = grievances.filter((g) => g.studentType === 'dayscholar').length;
  const studentTypeData = [
    { label: 'Hosteller', value: hosteller, color: '#3b82f6' },
    { label: 'Dayscholar', value: dayscholar, color: '#f59e0b' },
  ];

  function buildPieSVG(data: { label: string; value: number; color: string }[], size: number): string {
    const pieTotal = data.reduce((s, d) => s + d.value, 0);
    if (pieTotal === 0) return '<p style="text-align:center;color:#94a3b8;padding:40px 0;">No data</p>';
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;

    let paths = '';
    if (data.length === 1) {
      paths = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${data[0].color}" stroke="white" stroke-width="2"/>`;
    } else {
      let cumAngle = 0;
      data.forEach((d) => {
        const sliceAngle = (d.value / pieTotal) * 360;
        const startAngle = cumAngle;
        const endAngle = cumAngle + sliceAngle;
        cumAngle = endAngle;
        const pathD = describePieSlice(cx, cy, r, startAngle, endAngle);
        paths += `<path d="${pathD}" fill="${d.color}" stroke="white" stroke-width="2" stroke-linejoin="round"/>`;
      });
    }

    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;margin:0 auto;">${paths}</svg>`;

    let legend = '<div style="display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:12px;justify-content:center;">';
    data.forEach((d) => {
      const pct = pieTotal > 0 ? ((d.value / pieTotal) * 100).toFixed(1) : '0.0';
      legend += `<div style="display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${d.color};flex-shrink:0;"></span>
        <span style="font-size:11px;color:#475569;">${escapeHtml(d.label)} <strong style="color:#1e293b;">${d.value}</strong> (${pct}%)</span>
      </div>`;
    });
    legend += '</div>';

    return svg + legend;
  }

  function buildBarSVG(data: { label: string; value: number; color: string }[], width: number, height: number): string {
    if (data.length === 0) return '<p style="text-align:center;color:#94a3b8;padding:40px 0;">No data</p>';
    const shouldRotate = data.length > 4 || data.some((d) => d.label.length > 12);
    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const paddingTop = 28;
    const paddingBottom = shouldRotate ? 70 : 38;
    const paddingLeft = shouldRotate ? 55 : 20;
    const chartH = height - paddingTop - paddingBottom;
    const barW = Math.min(42, Math.max(22, (width / data.length) * 0.45));
    const gap = Math.max(68, (width - paddingLeft - 20) / data.length);
    const svgWidth = Math.max(data.length * gap + paddingLeft + 20, width);

    let bars = '';
    data.forEach((d, i) => {
      const x = paddingLeft + i * gap + (gap - barW) / 2;
      const barH = Math.max((d.value / maxVal) * chartH, d.value > 0 ? 4 : 0);
      const y = paddingTop + (chartH - barH);
      const labelX = x + barW / 2;
      bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${d.color}"/>`;
      bars += `<text x="${labelX}" y="${Math.max(14, y - 6)}" text-anchor="middle" style="font-size:11px;font-weight:700;font-family:monospace;fill:#1e293b;">${d.value}</text>`;

      if (shouldRotate) {
        const labelY = paddingTop + chartH + 12;
        bars += `<text x="${labelX}" y="${labelY}" text-anchor="end" transform="rotate(-35 ${labelX} ${labelY})" style="font-size:10px;font-weight:500;fill:#475569;">${escapeHtml(truncate(d.label, 18))}</text>`;
      } else {
        bars += `<text x="${labelX}" y="${paddingTop + chartH + 18}" text-anchor="middle" style="font-size:11px;font-weight:500;fill:#475569;">${escapeHtml(truncate(d.label, 16))}</text>`;
      }
    });

    return `<svg width="100%" height="${height}" viewBox="0 0 ${svgWidth} ${height}" style="display:block;margin:0 auto;">${bars}</svg>`;
  }

  function buildHorizontalBarSVG(data: { label: string; value: number; color: string }[]): string {
    if (data.length === 0) return '<p style="text-align:center;color:#94a3b8;padding:40px 0;">No data</p>';
    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const barH = 24;
    const gap = 6;
    const labelW = 180;
    const barAreaW = 300;
    const valueW = 50;
    const totalW = labelW + barAreaW + valueW + 20;
    const totalH = data.length * (barH + gap) + gap;

    let bars = '';
    data.forEach((d, i) => {
      const y = i * (barH + gap) + gap;
      const barWidth = (d.value / maxVal) * barAreaW;
      bars += `<text x="${labelW - 8}" y="${y + barH / 2 + 1}" text-anchor="end" dominant-baseline="central" style="font-size:11px;fill:#475569;">${escapeHtml(truncate(d.label, 24))}</text>`;
      bars += `<rect x="${labelW}" y="${y}" width="${barAreaW}" height="${barH}" rx="4" fill="#f1f5f9"/>`;
      if (d.value > 0) {
        bars += `<rect x="${labelW}" y="${y}" width="${Math.max(barWidth, 4)}" height="${barH}" rx="4" fill="${d.color}"/>`;
      }
      bars += `<text x="${labelW + barAreaW + 12}" y="${y + barH / 2 + 1}" dominant-baseline="central" style="font-size:12px;font-weight:600;fill:#334155;">${d.value}</text>`;
    });

    return `<svg width="100%" viewBox="0 0 ${totalW} ${totalH}" style="display:block;max-width:600px;margin:0 auto;">${bars}</svg>`;
  }

  function buildDataTable(): string {
    const sortedList = [...grievances].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    let rows = '';
    sortedList.forEach((g, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
      const statusLabel = g.isSpam ? 'Spam' : g.status === 'resolved' ? 'Resolved' : g.status === 'in_progress' ? 'In Progress' : 'Pending';
      const statusColor = g.isSpam ? '#f59e0b' : g.status === 'resolved' ? '#10b981' : '#3b82f6';
      const priorityLabel = g.priority === 'urgent' ? 'Urgent' : g.priority === 'medium' ? 'Medium' : g.priority === 'less_important' ? 'Less Important' : '—';
      const priorityColor = g.priority === 'urgent' ? '#ef4444' : g.priority === 'medium' ? '#f59e0b' : '#9ca3af';
      const dateFormatted = new Date(g.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      const desc = truncate(g.description, 80);

      rows += `<tr style="background:${bg};">
        <td style="padding:8px 12px;font-size:12px;font-weight:600;white-space:nowrap;">${escapeHtml(g.ticketNo || g.id)}</td>
        <td style="padding:8px 12px;font-size:12px;">${escapeHtml(g.studentName || 'Anonymous')}</td>
        <td style="padding:8px 12px;font-size:12px;font-family:monospace;">${escapeHtml(g.studentRegNo || 'N/A')}</td>
        <td style="padding:8px 12px;font-size:12px;">${escapeHtml(g.category || 'General')}</td>
        <td style="padding:8px 12px;font-size:12px;"><span style="display:inline-block;padding:2px 8px;border-radius:12px;background:${statusColor}22;color:${statusColor};font-weight:600;font-size:11px;">${statusLabel}</span></td>
        <td style="padding:8px 12px;font-size:12px;"><span style="color:${priorityColor};font-weight:600;">${priorityLabel}</span></td>
        <td style="padding:8px 12px;font-size:12px;white-space:nowrap;">${dateFormatted}</td>
        <td style="padding:8px 12px;font-size:11px;color:#64748b;max-width:300px;">${escapeHtml(desc)}</td>
      </tr>`;
    });

    return `<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;border-bottom:2px solid #e2e8f0;">Ticket No</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;border-bottom:2px solid #e2e8f0;">Student Name</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;border-bottom:2px solid #e2e8f0;">Reg No</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;border-bottom:2px solid #e2e8f0;">Category</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;border-bottom:2px solid #e2e8f0;">Status</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;border-bottom:2px solid #e2e8f0;">Priority</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;border-bottom:2px solid #e2e8f0;">Date</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#475569;border-bottom:2px solid #e2e8f0;">Description</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Grievance Analytics Report – ${escapeHtml(dateStr)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: #ffffff;
    color: #1e293b;
    padding: 32px;
    line-height: 1.6;
  }
  .header {
    text-align: center;
    margin-bottom: 36px;
    padding-bottom: 20px;
    border-bottom: 2px solid #e2e8f0;
  }
  .header h1 {
    font-size: 24px;
    font-weight: 800;
    color: #0f172a;
    margin-bottom: 4px;
  }
  .header .subtitle {
    font-size: 13px;
    color: #64748b;
  }
  .section {
    margin-bottom: 32px;
  }
  .section-title {
    font-size: 15px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #334155;
    margin-bottom: 14px;
    padding-bottom: 6px;
    border-bottom: 1px solid #e2e8f0;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
  .summary-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 16px;
    text-align: center;
  }
  .summary-card .label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    margin-bottom: 4px;
  }
  .summary-card .value {
    font-size: 28px;
    font-weight: 800;
    color: #0f172a;
  }
  .summary-card .value.blue { color: #3b82f6; }
  .summary-card .value.green { color: #10b981; }
  .summary-card .value.amber { color: #f59e0b; }
  .summary-card .value.red { color: #ef4444; }
  .summary-card .value.gray { color: #9ca3af; }
  .charts-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
    margin-bottom: 32px;
  }
  .chart-box {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 20px;
  }
  .chart-box h3 {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #334155;
    margin-bottom: 16px;
  }
  .full-width { grid-column: span 2; }
  @media print {
    body { padding: 16px; }
    .summary-grid { grid-template-columns: repeat(4, 1fr); }
    .charts-grid { grid-template-columns: repeat(2, 1fr); }
    .chart-box, .summary-card { break-inside: avoid; }
    table { font-size: 10px; }
    .section { break-inside: avoid; }
  }
  @media (max-width: 768px) {
    .summary-grid { grid-template-columns: repeat(2, 1fr); }
    .charts-grid { grid-template-columns: 1fr; }
    .full-width { grid-column: span 1; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>Student Grievance Analytics Report</h1>
  <div class="subtitle">Generated on ${escapeHtml(dateStr)} at ${escapeHtml(timeStr)}</div>
</div>

<div class="section">
  <div class="section-title">Summary Statistics</div>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Total Grievances</div>
      <div class="value">${total}</div>
    </div>
    <div class="summary-card">
      <div class="label">Active</div>
      <div class="value blue">${active}</div>
    </div>
    <div class="summary-card">
      <div class="label">Resolved</div>
      <div class="value green">${resolved}</div>
    </div>
    <div class="summary-card">
      <div class="label">Spam Flagged</div>
      <div class="value amber">${spam}</div>
    </div>
  </div>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">Urgent</div>
      <div class="value red">${urgent}</div>
    </div>
    <div class="summary-card">
      <div class="label">Medium</div>
      <div class="value amber">${medium}</div>
    </div>
    <div class="summary-card">
      <div class="label">Less Important</div>
      <div class="value gray">${lessImportant}</div>
    </div>
    <div class="summary-card">
      <div class="label">Resolution Rate</div>
      <div class="value green">${resolutionRate}%</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Visual Analytics</div>
  <div class="charts-grid">
    <div class="chart-box">
      <h3>Grievances by Category</h3>
      ${buildPieSVG(categoryData, 200)}
    </div>
    <div class="chart-box">
      <h3>Grievances by Status</h3>
      ${buildPieSVG(statusData, 200)}
    </div>
    <div class="chart-box">
      <h3>Grievances by Priority</h3>
      ${buildPieSVG(priorityData, 200)}
    </div>
    <div class="chart-box">
      <h3>Grievances by Student Type</h3>
      ${buildBarSVG(studentTypeData, 200, 220)}
    </div>
    <div class="chart-box full-width">
      <h3>Top Categories by Count</h3>
      ${buildHorizontalBarSVG(categoryData)}
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">All Grievances (${total})</div>
  <div style="overflow-x:auto;">
    ${buildDataTable()}
  </div>
</div>

<div style="text-align:center;padding:24px 0 8px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;margin-top:24px;">
  Student Grievance Support System &mdash; Report generated automatically
</div>

</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ReportDownloader: React.FC<ReportDownloaderProps> = ({ grievances }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDownloadExcel = () => {
    setIsGenerating(true);
    setTimeout(() => {
      try {
        downloadExcelReport(grievances);
        setDownloadSuccess('Excel');
        setTimeout(() => setDownloadSuccess(null), 2200);
      } catch (err) {
        console.error('Failed to generate Excel report:', err);
      } finally {
        setIsGenerating(false);
      }
    }, 40);
  };

  const handleDownloadHTML = () => {
    setIsGenerating(true);
    setTimeout(() => {
      try {
        downloadHTMLReport(grievances);
        setDownloadSuccess('HTML');
        setTimeout(() => setDownloadSuccess(null), 2200);
      } catch (err) {
        console.error('Failed to generate HTML report:', err);
      } finally {
        setIsGenerating(false);
      }
    }, 40);
  };

  const handleDownloadCSV = () => {
    setIsGenerating(true);
    setTimeout(() => {
      try {
        downloadCSVReport(grievances);
        setDownloadSuccess('CSV');
        setTimeout(() => setDownloadSuccess(null), 2200);
      } catch (err) {
        console.error('Failed to generate CSV report:', err);
      } finally {
        setIsGenerating(false);
      }
    }, 40);
  };

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* Unified Pill Container matching the dark dashboard aesthetic */}
      <div className="inline-flex items-center bg-slate-800/80 hover:bg-slate-800/95 backdrop-blur-md border border-slate-700/80 hover:border-slate-600 rounded-2xl p-1 shadow-sm transition-all duration-200">
        {/* Primary Action Button: Downloads Excel Report */}
        <button
          type="button"
          onClick={handleDownloadExcel}
          disabled={isGenerating}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:from-emerald-700 active:to-teal-700 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-xs cursor-pointer active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed group"
          title="Download complete report data as an Excel (.xlsx) file"
        >
          {isGenerating ? (
            <>
              <Loader2 size={14} className="animate-spin text-emerald-100" />
              <span>Generating...</span>
            </>
          ) : downloadSuccess ? (
            <>
              <Check size={14} className="text-white animate-bounce" />
              <span>Downloaded {downloadSuccess}!</span>
            </>
          ) : (
            <>
              <FileSpreadsheet size={15} className="text-emerald-100 group-hover:scale-105 transition-transform" />
              <span>Download Report</span>
              <span className="px-1.5 py-0.5 bg-emerald-950/50 border border-emerald-400/30 text-emerald-200 text-[10px] font-semibold rounded font-mono">
                .XLSX
              </span>
            </>
          )}
        </button>

        {/* Format Dropdown Trigger */}
        <button
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="px-2 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all cursor-pointer flex items-center justify-center ml-0.5"
          title="Choose export format (.xlsx, .html, .csv)"
          aria-label="Select report format"
          aria-expanded={isMenuOpen}
        >
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${isMenuOpen ? 'rotate-180 text-emerald-400' : ''}`}
          />
        </button>
      </div>

      {/* Format Options Dropdown Menu */}
      {isMenuOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl z-50 p-2 text-xs text-slate-200 space-y-1 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-2 border-b border-slate-800/80 mb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Export Report Data</span>
            <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
              {grievances.length} records
            </span>
          </div>

          {/* Option 1: Excel */}
          <button
            type="button"
            onClick={() => {
              handleDownloadExcel();
              setIsMenuOpen(false);
            }}
            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800/90 transition-colors flex items-start gap-2.5 cursor-pointer group"
          >
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500/25 shrink-0 transition-colors">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white flex items-center gap-1.5">
                Excel Workbook
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono font-bold">
                  .XLSX
                </span>
                <span className="text-[9px] bg-indigo-500/30 text-indigo-200 px-1.5 rounded uppercase tracking-wider font-semibold">
                  Default
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                Full 3-sheet workbook: All Grievances, Executive Summary, & Category Analytics
              </div>
            </div>
          </button>

          {/* Option 2: HTML */}
          <button
            type="button"
            onClick={() => {
              handleDownloadHTML();
              setIsMenuOpen(false);
            }}
            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800/90 transition-colors flex items-start gap-2.5 cursor-pointer group"
          >
            <div className="p-2 rounded-lg bg-blue-500/15 text-blue-400 group-hover:bg-blue-500/25 shrink-0 transition-colors">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white flex items-center gap-1.5">
                Printable HTML Report
                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded font-mono font-bold">
                  .HTML
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                Self-contained visual report with vector charts and formatted tables
              </div>
            </div>
          </button>

          {/* Option 3: CSV */}
          <button
            type="button"
            onClick={() => {
              handleDownloadCSV();
              setIsMenuOpen(false);
            }}
            className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-800/90 transition-colors flex items-start gap-2.5 cursor-pointer group"
          >
            <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 group-hover:bg-amber-500/25 shrink-0 transition-colors">
              <Download className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white flex items-center gap-1.5">
                Raw Grievance Data
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono font-bold">
                  .CSV
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                Raw comma-separated data table for database ingestion and custom scripts
              </div>
            </div>
          </button>

          <div className="px-3 py-1.5 text-[10px] text-slate-500 border-t border-slate-800/80 mt-1 flex items-center justify-between">
            <span>Live Redressal Data</span>
            <span>Auto-formatted columns</span>
          </div>
        </div>
      )}
    </div>
  );
};
