/**
 * API client for VIP KIDS TRANSPORTATION.
 * Wraps fetch with auto-Bearer-token + JSON helpers.
 */
import { storage } from '@/src/utils/storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const API = `${BASE}/api`;

export const TOKEN_KEY = 'vipkids_token';

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  auth?: boolean;
};

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await storage.secureGet(TOKEN_KEY, '');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.detail || data?.message || `Request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export const Api = {
  login: (email: string, password: string) =>
    api<{ access_token: string; user: any }>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (data: any) =>
    api<{ access_token: string; user: any }>('/auth/register', { method: 'POST', body: data, auth: false }),
  me: () => api<any>('/auth/me'),
  updatePrefs: (prefs: any) => api('/auth/notif-prefs', { method: 'PUT', body: prefs }),
  updatePhoto: (photo_url: string) => api('/auth/photo', { method: 'PUT', body: { photo_url } }),

  // Parent
  parentDashboard: () => api<any>('/parent/dashboard'),
  parentChildren: () => api<any[]>('/parent/children'),
  parentTrack: (childId: string) => api<any>(`/parent/track/${childId}`),
  parentScheduleRequest: (data: any) => api('/parent/schedule-request', { method: 'POST', body: data }),
  parentListScheduleRequests: () => api<any[]>('/parent/schedule-requests'),

  // Driver
  driverToday: () => api<any[]>('/driver/today'),
  driverCheckin: (data: any) => api('/driver/checkin', { method: 'POST', body: data }),
  driverLocation: (lat: number, lng: number) =>
    api('/driver/location', { method: 'POST', body: { lat, lng } }),
  driverStart: () => api('/driver/route/start', { method: 'POST' }),
  driverEnd: () => api('/driver/route/end', { method: 'POST' }),

  // Chat
  conversations: () => api<any[]>('/chat/conversations'),
  messages: (uid: string) => api<any[]>(`/chat/messages/${uid}`),
  sendMessage: (to_user_id: string, text: string, child_id?: string) =>
    api('/chat/send', { method: 'POST', body: { to_user_id, text, child_id } }),

  // Notifs
  notifications: () => api<any[]>('/notifications'),

  // Admin
  adminUsers: (role?: string) => api<any[]>(`/admin/users${role ? `?role=${role}` : ''}`),
  adminCreateUser: (data: any) => api('/admin/users', { method: 'POST', body: data }),
  adminDeleteUser: (uid: string) => api(`/admin/users/${uid}`, { method: 'DELETE' }),
  adminChildren: () => api<any[]>('/admin/children'),
  adminCreateChild: (data: any) => api('/admin/children', { method: 'POST', body: data }),
  adminUpdateChild: (cid: string, data: any) => api(`/admin/children/${cid}`, { method: 'PUT', body: data }),
  adminDeleteChild: (cid: string) => api(`/admin/children/${cid}`, { method: 'DELETE' }),
  adminAssignChild: (cid: string, data: { driver_id?: string; vehicle_id?: string }) =>
    api(`/admin/children/${cid}/assign`, { method: 'PUT', body: data }),
  adminChildPhoto: (cid: string, photo_url: string) =>
    api(`/admin/children/${cid}/photo`, { method: 'PUT', body: { photo_url } }),
  adminPending: () => api<any[]>('/admin/pending-users'),
  adminApprove: (uid: string) => api(`/admin/approve/${uid}`, { method: 'POST' }),
  adminReject: (uid: string) => api(`/admin/reject/${uid}`, { method: 'POST' }),
  adminActivateParent: (uid: string) => api(`/admin/activate-parent/${uid}`, { method: 'POST' }),
  adminSuspend: (uid: string) => api(`/admin/users/${uid}/suspend`, { method: 'POST' }),
  adminReactivate: (uid: string) => api(`/admin/users/${uid}/reactivate`, { method: 'POST' }),
  adminDriverCompliance: (uid: string, data: any) => api(`/admin/users/${uid}/compliance`, { method: 'PUT', body: data }),
  adminComplianceAlerts: () => api<any[]>('/admin/compliance-alerts'),
  adminPayments: (month?: string) => api<any[]>(`/admin/payments${month ? `?month=${month}` : ''}`),
  adminCreatePayment: (data: any) => api('/admin/payments', { method: 'POST', body: data }),
  adminUpdatePayment: (pid: string, data: any) => api(`/admin/payments/${pid}`, { method: 'PUT', body: data }),
  adminDeletePayment: (pid: string) => api(`/admin/payments/${pid}`, { method: 'DELETE' }),
  parentChildDetail: (cid: string) => api<any>(`/parent/child/${cid}`),
  adminVehicles: () => api<any[]>('/admin/vehicles'),
  adminCreateVehicle: (data: any) => api('/admin/vehicles', { method: 'POST', body: data }),
  adminLiveRoutes: () => api<any[]>('/admin/live-routes'),
  adminAnnounce: (data: any) => api('/admin/announcement', { method: 'POST', body: data }),
  adminScheduleRequests: () => api<any[]>('/admin/schedule-requests'),
  announcements: () => api<any[]>('/announcements'),
};
