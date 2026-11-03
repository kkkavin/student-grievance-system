import React, { useState, useMemo, useEffect } from 'react';
import {
  Building,
  CheckCircle2,
  AlertCircle,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  User,
  Mail,
  Phone,
  Calendar,
  AlertOctagon,
  ArrowRight,
  Send,
  Eye,
  RefreshCw,
  GitPullRequest,
  Check,
  Shield,
  FileText,
  MessageSquare,
  X,
  ChevronDown,
} from 'lucide-react';
import { Grievance, UserProfile, PriorityLevel, GrievanceStatus, Department } from '../types';
import {
  updateGrievanceApi,
  requestReassignGrievanceApi,
  escalateGrievanceApi,
  fetchDepartmentsApi,
  fetchGrievances,
} from '../api';

interface DepartmentDashboardProps {
  currentUser: UserProfile;
  initialGrievances?: Grievance[];
  onLogout?: () => void;
}

export const DepartmentDashboard: React.FC<DepartmentDashboardProps> = ({
  currentUser,
  initialGrievances = [],
  onLogout,
}) => {
  const [grievances, setGrievances] = useState<Grievance[]>(initialGrievances);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'resolved'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');

  // Inspection & Action States
  const [selectedTicket, setSelectedTicket] = useState<Grievance | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [adminNoteDraft, setAdminNoteDraft] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Reassignment Request Modal
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [suggestedDeptId, setSuggestedDeptId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  // Notification Banner
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showBanner = (type: 'success' | 'error', message: string) => {
    setBanner({ type, message });
    setTimeout(() => setBanner(null), 5000);
  };

  const userDeptId = currentUser.departmentId || currentUser.department_id || null;

  // Refresh department queue
  const refreshQueue = async () => {
    try {
      setLoading(true);
      const list = await fetchGrievances();
      if (Array.isArray(list)) {
        // Enforce department scoping client-side as well
        const scoped = userDeptId
          ? list.filter((g) => (g.assignedDepartmentId || (g as any).assigned_department_id) === userDeptId)
          : list;
        setGrievances(scoped);
      }
    } catch (err: any) {
      showBanner('error', err.message || 'Failed to refresh department queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshQueue();
    fetchDepartmentsApi()
      .then(setDepartments)
      .catch(() => {});
  }, [userDeptId]);

  // Department metadata
  const currentDepartment = useMemo(() => {
    return departments.find((d) => d.id === userDeptId);
  }, [departments, userDeptId]);

  // Department Metrics
  const metrics = useMemo(() => {
    const total = grievances.length;
    const inProgress = grievances.filter((g) => g.status === 'in_progress' || g.status === 'pending').length;
    const resolved = grievances.filter((g) => g.status === 'resolved').length;
    const urgent = grievances.filter((g) => g.priority === 'urgent' && g.status !== 'resolved').length;
    return { total, inProgress, resolved, urgent };
  }, [grievances]);

  // Filtered complaints list
  const filteredGrievances = useMemo(() => {
    return grievances.filter((g) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending' && g.status !== 'pending') return false;
        if (statusFilter === 'in_progress' && g.status !== 'in_progress') return false;
        if (statusFilter === 'resolved' && g.status !== 'resolved') return false;
      }

      // Priority filter
      if (priorityFilter !== 'all' && (g.priority || 'medium') !== priorityFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          (g.ticketNo && g.ticketNo.toLowerCase().includes(q)) ||
          g.studentName.toLowerCase().includes(q) ||
          g.studentRegNo.toLowerCase().includes(q) ||
          g.category.toLowerCase().includes(q) ||
          g.description.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [grievances, statusFilter, priorityFilter, searchQuery]);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------
  const handleUpdateStatus = async (id: string, newStatus: GrievanceStatus, customNote?: string) => {
    try {
      setActionLoading(true);
      const updates: Partial<Grievance> = {
        status: newStatus,
        resolvedAt: newStatus === 'resolved' ? new Date().toISOString() : undefined,
      };
      if (customNote) {
        updates.adminNotes = customNote;
      }
      const updated = await updateGrievanceApi(id, updates);
      setGrievances((prev) => prev.map((g) => (g.id === id ? { ...g, ...updated } : g)));
      if (selectedTicket?.id === id) {
        setSelectedTicket((prev) => (prev ? { ...prev, ...updated } : null));
      }
      showBanner('success', `Ticket status updated to ${newStatus}.`);
    } catch (err: any) {
      showBanner('error', err.message || 'Status update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveInternalNotes = async (id: string) => {
    if (!adminNoteDraft.trim()) return;
    try {
      setActionLoading(true);
      const existing = selectedTicket?.adminNotes || '';
      const timestamp = new Date().toLocaleString();
      const newNote = `[${timestamp} - ${currentUser.name} (${currentUser.role})]: ${adminNoteDraft.trim()}`;
      const combined = existing ? `${existing}\n\n${newNote}` : newNote;

      const updated = await updateGrievanceApi(id, { adminNotes: combined });
      setGrievances((prev) => prev.map((g) => (g.id === id ? { ...g, ...updated } : g)));
      if (selectedTicket) {
        setSelectedTicket({ ...selectedTicket, adminNotes: combined });
      }
      setAdminNoteDraft('');
      showBanner('success', 'Internal note recorded.');
    } catch (err: any) {
      showBanner('error', err.message || 'Failed to save note');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalate = async (id: string) => {
    if (!confirm('Escalate this grievance to Urgent priority and notify coordinators?')) return;
    try {
      setActionLoading(true);
      const res = await escalateGrievanceApi(id, 'Department coordinator escalated to urgent triage');
      setGrievances((prev) => prev.map((g) => (g.id === id ? { ...g, ...res.grievance } : g)));
      if (selectedTicket?.id === id) {
        setSelectedTicket((prev) => (prev ? { ...prev, ...res.grievance } : null));
      }
      showBanner('success', 'Grievance escalated to Urgent priority.');
    } catch (err: any) {
      showBanner('error', err.message || 'Failed to escalate ticket');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestReassignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !suggestedDeptId || !reassignReason.trim()) {
      showBanner('error', 'Target department and justification are required.');
      return;
    }
    try {
      setActionLoading(true);
      await requestReassignGrievanceApi(selectedTicket.id, suggestedDeptId, reassignReason.trim());
      showBanner('success', 'Reassignment request submitted to Super Admin.');
      setIsReassignModalOpen(false);
      setSuggestedDeptId('');
      setReassignReason('');
      refreshQueue();
    } catch (err: any) {
      showBanner('error', err.message || 'Failed to request reassignment');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 font-sans">
      {/* Banner */}
      {banner && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-semibold shadow-xs transition-all ${
            banner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
          }`}
        >
          {banner.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{banner.message}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. DEPARTMENT CONSOLE HEADER BANNER                                   */}
      {/* ===================================================================== */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-900/40">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-semibold text-blue-200 border border-white/10">
              <Building className="w-3.5 h-3.5 text-blue-300" />
              <span>{currentDepartment?.code || 'DEPT'} CONSOLE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="capitalize">{currentUser.role.replace(/_/g, ' ').toLowerCase()}</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {currentDepartment?.name || 'Department Triage Portal'}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Scoped grievance resolution queue. You have authorized access exclusively to issues assigned to this administrative department.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl px-4 py-3 border border-white/10 text-right">
              <div className="text-[11px] text-blue-200 font-mono">Assigned Inbox</div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5 justify-end">
                <Mail className="w-3.5 h-3.5 text-blue-300" />
                <span>{currentDepartment?.contactEmail || currentUser.email}</span>
              </div>
            </div>

            <button
              onClick={refreshQueue}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl backdrop-blur-md border border-white/10 text-white transition-colors cursor-pointer"
              title="Refresh queue"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. DEPARTMENT METRICS CARDS                                           */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Assigned</span>
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {metrics.total}
          </div>
          <span className="text-[11px] text-slate-400">Department tickets</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">In Progress</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {metrics.inProgress}
          </div>
          <span className="text-[11px] text-slate-400">Active triage queue</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-2">
            {metrics.resolved}
          </div>
          <span className="text-[11px] text-slate-400">Closed with resolution note</span>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-500 uppercase tracking-wider">Urgent Escalated</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
            {metrics.urgent}
          </div>
          <span className="text-[11px] text-slate-400">Requires priority action</span>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. SEARCH & FILTERS BAR                                               */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets by ticket #, student name, description..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 4. DEPARTMENT SCOPED GRIEVANCE TABLE                                  */}
      {/* ===================================================================== */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Ticket #</th>
                <th className="px-5 py-3.5">Student</th>
                <th className="px-5 py-3.5">Category & Summary</th>
                <th className="px-5 py-3.5">Priority</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {filteredGrievances.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-5 py-4 font-mono font-bold text-slate-900 dark:text-white">
                    {item.ticketNo || item.id}
                  </td>
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-900 dark:text-white">{item.studentName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{item.studentRegNo}</div>
                  </td>
                  <td className="px-5 py-4 max-w-md">
                    <div className="font-bold text-blue-700 dark:text-blue-400 mb-0.5">
                      {item.category}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                        item.priority === 'urgent'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                          : item.priority === 'high'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {item.priority || 'medium'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        item.status === 'resolved'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40'
                          : item.status === 'in_progress'
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/40'
                          : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          item.status === 'resolved'
                            ? 'bg-emerald-500'
                            : item.status === 'in_progress'
                            ? 'bg-blue-500'
                            : 'bg-amber-500'
                        }`}
                      />
                      {item.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => {
                        setSelectedTicket(item);
                        setResolutionNote(item.adminNotes || '');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Review</span>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredGrievances.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    No grievances in this department queue matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 5. TICKET INSPECTION & RESPONSE DRAWER MODAL                          */}
      {/* ===================================================================== */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                  Ticket #{selectedTicket.ticketNo || selectedTicket.id}
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {selectedTicket.category}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Student & Ticket Meta */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl text-xs">
              <div>
                <span className="text-slate-400 font-medium">Student</span>
                <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                  {selectedTicket.studentName}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">{selectedTicket.studentRegNo}</div>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Priority</span>
                <div className="mt-0.5">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                      selectedTicket.priority === 'urgent'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60'
                    }`}
                  >
                    {selectedTicket.priority || 'medium'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-medium">Status</span>
                <div className="mt-0.5 font-bold capitalize text-slate-800 dark:text-slate-200">
                  {selectedTicket.status.replace(/_/g, ' ')}
                </div>
              </div>
            </div>

            {/* Complaint Description */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Student Complaint Description
              </span>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 leading-relaxed border border-slate-200/60 dark:border-slate-700">
                {selectedTicket.description}
              </div>
            </div>

            {/* Existing Internal Notes */}
            {selectedTicket.adminNotes && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Internal Triage Notes & Audit History
                </span>
                <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {selectedTicket.adminNotes}
                </div>
              </div>
            )}

            {/* Draft Internal Note */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                <span>Append Internal Update / Response Note</span>
              </label>
              <textarea
                value={adminNoteDraft}
                onChange={(e) => setAdminNoteDraft(e.target.value)}
                placeholder="Write resolution notes, inspection observations, or triage updates..."
                rows={3}
                className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={() => handleSaveInternalNotes(selectedTicket.id)}
                disabled={actionLoading || !adminNoteDraft.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Save Internal Note
              </button>
            </div>

            {/* Department Actions Toolbar */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {/* Request Re-assignment from Super Admin */}
                <button
                  onClick={() => setIsReassignModalOpen(true)}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <GitPullRequest className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Request Re-Assignment</span>
                </button>

                {/* Escalate Priority */}
                {selectedTicket.priority !== 'urgent' && (
                  <button
                    onClick={() => handleEscalate(selectedTicket.id)}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Escalate Urgent</span>
                  </button>
                )}
              </div>

              {/* Status Transitions */}
              <div className="flex items-center gap-2">
                {selectedTicket.status !== 'in_progress' && selectedTicket.status !== 'resolved' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedTicket.id, 'in_progress')}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Mark In Progress
                  </button>
                )}

                {selectedTicket.status !== 'resolved' ? (
                  <button
                    onClick={() => handleUpdateStatus(selectedTicket.id, 'resolved')}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Resolve Grievance</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpdateStatus(selectedTicket.id, 'in_progress')}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Reopen Ticket
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 6. MODAL: REQUEST REASSIGNMENT TO SUPER ADMIN                         */}
      {/* ===================================================================== */}
      {isReassignModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GitPullRequest className="w-5 h-5 text-indigo-600" />
              <span>Request Ticket Re-assignment</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              If this issue was incorrectly routed to your department, submit a reassignment request with the proposed target department. The Super Admin will review and execute the transfer.
            </p>

            <form onSubmit={handleRequestReassignment} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Suggested Target Department
                </label>
                <select
                  value={suggestedDeptId}
                  onChange={(e) => setSuggestedDeptId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Select Destination Department --</option>
                  {departments
                    .filter((d) => d.id !== userDeptId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Justification / Transfer Reason
                </label>
                <textarea
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Explain why this ticket falls outside your department scope..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReassignModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
