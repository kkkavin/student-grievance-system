import {
  Grievance,
  UserProfile,
  PriorityLevel,
  GrievanceStatus,
  TrendAnalyticsResponse,
  RiskForecastResponse,
  TriageGrievance,
  Department,
  CategoryRoutingRule,
  AuditLogEntry,
  UserRole,
} from './types';

export interface SanitizedStudentGrievance extends Grievance {
  masterTicketNo?: string;
  masterStatus?: string;
}

export interface FetchGrievancesParams {
  role?: string;
  studentRegNo?: string;
  studentEmail?: string;
}

// ---------------------------------------------------------------------------
// JWT Token Persistence & Auth Headers
// ---------------------------------------------------------------------------
const TOKEN_KEY = 'grievance_portal_jwt';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

export function clearAuthToken(): void {
  setAuthToken(null);
}

export function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Grievances API
// ---------------------------------------------------------------------------
export async function fetchGrievances(
  paramsOrRegNo?: string | FetchGrievancesParams
): Promise<SanitizedStudentGrievance[]> {
  let url = '/api/grievances';
  if (typeof paramsOrRegNo === 'string' && paramsOrRegNo.trim()) {
    url = `/api/grievances?role=student&studentRegNo=${encodeURIComponent(paramsOrRegNo.trim())}`;
  } else if (paramsOrRegNo && typeof paramsOrRegNo === 'object') {
    const q = new URLSearchParams();
    if (paramsOrRegNo.role) q.append('role', paramsOrRegNo.role);
    if (paramsOrRegNo.studentRegNo) q.append('studentRegNo', paramsOrRegNo.studentRegNo);
    if (paramsOrRegNo.studentEmail) q.append('studentEmail', paramsOrRegNo.studentEmail);
    const qs = q.toString();
    if (qs) url = `/api/grievances?${qs}`;
  }

  const res = await fetch(url, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch grievances: ${res.statusText}`);
  }
  return res.json();
}

export async function createGrievanceApi(grievance: Grievance): Promise<Grievance> {
  const res = await fetch('/api/grievances', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(grievance),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to create grievance`);
  }
  return res.json();
}

export async function updateGrievanceApi(
  id: string,
  updates: Partial<Grievance>
): Promise<Grievance> {
  const res = await fetch(`/api/grievances/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update grievance`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Authentication API
// ---------------------------------------------------------------------------
export async function loginUserApi(
  identifier: string,
  password: string
): Promise<UserProfile> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ regNo: identifier, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Authentication failed');
  }
  if (data.token) {
    setAuthToken(data.token);
  }
  return data.user;
}

export interface AdminLoginResponse {
  success: boolean;
  token: string;
  user: UserProfile;
  redirectUrl: string;
}

export async function adminLoginApi(
  identifier: string,
  password: string
): Promise<AdminLoginResponse> {
  const res = await fetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Admin authentication failed');
  }
  if (data.token) {
    setAuthToken(data.token);
  }
  return data;
}

export async function registerUserApi(
  userData: Partial<UserProfile> & { password: string }
): Promise<UserProfile> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Registration failed');
  }
  return data.user;
}

export async function saveUserApi(
  user: Partial<UserProfile> & { password?: string; passwordHash?: string }
): Promise<UserProfile> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(user),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to save user profile');
  }
  return res.json();
}

export async function getUserApi(regNo: string): Promise<UserProfile | null> {
  const res = await fetch(`/api/users/${encodeURIComponent(regNo)}`, {
    headers: getAuthHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('Failed to fetch user');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Analytics & Deduplication Triage API Endpoints
// ---------------------------------------------------------------------------
export async function fetchAnalyticsTrendsApi(): Promise<TrendAnalyticsResponse> {
  const res = await fetch('/api/analytics/trends', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch analytics trends`);
  }
  return res.json();
}

export async function fetchRiskForecastApi(): Promise<RiskForecastResponse> {
  const res = await fetch('/api/analytics/risk-forecast', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch risk forecast`);
  }
  return res.json();
}

export async function fetchTriageQueueApi(): Promise<{ suspectedDuplicates: TriageGrievance[] }> {
  const res = await fetch('/api/grievances/triage', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch triage queue`);
  }
  return res.json();
}

export async function mergeTicketsApi(
  masterId: string,
  childId: string
): Promise<{ success: boolean; masterCaseId: string; childTicketId: string }> {
  const res = await fetch('/api/grievances/merge', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ masterId, childId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to merge tickets`);
  }
  return res.json();
}

export async function detachTicketApi(
  childId: string
): Promise<{ success: boolean; detachedTicketId: string; newStatus: 'PRIMARY' }> {
  const res = await fetch('/api/grievances/detach', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ childId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to detach ticket`);
  }
  return res.json();
}

export async function updateMasterNotesApi(
  masterId: string,
  publicMasterNotes: string
): Promise<{ success: boolean; id: string; publicMasterNotes: string }> {
  const res = await fetch(`/api/grievances/${encodeURIComponent(masterId)}/master-notes`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ publicMasterNotes }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update master notes`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Department Management & Targeted Reassignment APIs
// ---------------------------------------------------------------------------
export async function fetchDepartmentsApi(): Promise<Department[]> {
  const res = await fetch('/api/departments', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch departments');
  }
  return res.json();
}

export async function fetchAdminDepartmentsApi(onlyActive = false): Promise<Department[]> {
  const res = await fetch(`/api/admin/departments?onlyActive=${onlyActive}`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch admin departments');
  }
  return data.departments || [];
}

export async function createDepartmentApi(dept: {
  name: string;
  code: string;
  contactEmail: string;
  isActive?: boolean;
}): Promise<Department> {
  const res = await fetch('/api/admin/departments', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(dept),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create department');
  }
  return data.department;
}

export async function updateDepartmentApi(
  id: string,
  updates: Partial<Department>
): Promise<Department> {
  const res = await fetch(`/api/admin/departments/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(updates),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to update department');
  }
  return data.department;
}

export async function fetchRoutingRulesApi(): Promise<CategoryRoutingRule[]> {
  const res = await fetch('/api/admin/routing-rules', {
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch routing rules');
  }
  return data.rules || [];
}

export async function createRoutingRuleApi(rule: {
  category: string;
  departmentId: string;
  locationTagPattern?: string;
  priorityOrder?: number;
  priorityOverride?: PriorityLevel;
  isActive?: boolean;
}): Promise<CategoryRoutingRule> {
  const res = await fetch('/api/admin/routing-rules', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(rule),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to create routing rule');
  }
  return data.rule;
}

export async function updateRoutingRuleApi(
  id: string,
  updates: Partial<CategoryRoutingRule>
): Promise<CategoryRoutingRule> {
  const res = await fetch(`/api/admin/routing-rules/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(updates),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to update routing rule');
  }
  return data.rule;
}

export async function deleteRoutingRuleApi(id: string): Promise<boolean> {
  const res = await fetch(`/api/admin/routing-rules/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to delete routing rule');
  }
  return true;
}

export async function assignUserDepartmentApi(payload: {
  userId?: string;
  regNo?: string;
  email?: string;
  departmentId: string | null;
  role: UserRole;
}): Promise<UserProfile> {
  const res = await fetch('/api/admin/users/assign-department', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to assign user department');
  }
  return data.user;
}

export async function fetchAuditLogsApi(params?: {
  entityType?: string;
  entityId?: string;
  actorId?: string;
}): Promise<AuditLogEntry[]> {
  const q = new URLSearchParams();
  if (params?.entityType) q.append('entityType', params.entityType);
  if (params?.entityId) q.append('entityId', params.entityId);
  if (params?.actorId) q.append('actorId', params.actorId);
  const qs = q.toString() ? `?${q.toString()}` : '';
  const res = await fetch(`/api/admin/audit-logs${qs}`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch audit logs');
  }
  return data.auditLogs || [];
}

export async function reassignGrievanceApi(
  id: string,
  departmentId: string,
  reason?: string
): Promise<{ success: boolean; newDepartmentId: string; grievance: Grievance }> {
  const res = await fetch(`/api/grievances/${encodeURIComponent(id)}/reassign`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ departmentId, reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to reassign grievance');
  }
  return data;
}

export async function requestReassignGrievanceApi(
  id: string,
  suggestedDepartmentId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/grievances/${encodeURIComponent(id)}/request-reassign`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ suggestedDepartmentId, reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to request reassignment');
  }
  return data;
}

export async function escalateGrievanceApi(
  id: string,
  reason?: string
): Promise<{ success: boolean; grievance: Grievance }> {
  const res = await fetch(`/api/grievances/${encodeURIComponent(id)}/escalate`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ reason }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to escalate grievance');
  }
  return data;
}

// ---------------------------------------------------------------------------
// Standard API Aliases
// ---------------------------------------------------------------------------
export const fetchAnalyticsTrends = fetchAnalyticsTrendsApi;
export const fetchRiskForecast = fetchRiskForecastApi;
export const fetchTriageQueue = fetchTriageQueueApi;
export const mergeTicket = mergeTicketsApi;
export const mergeTickets = mergeTicketsApi;
export const detachTicket = detachTicketApi;
export const updateMasterNotes = (id: string, notes: string) =>
  updateMasterNotesApi(id, notes);
