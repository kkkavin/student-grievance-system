import { Grievance, UserProfile, PriorityLevel, GrievanceStatus } from './types';

export async function fetchGrievances(): Promise<Grievance[]> {
  const res = await fetch('/api/grievances');
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
