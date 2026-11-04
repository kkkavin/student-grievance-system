import React, { useState, useEffect, useMemo } from 'react';
import {
  Building,
  Plus,
  GitBranch,
  Users,
  Shield,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Trash2,
  Search,
  Filter,
  RefreshCw,
  Mail,
  Tag,
  Key,
  Layers,
  FileText,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Department, CategoryRoutingRule, AuditLogEntry, UserRole, PriorityLevel } from '../types';
import {
  fetchAdminDepartmentsApi,
  createDepartmentApi,
  updateDepartmentApi,
  fetchRoutingRulesApi,
  createRoutingRuleApi,
  updateRoutingRuleApi,
  deleteRoutingRuleApi,
  assignUserDepartmentApi,
  fetchAuditLogsApi,
} from '../api';

export const DepartmentManagement: React.FC = () => {
  const [subTab, setSubTab] = useState<'departments' | 'routing' | 'staff' | 'audit'>('departments');

  // State: Departments
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [deptSearch, setDeptSearch] = useState('');
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptEmail, setDeptEmail] = useState('');
  const [deptActive, setDeptActive] = useState(true);

  // State: Routing Rules
  const [rules, setRules] = useState<CategoryRoutingRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [ruleSearch, setRuleSearch] = useState('');
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CategoryRoutingRule | null>(null);
  const [ruleCategory, setRuleCategory] = useState('');
  const [ruleDeptId, setRuleDeptId] = useState('');
  const [ruleLocationPattern, setRuleLocationPattern] = useState('');
  const [rulePriorityOrder, setRulePriorityOrder] = useState<number>(0);
  const [rulePriorityOverride, setRulePriorityOverride] = useState<PriorityLevel | ''>('');
  const [ruleActive, setRuleActive] = useState(true);

  // State: Staff & Head Assignment
  const [assignIdentifier, setAssignIdentifier] = useState('');
  const [assignDeptId, setAssignDeptId] = useState('');
  const [assignRole, setAssignRole] = useState<UserRole>('DEPARTMENT_STAFF');
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignFeedback, setAssignFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // State: Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [auditFilterType, setAuditFilterType] = useState<string>('all');

  // Global Notification Banner
  const [actionBanner, setActionBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showBanner = (type: 'success' | 'error', message: string) => {
    setActionBanner({ type, message });
    setTimeout(() => setActionBanner(null), 5000);
  };

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------
  const loadDepartments = async () => {
    try {
      setLoadingDepts(true);
      const data = await fetchAdminDepartmentsApi(false);
      setDepartments(data);
    } catch (err: any) {
      showBanner('error', err.message || 'Failed to load departments');
    } finally {
      setLoadingDepts(false);
    }
  };

  const loadRules = async () => {
    try {
      setLoadingRules(true);
      const data = await fetchRoutingRulesApi();
      setRules(data);
    } catch (err: any) {
      showBanner('error', err.message || 'Failed to load routing rules');
    } finally {
      setLoadingRules(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      setLoadingAudit(true);
      const data = await fetchAuditLogsApi(
        auditFilterType !== 'all' ? { entityType: auditFilterType } : undefined
      );
      setAuditLogs(data);
    } catch (err: any) {
      showBanner('error', err.message || 'Failed to load audit logs');
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadDepartments();
    loadRules();
  }, []);

  useEffect(() => {
    if (subTab === 'audit') {
      loadAuditLogs();
    }
  }, [subTab, auditFilterType]);

  // ---------------------------------------------------------------------------
  // Department Handlers
  // ---------------------------------------------------------------------------
  const openDeptModal = (dept?: Department) => {
    if (dept) {
      setEditingDept(dept);
      setDeptName(dept.name);
      setDeptCode(dept.code);
      setDeptEmail(dept.contactEmail);
      setDeptActive(dept.isActive);
    } else {
      setEditingDept(null);
      setDeptName('');
      setDeptCode('');
      setDeptEmail('');
      setDeptActive(true);
    }
    setIsDeptModalOpen(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim() || !deptCode.trim() || !deptEmail.trim()) {
      showBanner('error', 'Name, Code, and Contact Email are required.');
      return;
    }
    try {
      if (editingDept) {
        await updateDepartmentApi(editingDept.id, {
          name: deptName.trim(),
          code: deptCode.trim().toUpperCase(),
          contactEmail: deptEmail.trim(),
          isActive: deptActive,
        });
        showBanner('success', `Department "${deptName}" updated successfully.`);
      } else {
        await createDepartmentApi({
          name: deptName.trim(),
          code: deptCode.trim().toUpperCase(),
          contactEmail: deptEmail.trim(),
          isActive: deptActive,
        });
        showBanner('success', `Department "${deptName}" created successfully.`);
      }
      setIsDeptModalOpen(false);
      loadDepartments();
    } catch (err: any) {
      showBanner('error', err.message || 'Operation failed');
    }
  };

  // ---------------------------------------------------------------------------
  // Routing Rule Handlers
  // ---------------------------------------------------------------------------
  const openRuleModal = (rule?: CategoryRoutingRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleCategory(rule.category);
      setRuleDeptId(rule.departmentId);
      setRuleLocationPattern(rule.locationTagPattern || '');
      setRulePriorityOrder(rule.priorityOrder || 0);
      setRulePriorityOverride(rule.priorityOverride || '');
      setRuleActive(rule.isActive);
    } else {
      setEditingRule(null);
      setRuleCategory('');
      setRuleDeptId(departments[0]?.id || '');
      setRuleLocationPattern('');
      setRulePriorityOrder(0);
      setRulePriorityOverride('');
      setRuleActive(true);
    }
    setIsRuleModalOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleCategory.trim() || !ruleDeptId) {
      showBanner('error', 'Category and Department are required.');
      return;
    }
    try {
      if (editingRule) {
        await updateRoutingRuleApi(editingRule.id, {
          category: ruleCategory.trim(),
          departmentId: ruleDeptId,
          locationTagPattern: ruleLocationPattern.trim() || null as any,
          priorityOrder: Number(rulePriorityOrder) || 0,
          priorityOverride: (rulePriorityOverride || null) as any,
          isActive: ruleActive,
        });
        showBanner('success', 'Routing rule updated successfully.');
      } else {
        await createRoutingRuleApi({
          category: ruleCategory.trim(),
          departmentId: ruleDeptId,
          locationTagPattern: ruleLocationPattern.trim() || undefined,
          priorityOrder: Number(rulePriorityOrder) || 0,
          priorityOverride: rulePriorityOverride ? (rulePriorityOverride as PriorityLevel) : undefined,
          isActive: ruleActive,
        });
        showBanner('success', 'Routing rule added successfully.');
      }
      setIsRuleModalOpen(false);
      loadRules();
    } catch (err: any) {
      showBanner('error', err.message || 'Failed to save routing rule');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this routing rule?')) return;
    try {
      await deleteRoutingRuleApi(id);
      showBanner('success', 'Routing rule deleted.');
      loadRules();
    } catch (err: any) {
      showBanner('error', err.message || 'Failed to delete routing rule');
    }
  };

  // ---------------------------------------------------------------------------
  // Staff Assignment Handler
  // ---------------------------------------------------------------------------
  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setAssignFeedback(null);
    if (!assignIdentifier.trim()) {
      setAssignFeedback({ type: 'error', text: 'Please enter a user Email or Register Number.' });
      return;
    }
    try {
      setAssignLoading(true);
      const isStudent = assignRole === 'STUDENT';
      const user = await assignUserDepartmentApi({
        email: assignIdentifier.includes('@') ? assignIdentifier.trim() : undefined,
        regNo: !assignIdentifier.includes('@') ? assignIdentifier.trim() : undefined,
        departmentId: isStudent ? null : assignDeptId || null,
        role: assignRole,
      });
      setAssignFeedback({
        type: 'success',
        text: `Successfully provisioned ${user.name} (${user.email}) as ${user.role}${user.departmentId ? ` in department.` : '.'}`,
      });
      setAssignIdentifier('');
    } catch (err: any) {
      setAssignFeedback({ type: 'error', text: err.message || 'Assignment failed' });
    } finally {
      setAssignLoading(false);
    }
  };

  // Filtered lists
  const filteredDepartments = useMemo(() => {
    const q = deptSearch.toLowerCase().trim();
    if (!q) return departments;
    return departments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.code.toLowerCase().includes(q) ||
        d.contactEmail.toLowerCase().includes(q)
    );
  }, [departments, deptSearch]);

  const filteredRules = useMemo(() => {
    const q = ruleSearch.toLowerCase().trim();
    if (!q) return rules;
    return rules.filter(
      (r) =>
        r.category.toLowerCase().includes(q) ||
        (r.locationTagPattern && r.locationTagPattern.toLowerCase().includes(q))
    );
  }, [rules, ruleSearch]);

  const departmentMap = useMemo(() => {
    const map = new Map<string, Department>();
    departments.forEach((d) => map.set(d.id, d));
    return map;
  }, [departments]);

  return (
    <div className="space-y-6">
      {/* Banner */}
      {actionBanner && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-semibold transition-all shadow-xs ${
            actionBanner.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
          }`}
        >
          {actionBanner.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span>{actionBanner.message}</span>
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-x-auto scrollbar-none max-w-full">
          <button
            onClick={() => setSubTab('departments')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'departments'
                ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Departments ({departments.length})</span>
          </button>

          <button
            onClick={() => setSubTab('routing')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'routing'
                ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            {/* overflow-x-auto scrollbar-none flex-wrap */}
            <span>Auto-Routing Rules ({rules.length})</span>
          </button>

          <button
            onClick={() => setSubTab('staff')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'staff'
                ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Staff Credentials & Roles</span>
          </button>

          <button
            onClick={() => setSubTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'audit'
                ? 'bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>System Audit Trail</span>
          </button>
        </div>

        {subTab === 'departments' && (
          <button
            onClick={() => openDeptModal()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Department</span>
          </button>
        )}

        {subTab === 'routing' && (
          <button
            onClick={() => openRuleModal()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Routing Rule</span>
          </button>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* 1. DEPARTMENTS DIRECTORY                                              */}
      {/* --------------------------------------------------------------------- */}
      {subTab === 'departments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={deptSearch}
                onChange={(e) => setDeptSearch(e.target.value)}
                placeholder="Search departments by name, code, or contact..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={loadDepartments}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Refresh departments"
            >
              <RefreshCw className={`w-4 h-4 ${loadingDepts ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Department Name</th>
                    <th className="px-5 py-3.5">Code</th>
                    <th className="px-5 py-3.5">Notification Inbox</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {filteredDepartments.map((dept) => (
                    <tr
                      key={dept.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Building className="w-4 h-4 text-blue-600 shrink-0" />
                          <span>{dept.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {dept.id}</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-mono text-[11px] font-bold border border-blue-200/60 dark:border-blue-900/40">
                          {dept.code}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{dept.contactEmail}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            dept.isActive
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              dept.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          {dept.isActive ? 'Operational' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => openDeptModal(dept)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredDepartments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                        No departments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 2. CATEGORY AUTO-ROUTING RULES                                        */}
      {/* --------------------------------------------------------------------- */}
      {subTab === 'routing' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
                placeholder="Search rules by category or location pattern..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={loadRules}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Refresh rules"
            >
              <RefreshCw className={`w-4 h-4 ${loadingRules ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Grievance Category</th>
                    <th className="px-5 py-3.5">Target Department</th>
                    <th className="px-5 py-3.5">Location Pattern</th>
                    <th className="px-5 py-3.5">Priority</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {filteredRules.map((rule) => {
                    const dept = departmentMap.get(rule.departmentId);
                    return (
                      <tr
                        key={rule.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span>{rule.category}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {dept ? (
                            <div>
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {dept.name}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {dept.code}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono">{rule.departmentId}</span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {rule.locationTagPattern || <span className="text-slate-400 italic">Any zone</span>}
                        </td>
                        <td className="px-5 py-4">
                          {rule.priorityOverride ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200">
                              {rule.priorityOverride}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Default</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              rule.isActive
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                            }`}
                          >
                            {rule.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => openRuleModal(rule)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                              title="Edit rule"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                              title="Delete rule"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRules.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                        No category routing rules configured.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 3. STAFF CREDENTIALS & ROLE ASSIGNMENT                                */}
      {/* --------------------------------------------------------------------- */}
      {subTab === 'staff' && (
        <div className="max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-600" />
              <span>Assign Staff Credentials & Department Roles</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Grant staff or department head privileges mapped to an administrative unit. Upon unified admin login, credentials automatically route to the scoped department dashboard.
            </p>
          </div>

          {assignFeedback && (
            <div
              className={`p-4 rounded-2xl flex items-center gap-3 text-xs font-semibold ${
                assignFeedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border border-rose-200'
              }`}
            >
              {assignFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{assignFeedback.text}</span>
            </div>
          )}

          <form onSubmit={handleAssignStaff} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Staff User Identifier (Email or Register Number)
              </label>
              <input
                type="text"
                value={assignIdentifier}
                onChange={(e) => setAssignIdentifier(e.target.value)}
                placeholder="e.g. staff.network@college.edu or STAFF_NET_01"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Administrative Role
                </label>
                <select
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="DEPARTMENT_STAFF">DEPARTMENT_STAFF (Scoped Queue Resolver)</option>
                  <option value="DEPARTMENT_HEAD">DEPARTMENT_HEAD (Coordinator / Escalation Lead)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (Campus-Wide Unrestricted)</option>
                  <option value="STUDENT">STUDENT (Revoke Admin Privileges)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Assigned Department
                </label>
                <select
                  value={assignDeptId}
                  onChange={(e) => setAssignDeptId(e.target.value)}
                  disabled={assignRole === 'SUPER_ADMIN' || assignRole === 'STUDENT'}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  required={assignRole === 'DEPARTMENT_STAFF' || assignRole === 'DEPARTMENT_HEAD'}
                >
                  <option value="">-- Select Department --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={assignLoading}
                className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{assignLoading ? 'Assigning Credentials...' : 'Assign Role & Department'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* 4. AUDIT LOGS VIEWER                                                  */}
      {/* --------------------------------------------------------------------- */}
      {subTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Filter Entity:</span>
              <select
                value={auditFilterType}
                onChange={(e) => setAuditFilterType(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none"
              >
                <option value="all">All Entity Types</option>
                <option value="grievance">Grievance Transfers & Escalations</option>
                <option value="department">Department Lifecycle</option>
                <option value="routing_rule">Routing Rules</option>
                <option value="user">User Role Assignments</option>
              </select>
            </div>

            <button
              onClick={loadAuditLogs}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
              title="Refresh audit logs"
            >
              <RefreshCw className={`w-4 h-4 ${loadingAudit ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Timestamp</th>
                    <th className="px-5 py-3.5">Action</th>
                    <th className="px-5 py-3.5">Actor</th>
                    <th className="px-5 py-3.5">Entity</th>
                    <th className="px-5 py-3.5">Reason / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {auditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                        <Clock className="w-3 h-3 inline mr-1 text-slate-400" />
                        {new Date(log.timestamp || (log as any).createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[11px] font-bold">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {log.actorEmail || log.actorId}
                        </div>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                          {log.actorRole}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="capitalize text-slate-700 dark:text-slate-300">
                          {log.entityType}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{log.entityId}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-400 text-[11px]">
                        {log.reason || 'Standard administrative operation'}
                      </td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                        No audit records recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: CREATE / EDIT DEPARTMENT                                       */}
      {/* --------------------------------------------------------------------- */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Building className="w-5 h-5 text-blue-600" />
              <span>{editingDept ? 'Edit Department' : 'Create New Department'}</span>
            </h3>

            <form onSubmit={handleSaveDept} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Department Name
                </label>
                <input
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Computer Science & Engineering"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Department Code (Uppercase)
                </label>
                <input
                  type="text"
                  value={deptCode}
                  onChange={(e) => setDeptCode(e.target.value)}
                  placeholder="e.g. DEPT_CSE"
                  disabled={Boolean(editingDept)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white uppercase font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Notification Inbox (Contact Email)
                </label>
                <input
                  type="email"
                  value={deptEmail}
                  onChange={(e) => setDeptEmail(e.target.value)}
                  placeholder="e.g. cse-grievance@college.edu"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="deptActiveCheck"
                  checked={deptActive}
                  onChange={(e) => setDeptActive(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="deptActiveCheck" className="text-slate-700 dark:text-slate-300 font-semibold">
                  Department is Operational (Active)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                >
                  {editingDept ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------- */}
      {/* MODAL: ADD / EDIT ROUTING RULE                                        */}
      {/* --------------------------------------------------------------------- */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-blue-600" />
              <span>{editingRule ? 'Edit Category Routing Rule' : 'Add Auto-Routing Rule'}</span>
            </h3>

            <form onSubmit={handleSaveRule} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  value={ruleCategory}
                  onChange={(e) => setRuleCategory(e.target.value)}
                  placeholder="e.g. Wi-Fi Issue or Library & Wi-Fi"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Target Department
                </label>
                <select
                  value={ruleDeptId}
                  onChange={(e) => setRuleDeptId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Select Department --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Location Pattern (Optional Sub-Routing)
                </label>
                <input
                  type="text"
                  value={ruleLocationPattern}
                  onChange={(e) => setRuleLocationPattern(e.target.value)}
                  placeholder="e.g. block_A or route_12"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Priority Override
                  </label>
                  <select
                    value={rulePriorityOverride}
                    onChange={(e) => setRulePriorityOverride(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No Override</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Order Weight
                  </label>
                  <input
                    type="number"
                    value={rulePriorityOrder}
                    onChange={(e) => setRulePriorityOrder(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ruleActiveCheck"
                  checked={ruleActive}
                  onChange={(e) => setRuleActive(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="ruleActiveCheck" className="text-slate-700 dark:text-slate-300 font-semibold">
                  Rule is Active
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold cursor-pointer"
                >
                  {editingRule ? 'Update Rule' : 'Save Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
