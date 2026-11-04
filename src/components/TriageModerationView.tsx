import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  GitMerge,
  Split,
  Eye,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  MessageSquare,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  User,
  Clock,
  MapPin,
  X,
  Send,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  fetchTriageQueueApi,
  mergeTicketsApi,
  detachTicketApi,
  updateMasterNotesApi,
} from '../api';
import { TriageGrievance } from '../types';

export interface TriageModerationViewProps {
  onTriageHandled?: () => void;
}

interface GroupedMasterCase {
  master: {
    id: string;
    ticketNo: string;
    description: string;
    studentName: string;
    status: string;
    createdAt: string;
    publicMasterNotes?: string;
  };
  duplicates: TriageGrievance[];
}

export const TriageModerationView: React.FC<TriageModerationViewProps> = ({
  onTriageHandled,
}) => {
  const [triageItems, setTriageItems] = useState<TriageGrievance[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Comparison Modal state
  const [inspectingItem, setInspectingItem] = useState<TriageGrievance | null>(null);

  // Action in-progress IDs
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Public Master Notes Editor state
  const [masterNotesMap, setMasterNotesMap] = useState<Record<string, string>>({});
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);

  // Collapsible Accordion State for Master Cases
  const [collapsedMasterIds, setCollapsedMasterIds] = useState<Set<string>>(new Set());

  const toggleMasterCollapse = (masterId: string) => {
    setCollapsedMasterIds((prev) => {
      const next = new Set(prev);
      if (next.has(masterId)) {
        next.delete(masterId);
      } else {
        next.add(masterId);
      }
      return next;
    });
  };

  const formatSimilarity = (score?: number | null): string => {
    if (typeof score !== 'number' || isNaN(score)) return '85.0%';
    return `${(score * 100).toFixed(1)}%`;
  };

  const loadTriageQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchTriageQueueApi();
      setTriageItems(res.suspectedDuplicates || []);
    } catch (err: any) {
      console.error('Failed to load triage queue:', err);
      setError(err.message || 'Failed to fetch triage queue');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTriageQueue();
  }, [loadTriageQueue]);

  // Modal Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInspectingItem(null);
    };
    if (inspectingItem) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectingItem]);

  // Pre-populate master notes map from candidateMaster.publicMasterNotes
  useEffect(() => {
    if (triageItems.length > 0) {
      setMasterNotesMap((prev) => {
        const updated = { ...prev };
        triageItems.forEach((item) => {
          if (
            item.candidateMaster?.id &&
            item.candidateMaster.publicMasterNotes &&
            !updated[item.candidateMaster.id]
          ) {
            updated[item.candidateMaster.id] = item.candidateMaster.publicMasterNotes;
          }
        });
        return updated;
      });
    }
  }, [triageItems]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Group suspected duplicates by Candidate Master ID
  const groupedCases = useMemo<GroupedMasterCase[]>(() => {
    const map = new Map<string, GroupedMasterCase>();

    triageItems.forEach((item) => {
      if (!item.candidateMaster) return;
      const mId = item.candidateMaster.id;
      if (!map.has(mId)) {
        map.set(mId, {
          master: item.candidateMaster,
          duplicates: [],
        });
      }
      map.get(mId)!.duplicates.push(item);
    });

    let list = Array.from(map.values());

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list
        .map((group) => {
          const matchMaster =
            group.master.ticketNo.toLowerCase().includes(q) ||
            group.master.description.toLowerCase().includes(q) ||
            group.master.studentName.toLowerCase().includes(q);

          const matchingDups = group.duplicates.filter(
            (d) =>
              d.ticketNo.toLowerCase().includes(q) ||
              d.description.toLowerCase().includes(q) ||
              d.studentName.toLowerCase().includes(q) ||
              d.category.toLowerCase().includes(q)
          );

          if (matchMaster) return group;
          if (matchingDups.length > 0) {
            return { ...group, duplicates: matchingDups };
          }
          return null;
        })
        .filter(Boolean) as GroupedMasterCase[];
    }

    return list;
  }, [triageItems, searchFilter]);

  // Handle Manual Merge
  const handleMerge = async (masterId: string, childId: string, childTicketNo: string) => {
    setProcessingId(childId);
    try {
      await mergeTicketsApi(masterId, childId);
      // Remove from local triage state
      setTriageItems((prev) => prev.filter((item) => item.id !== childId));
      if (inspectingItem?.id === childId) {
        setInspectingItem(null);
      }
      showToast(`Successfully merged ticket #${childTicketNo} under Master Case.`);
      if (onTriageHandled) onTriageHandled();
    } catch (err: any) {
      console.error('Merge action failed:', err);
      showToast(`Merge failed: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Manual Detach / Promote to Primary
  const handleDetach = async (childId: string, childTicketNo: string) => {
    setProcessingId(childId);
    try {
      await detachTicketApi(childId);
      // Remove from local triage state
      setTriageItems((prev) => prev.filter((item) => item.id !== childId));
      if (inspectingItem?.id === childId) {
        setInspectingItem(null);
      }
      showToast(`Promoted ticket #${childTicketNo} to standalone PRIMARY grievance.`);
      if (onTriageHandled) onTriageHandled();
    } catch (err: any) {
      console.error('Detach action failed:', err);
      showToast(`Promotion failed: ${err.message || 'Unknown error'}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Saving Public Master Notes
  const handleSaveMasterNotes = async (masterId: string, ticketNo: string) => {
    const notes = masterNotesMap[masterId] || '';
    if (!notes.trim()) {
      showToast('Please enter a public status note first.');
      return;
    }

    setSavingNotesId(masterId);
    try {
      await updateMasterNotesApi(masterId, notes.trim());
      showToast(`Public master update saved for #${ticketNo}. Broadcast to all merged child reporters.`);
    } catch (err: any) {
      console.error('Save master notes failed:', err);
      showToast(`Failed to update master notes: ${err.message || 'Unknown error'}`);
    } finally {
      setSavingNotesId(null);
    }
  };

  // Semantic keyword highlighter for side-by-side comparison
  const highlightOverlap = (textA: string, textB: string) => {
    const getTokens = (str: string) =>
      new Set(
        str
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );

    const tokensB = getTokens(textB);
    const words = textA.split(/(\s+)/);

    return words.map((w, idx) => {
      const clean = w.toLowerCase().replace(/[^\w]/g, '');
      const isMatch = clean.length > 3 && tokensB.has(clean);

      if (isMatch) {
        return (
          <mark
            key={idx}
            className="bg-amber-200/90 dark:bg-amber-900/60 text-amber-950 dark:text-amber-100 px-1 py-0.5 rounded font-semibold"
          >
            {w}
          </mark>
        );
      }
      return <span key={idx}>{w}</span>;
    });
  };

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
            <Layers className="w-4 h-4" />
            <span>Intelligent Deduplication Pipeline</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5">
            Admin Merge & Triage Moderation Interface
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Review suspected duplicate grievances (0.80 – 0.91 similarity score), compare semantic features side-by-side, merge into master cases, or promote to standalone primaries.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            id="triage-refresh-btn"
            onClick={loadTriageQueue}
            disabled={isLoading}
            className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-60"
            title="Refresh triage queue"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            <span>{isLoading ? 'Loading...' : 'Refresh Queue'}</span>
          </button>
        </div>
      </div>

      {/* Search and Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ticket #, description, or student..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 font-semibold text-amber-800 dark:text-amber-300">
            {triageItems.length} Suspected Duplicate{triageItems.length === 1 ? '' : 's'} Pending
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 font-semibold text-blue-800 dark:text-blue-300">
            {groupedCases.length} Master Case Group{groupedCases.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-center justify-between text-xs text-rose-800 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={loadTriageQueue}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && groupedCases.length === 0 && (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
            Triage Moderation Queue Clear
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            There are currently no suspected duplicate grievances scoring between 0.80 and 0.91 similarity requiring manual review. All submissions are cleanly resolved or auto-merged.
          </p>
        </div>
      )}

      {/* Grouped Master Cases & Nested Suspected Duplicate Cards */}
      <div className="space-y-6">
        {groupedCases.map(({ master, duplicates }) => {
          const notesValue = masterNotesMap[master.id] || '';
          const isCollapsed = collapsedMasterIds.has(master.id);

          return (
            <div
              key={master.id}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-4 p-5"
            >
              {/* Master Case Header Banner */}
              <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/60 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMasterCollapse(master.id)}
                      className="p-1 rounded-lg hover:bg-blue-150 dark:hover:bg-blue-900/80 text-blue-700 dark:text-blue-300 transition-colors cursor-pointer flex items-center gap-1 font-mono text-xs font-bold"
                      title={isCollapsed ? 'Expand Candidate Master Group' : 'Collapse Candidate Master Group'}
                    >
                      {isCollapsed ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronUp className="w-4 h-4" />
                      )}
                    </button>
                    <span className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-mono text-xs font-bold shadow-xs">
                      Candidate Master #{master.ticketNo}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                      Status: {master.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> {master.studentName}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />{' '}
                      {new Date(master.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                  {master.description}
                </p>

                {/* Public Master Notes Editor */}
                <div className="pt-2 border-t border-blue-200/60 dark:border-blue-900/60 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-blue-900 dark:text-blue-300">
                    <span className="flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Public Master Resolution Update (Visible to all child reporters):</span>
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <textarea
                      rows={2}
                      placeholder="e.g. Maintenance team dispatched to inspect line; replacement parts arriving tomorrow."
                      value={notesValue}
                      onChange={(e) =>
                        setMasterNotesMap((prev) => ({
                          ...prev,
                          [master.id]: e.target.value,
                        }))
                      }
                      className="flex-1 p-2 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveMasterNotes(master.id, master.ticketNo)}
                      disabled={savingNotesId === master.id || !notesValue.trim() || !master.id}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs self-end"
                      title="Update notes visible to merged child ticket owners"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{savingNotesId === master.id ? 'Saving...' : 'Broadcast Note'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Nested Suspected Duplicates List (Collapsible Accordion Body) */}
              {!isCollapsed && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Suspected Duplicate Candidates ({duplicates.length})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Calculated via 2-stage embedding similarity
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {duplicates.map((child) => {
                      const matchPercent = formatSimilarity(child.similarityScore);
                      const isProcessing = processingId === child.id;

                      return (
                        <div
                          key={child.id}
                          className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700 transition-all space-y-3 shadow-2xs"
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                #{child.ticketNo}
                              </span>
                              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                                {child.category}
                              </span>
                            </div>

                            {/* Similarity Badge Pill */}
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shadow-2xs">
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                <span>{matchPercent} Match</span>
                              </span>
                            </div>
                          </div>

                          {/* Description Preview */}
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                            {child.description}
                          </p>

                          {/* Reporter details & action buttons */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                            <div className="flex items-center gap-3 text-slate-400 font-mono text-[11px]">
                              <span>{child.studentName} ({child.studentRegNo})</span>
                              <span>&bull;</span>
                              <span>{new Date(child.createdAt).toLocaleDateString()}</span>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Inspect Modal Trigger */}
                              <button
                                type="button"
                                onClick={() => setInspectingItem(child)}
                                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-600" />
                                <span>Compare</span>
                              </button>

                              {/* Detach / Promote Button */}
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => handleDetach(child.id, child.ticketNo)}
                                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                                title="Promote to standalone PRIMARY grievance"
                              >
                                {isProcessing ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Split className="w-3.5 h-3.5 text-slate-500" />
                                )}
                                <span>Detach (Primary)</span>
                              </button>

                              {/* Merge Button */}
                              <button
                                type="button"
                                disabled={isProcessing || !master.id}
                                onClick={() => handleMerge(master.id, child.id, child.ticketNo)}
                                className="flex-wrap items-stretch px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                                title={master.id ? "Merge into Master Case" : "Cannot merge: no candidate master identified"}
                              >
                                {isProcessing ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <GitMerge className="w-3.5 h-3.5" />
                                )}
                                <span>Merge into Master</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* SIDE-BY-SIDE COMPARISON MODAL                                         */}
      {/* ===================================================================== */}
      {inspectingItem && inspectingItem.candidateMaster && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectingItem(null);
          }}
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">
                    Side-by-Side Duplicate Semantic Inspection
                  </h3>
                  <p className="text-xs text-slate-500">
                    Overlapping keyword tokens highlighted in yellow
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  {formatSimilarity(inspectingItem.similarityScore)} Match
                </span>
                <button
                  type="button"
                  onClick={() => setInspectingItem(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Comparison Split Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Candidate Master Ticket */}
              <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-mono text-xs font-bold">
                      Master Case #{inspectingItem.candidateMaster.ticketNo}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {new Date(inspectingItem.candidateMaster.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 font-medium">
                    Reporter: <strong className="text-slate-800 dark:text-slate-200">{inspectingItem.candidateMaster.studentName}</strong>
                  </div>

                  <div className="pt-2 border-t border-blue-100 dark:border-blue-900">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Full Description:
                    </span>
                    <div className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-normal bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-blue-100 dark:border-blue-900 min-h-[100px]">
                      {highlightOverlap(
                        inspectingItem.candidateMaster.description,
                        inspectingItem.description
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 pt-2 border-t border-blue-100 dark:border-blue-900">
                  Status: <strong className="text-blue-600 uppercase">{inspectingItem.candidateMaster.status}</strong>
                </div>
              </div>

              {/* Right Column: Suspected Duplicate Ticket */}
              <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-amber-500 text-white font-mono text-xs font-bold">
                      Suspected Child #{inspectingItem.ticketNo}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {new Date(inspectingItem.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="text-xs text-slate-500 font-medium">
                    Reporter: <strong className="text-slate-800 dark:text-slate-200">{inspectingItem.studentName} ({inspectingItem.studentRegNo})</strong>
                  </div>

                  <div className="pt-2 border-t border-amber-100 dark:border-amber-900">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Full Description:
                    </span>
                    <div className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-normal bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-amber-100 dark:border-amber-900 min-h-[100px]">
                      {highlightOverlap(
                        inspectingItem.description,
                        inspectingItem.candidateMaster.description
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 pt-2 border-t border-amber-100 dark:border-amber-900">
                  Category: <strong className="text-amber-600">{inspectingItem.category}</strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel & Close
              </button>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={processingId === inspectingItem.id}
                  onClick={() =>
                    handleDetach(inspectingItem.id, inspectingItem.ticketNo)
                  }
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {processingId === inspectingItem.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Split className="w-3.5 h-3.5" />
                  )}
                  <span>Promote to Standalone PRIMARY</span>
                </button>

                <button
                  type="button"
                  disabled={processingId === inspectingItem.id || !inspectingItem.candidateMaster.id}
                  onClick={() =>
                    handleMerge(
                      inspectingItem.candidateMaster.id,
                      inspectingItem.id,
                      inspectingItem.ticketNo
                    )
                  }
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title={inspectingItem.candidateMaster.id ? "Merge into Master Case" : "Cannot merge: no candidate master identified"}
                >
                  {processingId === inspectingItem.id ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <GitMerge className="w-3.5 h-3.5" />
                  )}
                  <span>Merge into Master #{inspectingItem.candidateMaster.ticketNo}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default TriageModerationView;
