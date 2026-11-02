import {
  Grievance,
  UserProfile,
  PriorityLevel,
  GrievanceStatus,
  TrendAnalyticsResponse,
  RiskForecastResponse,
  TriageGrievance,
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

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch grievances: ${res.statusText}`);
  }
  return res.json();
}

export async function createGrievanceApi(grievance: Grievance): Promise<Grievance> {
  const res = await fetch('/api/grievances', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update grievance`);
  }
  return res.json();
}

export async function loginUserApi(
  identifier: string,
  password: string
): Promise<UserProfile> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ regNo: identifier, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Authentication failed');
  }
  return data.user;
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to save user profile');
  }
  return res.json();
}

export async function getUserApi(regNo: string): Promise<UserProfile | null> {
  const res = await fetch(`/api/users/${encodeURIComponent(regNo)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error('Failed to fetch user');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Milestone 3: Analytics & Deduplication Triage API Endpoints
// ---------------------------------------------------------------------------

export async function fetchAnalyticsTrendsApi(): Promise<TrendAnalyticsResponse> {
  const res = await fetch('/api/analytics/trends');
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch analytics trends`);
  }
  return res.json();
}

export async function fetchRiskForecastApi(): Promise<RiskForecastResponse> {
  const res = await fetch('/api/analytics/risk-forecast');
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch risk forecast`);
  }
  return res.json();
}

export async function fetchTriageQueueApi(): Promise<{ suspectedDuplicates: TriageGrievance[] }> {
  const res = await fetch('/api/grievances/triage');
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicMasterNotes }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update master notes`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Standard API Aliases (Conforming to Milestone 3 Interface Specifications)
// ---------------------------------------------------------------------------
export const fetchAnalyticsTrends = fetchAnalyticsTrendsApi;
export const fetchRiskForecast = fetchRiskForecastApi;
export const fetchTriageQueue = fetchTriageQueueApi;
export const mergeTicket = mergeTicketsApi;
export const mergeTickets = mergeTicketsApi;
export const detachTicket = detachTicketApi;
export const updateMasterNotes = (id: string, notes: string) =>
  updateMasterNotesApi(id, notes);


