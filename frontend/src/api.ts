/**
 * API client for VIP KIDS TRANSPORTATION.
 * Wraps fetch with auto-Bearer-token + JSON helpers.
 */
import { storage } from '@/src/utils/storage';

const BASE = (process.env.EXPO_PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
const ALLOW_INSECURE_HTTP = process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP === 'true';
const API = `${BASE}/api`;
const REQUEST_TIMEOUT_MS = 15_000;

export const TOKEN_KEY = 'vipkids_token';

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  auth?: boolean;
};

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  if (!BASE) throw new Error('VIP Kids is not connected to its secure service. Please contact support.');
  if (!__DEV__ && !ALLOW_INSECURE_HTTP && !BASE.startsWith('https://')) {
    throw new Error('VIP Kids requires a secure HTTPS connection in production.');
  }
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await storage.secureGet(TOKEN_KEY, '');
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') throw new Error('The secure service did not respond. Please try again.');
    throw new Error('Unable to reach the secure service. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { detail: text.trim() || `Request failed (${res.status})` }; }
  }
  if (!res.ok) {
    const msg = data?.detail || data?.message || `Request failed (${res.status})`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export const Api = {
  login: (email: string, password: string) =>
    api<{ access_token: string; user: any }>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (data: { name: string; email: string; password: string; role: 'parent' | 'driver'; phone?: string; address?: string }) =>
    api<{ ok: boolean; status: 'pending'; message: string }>('/auth/register', { method: 'POST', body: data, auth: false }),
  deleteAccount: (email: string, password: string) =>
    api<{ ok: boolean; message: string }>('/auth/delete-account', {
      method: 'POST', body: { email, password, confirmation: 'DELETE' }, auth: false,
    }),
  me: () => api<any>('/auth/me'),
  updatePrefs: (prefs: any) => api('/auth/notif-prefs', { method: 'PUT', body: prefs }),
  updatePhoto: (photo_url: string) => api('/auth/photo', { method: 'PUT', body: { photo_url } }),
  registerPushToken: (data: { token: string; platform: 'android' | 'ios' | 'web' | 'unknown' }) =>
    api('/push/register', { method: 'POST', body: data }),
  unregisterPushToken: (data: { token: string; platform: 'android' | 'ios' | 'web' | 'unknown' }) =>
    api('/push/unregister', { method: 'POST', body: data }),

  // Parent
  parentDashboard: () => api<any>('/parent/dashboard'),
  parentChildren: () => api<any[]>('/parent/children'),
  parentCreateChild: (data: any) => api<any>('/parent/children', { method: 'POST', body: data }),
  parentTrack: (childId: string) => api<any>(`/parent/track/${childId}`),
  parentScheduleRequest: (data: any) => api('/parent/schedule-request', { method: 'POST', body: data }),
  parentListScheduleRequests: () => api<any[]>('/parent/schedule-requests'),

  // Child (restricted assigned-ride view)
  childTrack: () => api<any>('/child/track'),
  childReady: () => api<{ ok: boolean; message: string }>('/child/ready', { method: 'POST' }),

  // Driver
  driverToday: () => api<any[]>('/driver/today'),
  driverCheckin: (data: any) => api('/driver/checkin', { method: 'POST', body: data }),
  driverLocation: (lat: number, lng: number) =>
    api('/driver/location', { method: 'POST', body: { lat, lng } }),
  driverStart: (phase: 'morning' | 'afternoon') => api('/driver/route/start', {
    method: 'POST',
    body: {
      phase,
      seatbelts_checked: true,
      fuel_level_checked: true,
      phone_charged_and_mounted: true,
    },
  }),
  driverPlan: (data: { phase: 'morning' | 'afternoon'; addresses: string[]; points: Array<{ lat: number; lng: number }> }) =>
    api('/driver/route/plan', { method: 'POST', body: data }),
  driverEnd: (safetyCheck?: { all_children_accounted_for: boolean; vehicle_checked_empty: boolean }) =>
    api('/driver/route/end', { method: 'POST', body: safetyCheck }),
  driverEmergency: (data: { lat?: number; lng?: number; message?: string }) =>
    api<any>('/driver/emergency', { method: 'POST', body: data }),

  // Chat
  conversations: () => api<any[]>('/chat/conversations'),
  messages: (uid: string) => api<any[]>(`/chat/messages/${uid}`),
  sendMessage: (to_user_id: string, text: string, child_id?: string) =>
    api('/chat/send', { method: 'POST', body: { to_user_id, text, child_id } }),

  // Notifs
  notifications: () => api<any[]>('/notifications'),
  markNotificationRead: (id: string) => api(`/notifications/${id}/read`, { method: 'POST' }),

  // Admin
  adminUsers: (role?: string) => api<any[]>(`/admin/users${role ? `?role=${role}` : ''}`),
  adminDeleteUser: (uid: string) => api(`/admin/users/${uid}`, { method: 'DELETE' }),
  adminChildren: () => api<any[]>('/admin/children'),
  adminCreateChild: (data: any) => api('/admin/children', { method: 'POST', body: data }),
  adminUpdateChild: (cid: string, data: any) => api(`/admin/children/${cid}`, { method: 'PUT', body: data }),
  adminDeleteChild: (cid: string) => api(`/admin/children/${cid}`, { method: 'DELETE' }),
  adminSetChildAccess: (cid: string, data: { email: string; password?: string; enabled?: boolean; guardian_consent_confirmed: boolean }) =>
    api(`/admin/children/${cid}/access`, { method: 'PUT', body: data }),
  adminDeleteChildAccess: (cid: string) => api(`/admin/children/${cid}/access`, { method: 'DELETE' }),
  adminAssignChild: (cid: string, data: { driver_id?: string; vehicle_id?: string }) =>
    api(`/admin/children/${cid}/assign`, { method: 'PUT', body: data }),
  adminPending: () => api<any[]>('/admin/pending-users'),
  adminApprove: (uid: string) => api(`/admin/approve/${uid}`, { method: 'POST' }),
  adminReject: (uid: string) => api(`/admin/reject/${uid}`, { method: 'POST' }),
  adminActivateParent: (uid: string) => api(`/admin/activate-parent/${uid}`, { method: 'POST' }),
  adminSuspend: (uid: string) => api(`/admin/users/${uid}/suspend`, { method: 'POST' }),
  adminReactivate: (uid: string) => api(`/admin/users/${uid}/reactivate`, { method: 'POST' }),
  adminDriverCompliance: (uid: string, data: any) => api(`/admin/users/${uid}/compliance`, { method: 'PUT', body: data }),
  adminComplianceAlerts: () => api<any[]>('/admin/compliance-alerts'),
  parentChildDetail: (cid: string) => api<any>(`/parent/child/${cid}`),
  adminVehicles: () => api<any[]>('/admin/vehicles'),
  adminCreateVehicle: (data: any) => api('/admin/vehicles', { method: 'POST', body: data }),
  adminLiveRoutes: () => api<any[]>('/admin/live-routes'),
  adminAnnounce: (data: any) => api('/admin/announcement', { method: 'POST', body: data }),
  adminScheduleRequests: () => api<any[]>('/admin/schedule-requests'),
  announcements: () => api<any[]>('/announcements'),
  adminUpdateUser: (uid: string, data: any) => api(`/admin/users/${uid}`, { method: 'PUT', body: data }),
  adminUpdateVehicle: (vid: string, data: any) => api(`/admin/vehicles/${vid}`, { method: 'PUT', body: data }),
  adminDeleteVehicle: (vid: string) => api(`/admin/vehicles/${vid}`, { method: 'DELETE' }),
  adminListRoutes: () => api<any[]>('/admin/routes'),
  adminCreateRoute: (data: any) => api('/admin/routes', { method: 'POST', body: data }),
  adminUpdateRoute: (rid: string, data: any) => api(`/admin/routes/${rid}`, { method: 'PUT', body: data }),
  adminDeleteRoute: (rid: string) => api(`/admin/routes/${rid}`, { method: 'DELETE' }),
  adminOpsToday: () => api<any>('/admin/operations/today'),
  adminEvents: (params: { date?: string; driver_id?: string; child_id?: string }) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([_, v]) => v) as any).toString();
    return api<any[]>(`/admin/events${qs ? `?${qs}` : ''}`);
  },
  adminActivity: (date?: string) => api<any[]>(`/admin/activity${date ? `?date=${encodeURIComponent(date)}` : ''}`),
};
