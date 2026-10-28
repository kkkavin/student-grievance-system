import React, { useState, useMemo } from 'react';
import {
  Shield,
  Star,
  CheckCircle2,
  Clock,
  AlertOctagon,
  Search,
  Filter,
  ArrowUpDown,
  Mail,
  User,
  Building,
  Phone,
  Calendar,
  Sparkles,
  ChevronRight,
  Eye,
  Check,
  Ban,
  BarChart2,
  PieChart as PieChartIcon,
  CircleDot,
  AlignLeft,
  X,
  RotateCcw,
  AlertTriangle,
  ChevronLeft,
  ChevronDown,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { Grievance, PriorityLevel, GrievanceStatus } from '../types';
import {
  PieChart,
  BarChart,
  HorizontalBarChart,
  DonutChart,
  CHART_COLORS,
  ChartDatum,
} from './Charts';
import { ReportDownloader } from './ReportDownloader';

interface AdminDashboardProps {
  grievances: Grievance[];
  onUpdatePriority: (id: string, priority: PriorityLevel) => void;
  onMarkDone: (id: string, customResolutionNote?: string) => void;
  onReopen?: (id: string) => void;
}

const ITEMS_PER_PAGE = 8;

export type VisualType = 'bar' | 'horizontal_bar' | 'pie' | 'donut' | 'ledger';
export type VisualDimension = 'category' | 'status' | 'priority' | 'residency';
export type ActiveViewSection = 'queue' | 'analytics';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  grievances,
  onUpdatePriority,
  onMarkDone,
  onReopen,
}) => {
  // ---------------------------------------------------------------------------
  // 1. Navigation & View Toggle State (Default to 'queue' = Grievance List)
  // ---------------------------------------------------------------------------
  const [activeViewSection, setActiveViewSection] = useState<ActiveViewSection>('queue');

  // Feature 3: Visual Analytics Type & Dimension choice
  const [visualType, setVisualType] = useState<VisualType>('bar');
  const [visualDimension, setVisualDimension] = useState<VisualDimension>('category');

  // Feature 1: Filter States (Permanent at top, below Download Report)
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [studentTypeFilter, setStudentTypeFilter] = useState<'all' | 'hosteller' | 'dayscholar'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'resolved' | 'spam'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'medium' | 'less_important'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Feature 2: Sort State
  const [sortOption, setSortOption] = useState<string>('date_desc');

  // Pagination & Inspection Modal States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedComplaint, setSelectedComplaint] = useState<Grievance | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // 2. Data Deduplication & Resilient Helpers
  // ---------------------------------------------------------------------------
  const uniqueGrievances = useMemo(() => {
    const map = new Map<string, Grievance>();
    grievances.forEach((g) => {
      const ticketKey = g.ticketNo ? g.ticketNo.trim().toUpperCase() : g.id;
      if (!map.has(ticketKey)) {
        map.set(ticketKey, g);
      }
      if (!map.has(g.id)) {
        map.set(g.id, g);
      }
    });
    return Array.from(new Set(map.values()));
  }, [grievances]);

  const isDayScholar = (type?: string) =>
    type ? type.toLowerCase().replace(/[^a-z]/g, '').includes('dayscholar') : false;

  const isHosteller = (type?: string) =>
    type ? type.toLowerCase().replace(/[^a-z]/g, '').includes('hostel') : false;

  // Global counts for filter options
  const totalCount = uniqueGrievances.length;
  const activeCount = uniqueGrievances.filter((g) => !g.isSpam && g.status !== 'resolved').length;
  const resolvedCount = uniqueGrievances.filter((g) => g.status === 'resolved').length;
  const dayscholarCount = uniqueGrievances.filter((g) => !g.isSpam && isDayScholar(g.studentType)).length;
  const hostellerCount = uniqueGrievances.filter((g) => !g.isSpam && isHosteller(g.studentType)).length;
  const urgentCount = uniqueGrievances.filter((g) => !g.isSpam && g.priority === 'urgent' && g.status !== 'resolved').length;
  const spamCount = uniqueGrievances.filter((g) => g.isSpam).length;

  // Available categories
  const allCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    uniqueGrievances.forEach((g) => {
      if (!g.isSpam) {
        counts[g.category] = (counts[g.category] || 0) + 1;
      }
    });
    return counts;
  }, [uniqueGrievances]);

  const allCategoriesList = useMemo(() => {
    return Object.keys(allCategoryCounts).sort();
  }, [allCategoryCounts]);

  // ---------------------------------------------------------------------------
  // 3. Filter Execution (Single Comprehensive Filter)
  // ---------------------------------------------------------------------------
  const filteredComplaints = useMemo(() => {
    return uniqueGrievances.filter((g) => {
      // Residency filter
      if (studentTypeFilter === 'dayscholar' && !isDayScholar(g.studentType)) return false;
      if (studentTypeFilter === 'hosteller' && !isHosteller(g.studentType)) return false;

      // Status filter: only active, resolved, or spam
      if (statusFilter === 'spam') {
        if (!g.isSpam) return false;
      } else if (statusFilter === 'resolved') {
        if (g.isSpam || g.status !== 'resolved') return false;
      } else if (statusFilter === 'active') {
        if (g.isSpam || g.status === 'resolved') return false;
      }

      // Priority filter
      if (priorityFilter !== 'all') {
        if ((g.priority || 'medium') !== priorityFilter) return false;
      }

      // Category filter
      if (selectedCategory !== 'All' && g.category !== selectedCategory) {
        return false;
      }

      // Date range filter
      if (startDate) {
        const itemDate = new Date(g.createdAt).getTime();
        const start = new Date(startDate).getTime();
        if (itemDate < start) return false;
      }
      if (endDate) {
        const itemDate = new Date(g.createdAt).getTime();
        const end = new Date(endDate + 'T23:59:59').getTime();
        if (itemDate > end) return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          g.description.toLowerCase().includes(q) ||
          g.ticketNo.toLowerCase().includes(q) ||
          g.studentName.toLowerCase().includes(q) ||
          g.studentRegNo.toLowerCase().includes(q) ||
          (g.roomNo && g.roomNo.toLowerCase().includes(q)) ||
          g.category.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [
    uniqueGrievances,
    studentTypeFilter,
    statusFilter,
    priorityFilter,
    selectedCategory,
    startDate,
    endDate,
    searchQuery,
  ]);

  // Active filters count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'All') count++;
    if (studentTypeFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    if (priorityFilter !== 'all') count++;
    if (startDate) count++;
    if (endDate) count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedCategory, studentTypeFilter, statusFilter, priorityFilter, startDate, endDate, searchQuery]);

  const handleResetFilters = () => {
    setSelectedCategory('All');
    setStudentTypeFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
    setSortOption('date_desc');
    setCurrentPage(1);
  };

  // ---------------------------------------------------------------------------
  // 4. Dynamic Visual Analytics Data (Derived from Filtered Complaints + Sorted)
  // ---------------------------------------------------------------------------
  const rawVisualData = useMemo(() => {
    if (visualDimension === 'status') {
      const active = filteredComplaints.filter((g) => !g.isSpam && g.status !== 'resolved').length;
      const resolved = filteredComplaints.filter((g) => g.status === 'resolved').length;
      const spam = filteredComplaints.filter((g) => g.isSpam).length;
      return [
        { label: 'Active', value: active, color: '#3b82f6' },
        { label: 'Resolved', value: resolved, color: '#10b981' },
        { label: 'Spam', value: spam, color: '#f59e0b' },
      ].filter((d) => d.value > 0);
    }

    if (visualDimension === 'priority') {
      const urgent = filteredComplaints.filter((g) => !g.isSpam && g.priority === 'urgent').length;
      const medium = filteredComplaints.filter((g) => !g.isSpam && (g.priority === 'medium' || !g.priority)).length;
      const low = filteredComplaints.filter((g) => !g.isSpam && g.priority === 'less_important').length;
      return [
        { label: 'Urgent', value: urgent, color: '#ef4444' },
        { label: 'Medium', value: medium, color: '#f59e0b' },
        { label: 'Less Important', value: low, color: '#94a3b8' },
      ].filter((d) => d.value > 0);
    }

    if (visualDimension === 'residency') {
      const hostellers = filteredComplaints.filter((g) => !g.isSpam && isHosteller(g.studentType)).length;
      const dayscholars = filteredComplaints.filter((g) => !g.isSpam && isDayScholar(g.studentType)).length;
      return [
        { label: 'Hostellers', value: hostellers, color: '#3b82f6' },
        { label: 'Dayscholars', value: dayscholars, color: '#8b5cf6' },
      ].filter((d) => d.value > 0);
    }

    // Default: 'category'
    const counts: Record<string, number> = {};
    filteredComplaints.forEach((g) => {
      if (!g.isSpam) {
        counts[g.category] = (counts[g.category] || 0) + 1;
      }
    });

    return Object.entries(counts).map(([label, value], i) => ({
      label,
      value: Number(value),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [filteredComplaints, visualDimension]);

  // Sort the visual graph data dynamically according to active sort option
  const visualChartData: ChartDatum[] = useMemo(() => {
    const list = [...rawVisualData];

    switch (sortOption) {
      case 'volume_asc':
        return list.sort((a, b) => a.value - b.value);
      case 'volume_desc':
        return list.sort((a, b) => b.value - a.value);
      case 'category_asc':
      case 'name_asc':
      case 'ticket_asc':
        return list.sort((a, b) => a.label.localeCompare(b.label));
      case 'category_desc':
        return list.sort((a, b) => b.label.localeCompare(a.label));
      case 'priority_desc': {
        const priorityWeight: Record<string, number> = { Urgent: 3, Medium: 2, 'Less Important': 1 };
        return list.sort((a, b) => (priorityWeight[b.label] || 0) - (priorityWeight[a.label] || 0) || b.value - a.value);
      }
      case 'priority_asc': {
        const priorityWeight: Record<string, number> = { Urgent: 3, Medium: 2, 'Less Important': 1 };
        return list.sort((a, b) => (priorityWeight[a.label] || 0) - (priorityWeight[b.label] || 0) || a.value - b.value);
      }
      default:
        return list.sort((a, b) => b.value - a.value);
    }
  }, [rawVisualData, sortOption]);

  // ---------------------------------------------------------------------------
  // 5. Sort Execution for Complaints Queue
  // ---------------------------------------------------------------------------
  const displayedComplaints = useMemo(() => {
    const list = [...filteredComplaints];

    const categoryVolumeMap = new Map<string, number>();
    filteredComplaints.forEach((g) => {
      categoryVolumeMap.set(g.category, (categoryVolumeMap.get(g.category) || 0) + 1);
    });

    const getPriorityWeight = (p?: PriorityLevel) => {
      if (p === 'urgent') return 3;
      if (p === 'medium') return 2;
      return 1;
    };

    return list.sort((a, b) => {
      switch (sortOption) {
        case 'date_asc': {
          const timeA = new Date(a.resolvedAt || a.createdAt).getTime();
          const timeB = new Date(b.resolvedAt || b.createdAt).getTime();
          return timeA - timeB;
        }
        case 'priority_desc': {
          const diff = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
          if (diff !== 0) return diff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        case 'priority_asc': {
          const diff = getPriorityWeight(a.priority) - getPriorityWeight(b.priority);
          if (diff !== 0) return diff;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        case 'volume_desc': {
          const volA = categoryVolumeMap.get(a.category) || 0;
          const volB = categoryVolumeMap.get(b.category) || 0;
          if (volB !== volA) return volB - volA;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        case 'volume_asc': {
          const volA = categoryVolumeMap.get(a.category) || 0;
          const volB = categoryVolumeMap.get(b.category) || 0;
          if (volA !== volB) return volA - volB;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        case 'category_asc':
          return a.category.localeCompare(b.category);
        case 'category_desc':
          return b.category.localeCompare(a.category);
        case 'name_asc':
          return a.studentName.localeCompare(b.studentName);
        case 'ticket_asc':
          return a.ticketNo.localeCompare(b.ticketNo);
        case 'date_desc':
        default: {
          const timeA = new Date(a.resolvedAt || a.createdAt).getTime();
          const timeB = new Date(b.resolvedAt || b.createdAt).getTime();
          return timeB - timeA;
        }
      }
    });
  }, [filteredComplaints, sortOption]);

  // Reset pagination on filter or sort change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedCategory,
    studentTypeFilter,
    statusFilter,
    priorityFilter,
    startDate,
    endDate,
    searchQuery,
    sortOption,
  ]);

  const totalPages = Math.max(1, Math.ceil(displayedComplaints.length / ITEMS_PER_PAGE));
  const paginatedComplaints = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return displayedComplaints.slice(start, start + ITEMS_PER_PAGE);
  }, [displayedComplaints, currentPage]);

  const urgentComplaintsInQueue = useMemo(() => {
    return displayedComplaints.filter(
      (g) => !g.isSpam && g.priority === 'urgent' && g.status !== 'resolved'
    );
  }, [displayedComplaints]);

  const getSortLabel = (opt: string) => {
    switch (opt) {
      case 'date_asc': return 'Date (Oldest First)';
      case 'priority_desc': return 'Priority (Urgent First)';
      case 'priority_asc': return 'Priority (Low First)';
      case 'volume_desc': return 'Volume (High to Low)';
      case 'volume_asc': return 'Volume (Low to High)';
      case 'category_asc': return 'Category (A to Z)';
      case 'category_desc': return 'Category (Z to A)';
      case 'name_asc': return 'Student Name (A to Z)';
      case 'ticket_asc': return 'Ticket Number (A to Z)';
      case 'date_desc':
      default: return 'Date (Newest First)';
    }
  };

  // Actions
  const handlePriorityChange = (id: string, priority: PriorityLevel) => {
    onUpdatePriority(id, priority);
    if (selectedComplaint && selectedComplaint.id === id) {
      setSelectedComplaint((prev) => (prev ? { ...prev, priority } : null));
    }
  };

  const handleResolveClick = async (complaint: Grievance) => {
    setProcessingId(complaint.id);
    await onMarkDone(complaint.id, resolutionNote);
    setProcessingId(null);
    setResolutionNote('');
    setSelectedComplaint((prev) => (prev ? { ...prev, status: 'resolved' } : null));
  };

  const handleReopenClick = (complaint: Grievance) => {
    if (onReopen) {
      onReopen(complaint.id);
      setSelectedComplaint((prev) => (prev ? { ...prev, status: 'pending', resolvedAt: undefined } : null));
    }
  };

  // Keyboard shortcut: Escape dismisses open inspection modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedComplaint(null);
      }
    };
    if (selectedComplaint) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedComplaint]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER BANNER (Title & Download Report)                             */}
      {/* ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-3xl shadow-sm border border-slate-800">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-300 uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span>Administrative Redressal Console</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Grievance Management Dashboard
          </h1>
          <p className="text-xs text-slate-300 max-w-xl">
            Live complaint triage, dynamic visual analytics, and multi-dimensional filter & sorting controls.
          </p>
        </div>

        {/* Header Right Actions (Download Report Section) */}
        <div className="flex items-center">
          <ReportDownloader grievances={uniqueGrievances} />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. PERMANENT FILTER & SORT STATION (Positioned at top, below Download)   */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        {/* Row 1: Resized Search Bar + Visual Analytics Toggle (Right of Search) + Sort & Reset */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 justify-between">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
            {/* Resized Keyword Search */}
            <div className="relative w-full sm:w-64 md:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="admin-search-input"
                type="text"
                placeholder="Search ticket #, student, room..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Toggle for Visual Analytics placed directly to the right of the Search Bar */}
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shrink-0 self-start sm:self-auto">
              <button
                id="toggle-view-queue"
                type="button"
                onClick={() => setActiveViewSection('queue')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeViewSection === 'queue'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="View Grievance List"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Grievance List</span>
              </button>

              <button
                id="toggle-view-analytics"
                type="button"
                onClick={() => setActiveViewSection('analytics')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeViewSection === 'analytics'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="View Visual Analytics Overview"
              >
                <PieChartIcon className="w-3.5 h-3.5" />
                <span>Visual Analytics</span>
              </button>
            </div>
          </div>

          {/* Sort Selector & Active Filters Reset */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-600 dark:text-blue-400">
                <ArrowUpDown className="w-3.5 h-3.5" />
              </div>
              <select
                id="admin-sort-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="pl-8 pr-8 py-2 text-xs font-semibold rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                title="Select sort order"
              >
                <option value="date_desc">Sort: Date (Newest First)</option>
                <option value="date_asc">Sort: Date (Oldest First)</option>
                <option value="priority_desc">Sort: Priority (Urgent First)</option>
                <option value="priority_asc">Sort: Priority (Low First)</option>
                <option value="volume_desc">Sort: Volume (High to Low)</option>
                <option value="volume_asc">Sort: Volume (Low to High)</option>
                <option value="category_asc">Sort: Category (A to Z)</option>
                <option value="category_desc">Sort: Category (Z to A)</option>
                <option value="name_asc">Sort: Student Name (A to Z)</option>
                <option value="ticket_asc">Sort: Ticket Number (A to Z)</option>
              </select>
            </div>

            {/* Active Filter Badge & Reset All */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-2.5 py-1.5 rounded-xl font-semibold border border-blue-200 dark:border-blue-900">
                  {activeFilterCount} Filter{activeFilterCount > 1 ? 's' : ''}
                </span>
                <button
                  onClick={handleResetFilters}
                  className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/40 rounded-xl font-semibold cursor-pointer transition-colors flex items-center gap-1"
                  title="Reset all filters to default"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Deep Filter Customizations (Status: only Active, Resolved, Spam) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          {/* Status Filter: strictly active, resolved, spam */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium"
            >
              <option value="all">All Statuses ({totalCount})</option>
              <option value="active">Active ({activeCount})</option>
              <option value="resolved">Resolved ({resolvedCount})</option>
              <option value="spam">Spam ({spamCount})</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium truncate"
            >
              <option value="All">All Categories</option>
              {allCategoriesList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat} ({allCategoryCounts[cat] || 0})
                </option>
              ))}
            </select>
          </div>

          {/* Residency Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
              Residency
            </label>
            <select
              value={studentTypeFilter}
              onChange={(e) => setStudentTypeFilter(e.target.value as any)}
              className="w-full text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium"
            >
              <option value="all">All Residences</option>
              <option value="hosteller">Hostellers ({hostellerCount})</option>
              <option value="dayscholar">Dayscholars ({dayscholarCount})</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
              Priority
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="w-full text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-medium"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">🔴 Urgent ({urgentCount})</option>
              <option value="medium">🟡 Medium</option>
              <option value="less_important">⚪ Less Important</option>
            </select>
          </div>

          {/* Date Window: From & To */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
                Date Range
              </label>
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-semibold"
                >
                  Clear Dates
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-[11px] p-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                title="From Date"
              />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-[11px] p-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                title="To Date"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. VISUAL ANALYTICS OVERVIEW (Rendered when 'analytics' is active)        */}
      {/* ========================================================================= */}
      {activeViewSection === 'analytics' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs space-y-5 transition-colors">
          {/* Visual Header: Title, Metric, Dimension Selector & Visual Type Switcher */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                <TrendingUp className="w-4 h-4" />
                <span>
                  {visualDimension === 'category'
                    ? 'Category Distribution'
                    : visualDimension === 'status'
                    ? 'Resolution Status Distribution'
                    : visualDimension === 'priority'
                    ? 'Priority Breakdown'
                    : 'Student Residency Breakdown'}
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                Visual Analytics Overview
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Visualizing <strong className="text-slate-800 dark:text-slate-200">{filteredComplaints.length}</strong> matching complaint{filteredComplaints.length === 1 ? '' : 's'} &bull; Sorted by <strong className="text-blue-600 dark:text-blue-400">{getSortLabel(sortOption)}</strong>
              </p>
            </div>

            {/* Right Controls: Dimension Selector + Visual Type Selector */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Visual Dimension Selector */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
                <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 pl-2">Group By:</span>
                <select
                  id="visual-dimension-select"
                  value={visualDimension}
                  onChange={(e) => setVisualDimension(e.target.value as VisualDimension)}
                  className="bg-transparent font-semibold text-slate-800 dark:text-slate-200 text-xs pr-1 py-1 focus:outline-hidden cursor-pointer"
                >
                  <option value="category">Category</option>
                  <option value="status">Status</option>
                  <option value="priority">Priority</option>
                  <option value="residency">Residency</option>
                </select>
              </div>

              {/* Visual Type Selector (Segmented choices) */}
              <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
                <button
                  id="visual-type-bar"
                  onClick={() => setVisualType('bar')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    visualType === 'bar'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Vertical Bar Graph"
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Bar</span>
                </button>

                <button
                  id="visual-type-horizontal"
                  onClick={() => setVisualType('horizontal_bar')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    visualType === 'horizontal_bar'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Ranked Horizontal Bar Graph"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ranked</span>
                </button>

                <button
                  id="visual-type-pie"
                  onClick={() => setVisualType('pie')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    visualType === 'pie'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Pie Chart with Legend"
                >
                  <PieChartIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Pie</span>
                </button>

                <button
                  id="visual-type-donut"
                  onClick={() => setVisualType('donut')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    visualType === 'donut'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Donut Chart with Center Total"
                >
                  <CircleDot className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Donut</span>
                </button>

                <button
                  id="visual-type-ledger"
                  onClick={() => setVisualType('ledger')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    visualType === 'ledger'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Tabular Distribution Ledger"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ledger</span>
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Visual Content (Only One Visual Rendered) */}
          <div className="pt-2">
            {visualChartData.length === 0 ? (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 space-y-2">
                <PieChartIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  No complaint records match the current filter criteria
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Loosen your search query or reset your filters above to see live visual analytics.
                </p>
              </div>
            ) : (
              <>
                {/* Option 1: Vertical Bar Chart */}
                {visualType === 'bar' && (
                  <div className="max-w-4xl mx-auto py-2">
                    <BarChart data={visualChartData} noCard={true} />
                  </div>
                )}

                {/* Option 2: Ranked Horizontal Bar Graph */}
                {visualType === 'horizontal_bar' && (
                  <div className="max-w-2xl mx-auto py-2">
                    <HorizontalBarChart data={visualChartData} noCard={true} />
                  </div>
                )}

                {/* Option 3: Proportional Pie Chart */}
                {visualType === 'pie' && (
                  <div className="max-w-md mx-auto py-2">
                    <PieChart data={visualChartData} size={220} noCard={true} />
                  </div>
                )}

                {/* Option 4: Radial Donut Chart */}
                {visualType === 'donut' && (
                  <div className="max-w-md mx-auto py-2">
                    <DonutChart data={visualChartData} size={220} noCard={true} />
                  </div>
                )}

                {/* Option 5: Tabular Breakdown Ledger */}
                {visualType === 'ledger' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-400">
                          <th className="py-2.5 px-3">Segment Name</th>
                          <th className="py-2.5 px-3">Total Volume</th>
                          <th className="py-2.5 px-3">Volume Share</th>
                          <th className="py-2.5 px-3 text-right">Quick Filter</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                        {visualChartData.map((d, i) => {
                          const totalVol = visualChartData.reduce((acc, item) => acc + item.value, 0);
                          const pct = totalVol > 0 ? ((d.value / totalVol) * 100).toFixed(1) : '0';

                          return (
                            <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="py-3 px-3 flex items-center gap-2">
                                <span
                                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                                  style={{ backgroundColor: d.color }}
                                />
                                <span className="font-semibold text-slate-800 dark:text-slate-100">
                                  {d.label}
                                </span>
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                                {d.value}
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full"
                                      style={{ width: `${pct}%`, backgroundColor: d.color }}
                                    />
                                  </div>
                                  <span className="font-mono text-slate-500 text-[11px]">{pct}%</span>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right">
                                {visualDimension === 'category' && (
                                  <button
                                    onClick={() => setSelectedCategory(d.label)}
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] font-semibold cursor-pointer"
                                  >
                                    Filter by {d.label} &rarr;
                                  </button>
                                )}
                                {visualDimension === 'residency' && (
                                  <button
                                    onClick={() => setStudentTypeFilter(d.label.toLowerCase().includes('hostel') ? 'hosteller' : 'dayscholar')}
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] font-semibold cursor-pointer"
                                  >
                                    Filter by {d.label} &rarr;
                                  </button>
                                )}
                                {visualDimension === 'priority' && (
                                  <button
                                    onClick={() => setPriorityFilter(d.label.toLowerCase().includes('urgent') ? 'urgent' : d.label.toLowerCase().includes('medium') ? 'medium' : 'less_important')}
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] font-semibold cursor-pointer"
                                  >
                                    Filter by {d.label} &rarr;
                                  </button>
                                )}
                                {visualDimension === 'status' && (
                                  <button
                                    onClick={() => setStatusFilter(d.label.toLowerCase().includes('resolved') ? 'resolved' : d.label.toLowerCase().includes('spam') ? 'spam' : 'active')}
                                    className="text-blue-600 dark:text-blue-400 hover:underline text-[11px] font-semibold cursor-pointer"
                                  >
                                    Filter by {d.label} &rarr;
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. GRIEVANCE LIST (Rendered when 'queue' is active - Default View)         */}
      {/* ========================================================================= */}
      {activeViewSection === 'queue' && (
        <div className="space-y-4">
          {/* Emergency Urgent Banner (If any urgent tickets in filtered queue) */}
          {urgentComplaintsInQueue.length > 0 && statusFilter !== 'spam' && (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl flex items-center justify-between gap-3 text-xs text-red-900 dark:text-red-200 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-xl bg-red-600 text-white shrink-0">
                  <Star className="w-4 h-4 fill-white" />
                </span>
                <div>
                  <strong className="font-bold">Urgent Emergency Notice:</strong> {urgentComplaintsInQueue.length} high-priority complaint{urgentComplaintsInQueue.length > 1 ? 's require' : ' requires'} immediate campus triage.
                </div>
              </div>
              <button
                onClick={() => { setPriorityFilter('urgent'); }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[11px] transition-colors shrink-0 cursor-pointer shadow-xs"
              >
                Filter Urgent &rarr;
              </button>
            </div>
          )}

          {/* Queue Header Information */}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
            <span className="flex items-center gap-1.5 font-medium">
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Grievance List sorted by <strong>{getSortLabel(sortOption)}</strong></span>
            </span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {displayedComplaints.length} tickets matching filters
            </span>
          </div>

          {/* Complaints Table / List */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xs">
            {displayedComplaints.length === 0 ? (
              <div className="py-16 text-center text-slate-400 dark:text-slate-500 space-y-3">
                <CheckCircle2 className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700" />
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  No grievances match the current filter criteria.
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
                  Try clearing your search query or resetting your filter selections above to see more tickets.
                </p>
                <button
                  onClick={handleResetFilters}
                  className="mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All Filters</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedComplaints.map((item) => {
                  const isSelected = selectedComplaint?.id === item.id;
                  const isResolved = item.status === 'resolved';

                  return (
                    <div
                      key={item.id}
                      id={`complaint-row-${item.id}`}
                      className={`p-5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                        isSelected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                      }`}
                    >
                      {/* Left: Metadata, Category, Student Info */}
                      <div
                        className="space-y-2 flex-1 cursor-pointer"
                        onClick={() => setSelectedComplaint(item)}
                        title="Click to view details & triage actions"
                      >
                        <div className="flex items-center flex-wrap gap-2">
                          {/* Ticket Number */}
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                            {item.ticketNo}
                          </span>

                          {/* Category Badge */}
                          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/80 px-2.5 py-0.5 rounded-lg border border-blue-100 dark:border-blue-900">
                            {item.category}
                          </span>

                          {/* Interactive Priority Selector */}
                          <select
                            id={`priority-select-${item.id}`}
                            value={item.priority || 'medium'}
                            onChange={(e) => handlePriorityChange(item.id, e.target.value as PriorityLevel)}
                            onClick={(e) => e.stopPropagation()}
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg cursor-pointer border-0 ring-1 focus:ring-2 focus:outline-hidden transition-all ${
                              item.priority === 'urgent'
                                ? 'bg-red-100 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900'
                                : item.priority === 'medium'
                                ? 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900'
                                : 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
                            }`}
                          >
                            <option value="urgent">🔴 Urgent</option>
                            <option value="medium">🟡 Medium</option>
                            <option value="less_important">⚪ Less Important</option>
                          </select>

                          {/* Spam Tag (replaced long string with clean "Spam") */}
                          {item.isSpam && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 flex items-center gap-1 border border-amber-200 dark:border-amber-900">
                              <Sparkles className="w-3 h-3" /> Spam
                            </span>
                          )}

                          {/* Status Badge */}
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${
                              isResolved
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                            }`}
                          >
                            {isResolved ? 'Resolved' : 'Active'}
                          </span>
                        </div>

                        {/* Complaint Description Snippet */}
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans line-clamp-2">
                          {item.description}
                        </p>

                        {/* Student Info & Timestamps */}
                        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span>{item.studentName}</span>
                            <span className="text-slate-400 font-mono">({item.studentRegNo})</span>
                          </span>

                          {item.studentType === 'dayscholar' ? (
                            <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 font-bold rounded text-[10px]">
                              Dayscholar
                            </span>
                          ) : (
                            item.roomNo && (
                              <span className="flex items-center gap-1">
                                <Building className="w-3 h-3 text-slate-400" />
                                <span>{item.hostelBlock} - Room {item.roomNo}</span>
                              </span>
                            )
                          )}

                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{new Date(item.createdAt).toLocaleString()}</span>
                          </span>

                          {item.adminNotes && (
                            <span className="text-emerald-700 dark:text-emerald-400 text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                              Note: {item.adminNotes}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Primary Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        <button
                          id={`view-details-btn-${item.id}`}
                          onClick={() => setSelectedComplaint(item)}
                          className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-200 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                          <span>Manage</span>
                        </button>

                        {!isResolved ? (
                          <button
                            id={`quick-done-btn-${item.id}`}
                            onClick={() => handleResolveClick(item)}
                            disabled={processingId === item.id}
                            className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Done</span>
                          </button>
                        ) : (
                          onReopen && (
                            <button
                              id={`reopen-btn-${item.id}`}
                              onClick={() => handleReopenClick(item)}
                              className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                              title="Re-open this complaint if issue recurs"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Re-open</span>
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 bg-slate-50/60 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, displayedComplaints.length)} of {displayedComplaints.length} tickets
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer text-slate-700 dark:text-slate-200"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: totalPages }).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentPage(idx + 1)}
                      className={`w-7 h-7 rounded-lg font-bold text-xs cursor-pointer transition-colors ${
                        currentPage === idx + 1
                          ? 'bg-blue-600 text-white'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {idx + 1}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40 cursor-pointer text-slate-700 dark:text-slate-200"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DETAILED COMPLAINT MANAGEMENT & ACTION MODAL                           */}
      {/* ========================================================================= */}
      {selectedComplaint && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 cursor-pointer"
          onClick={() => setSelectedComplaint(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-lg">
                  {selectedComplaint.ticketNo}
                </span>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-100/70 dark:bg-blue-950 px-2.5 py-1 rounded-lg">
                  {selectedComplaint.category}
                </span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${
                  selectedComplaint.status === 'resolved'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                }`}>
                  {selectedComplaint.status === 'resolved' ? 'Resolved' : 'Active'}
                </span>
              </div>
              <button
                id="close-detail-modal-btn"
                onClick={() => setSelectedComplaint(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Student Details Info Box */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 grid grid-cols-2 sm:grid-cols-3 gap-3.5 text-xs">
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Student Name</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{selectedComplaint.studentName}</span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Register Number</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{selectedComplaint.studentRegNo}</span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Contact Phone</span>
                  <span className="text-slate-800 dark:text-slate-100">{selectedComplaint.studentPhone}</span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">College Email</span>
                  <span className="text-slate-800 dark:text-slate-100">{selectedComplaint.studentEmail}</span>
                </div>
                <div>
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Student Type</span>
                  <span className="text-slate-800 dark:text-slate-100 capitalize font-medium">{selectedComplaint.studentType}</span>
                </div>
                {selectedComplaint.hostelBlock && (
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Hostel Location</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {selectedComplaint.hostelBlock} - Rm {selectedComplaint.roomNo}
                    </span>
                  </div>
                )}
              </div>

              {/* Spam Assessment Banner */}
              {selectedComplaint.isSpam ? (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <AlertOctagon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">Flagged as Spam</div>
                    <div className="text-amber-800 dark:text-amber-300 mt-0.5">
                      {selectedComplaint.spamReason && !selectedComplaint.spamReason.includes('Gemini')
                        ? selectedComplaint.spamReason
                        : 'Spam'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-2xl flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Verified: Legitimate student complaint. High confidence score.</span>
                </div>
              )}

              {/* Full Complaint Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                  Student Grievance Description
                </label>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-800 dark:text-slate-100 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed font-sans">
                  {selectedComplaint.description}
                </div>
              </div>

              {/* Priority Triage Action */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                  Update Priority Level
                </label>
                <div className="flex gap-2">
                  <button
                    id="set-priority-urgent"
                    onClick={() => handlePriorityChange(selectedComplaint.id, 'urgent')}
                    className={`flex-1 py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      selectedComplaint.priority === 'urgent'
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                    }`}
                  >
                    <Star className="w-3.5 h-3.5 fill-current" /> Urgent
                  </button>
                  <button
                    id="set-priority-medium"
                    onClick={() => handlePriorityChange(selectedComplaint.id, 'medium')}
                    className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      selectedComplaint.priority === 'medium'
                        ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                    }`}
                  >
                    Medium
                  </button>
                  <button
                    id="set-priority-low"
                    onClick={() => handlePriorityChange(selectedComplaint.id, 'less_important')}
                    className={`flex-1 py-2 px-3 text-xs font-semibold rounded-xl border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      selectedComplaint.priority === 'less_important'
                        ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    Less Important
                  </button>
                </div>
              </div>

              {/* Resolution Note Textarea */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                  Resolution Note (Included in student resolution email)
                </label>
                <textarea
                  id="admin-resolution-note-textarea"
                  rows={2}
                  placeholder="e.g. 'Estate maintenance replaced the valve gasket at 11:30 AM. Water pressure verified.'"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-2xl focus:bg-white dark:focus:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className="truncate max-w-[260px] sm:max-w-none">
                  Notice to {selectedComplaint.studentEmail}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {selectedComplaint.status === 'resolved' ? (
                  <>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-3 py-2 rounded-xl">
                      <CheckCircle2 className="w-4 h-4" /> Work Marked Done
                    </div>
                    {onReopen && (
                      <button
                        onClick={() => handleReopenClick(selectedComplaint)}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-xl cursor-pointer transition-colors flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Re-open
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    id="admin-mark-done-submit-btn"
                    onClick={() => handleResolveClick(selectedComplaint)}
                    disabled={processingId === selectedComplaint.id}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{processingId === selectedComplaint.id ? 'Resolving & Notifying...' : 'Mark Done'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
