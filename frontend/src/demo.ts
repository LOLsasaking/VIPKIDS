export type DemoRole = 'parent' | 'driver' | 'child' | 'admin';

export const DEMO_TOKEN_PREFIX = 'vipkids_demo_token:';
export const DEMO_USER_KEY = 'vipkids_demo_user';
export const DEMO_PASSWORD = 'vipdemo123';

const nowIso = () => new Date().toISOString();

const routeColors = ['#D4AF37', '#35D0BA', '#7C5CFF', '#FF8A3D', '#4F8CFF', '#2ECC71', '#FF5C8A', '#B978FF', '#00A8E8', '#F5C542'];

const driverNames = [
  'Alexander Goncalves',
  'Marcus Rivera',
  'Daniel Thompson',
  'Kevin Alvarez',
  'Samuel Brooks',
  'Anthony Carter',
  'Julian Morales',
  'Victor Hayes',
  'Diego Santos',
  'Rafael Bennett',
];

const vehicleModels = [
  ['Hyundai', 'Palisade'],
  ['Chevrolet', 'Suburban'],
  ['Cadillac', 'Escalade'],
  ['GMC', 'Yukon'],
  ['Lincoln', 'Navigator'],
  ['Ford', 'Expedition'],
  ['Jeep', 'Wagoneer'],
  ['Toyota', 'Sequoia'],
  ['Lexus', 'LX 600'],
  ['Mercedes-Benz', 'GLS 580'],
];

const childNames = [
  'Mia Gonzalez',
  'Leo Martinez',
  'Sofia Rivera',
  'Noah Johnson',
  'Ava Thompson',
  'Ethan Brooks',
  'Isabella Carter',
  'Lucas Morales',
  'Emma Hayes',
  'Mateo Santos',
  'Olivia Bennett',
  'Liam Parker',
];

const parentNames = [
  'Natalie Gonzalez',
  'Carlos Martinez',
  'Vanessa Rivera',
  'Monica Johnson',
  'Rachel Thompson',
  'Tanya Brooks',
  'Angela Carter',
  'Marisol Morales',
  'Bianca Hayes',
  'Camila Santos',
];

const basePoints = [
  { lat: 25.7617, lng: -80.1918 },
  { lat: 25.7669, lng: -80.2061 },
  { lat: 25.7743, lng: -80.2146 },
  { lat: 25.7828, lng: -80.2261 },
  { lat: 25.7907, lng: -80.2390 },
];

const makeRoutePoints = (index: number) => {
  const offset = index * 0.006;
  return basePoints.map((point, pointIndex) => ({
    lat: point.lat + offset + pointIndex * 0.0012,
    lng: point.lng - offset + pointIndex * 0.0009,
  }));
};

const liveLocationFor = (index: number) => {
  const route = makeRoutePoints(index);
  const step = Math.floor(Date.now() / 5000) % route.length;
  return { ...route[step], updated_at: nowIso() };
};

export const demoUsers = {
  parent: {
    id: 'demo-parent-1',
    email: 'parent.demo@vipkidstest.com',
    name: 'Natalie Gonzalez',
    role: 'parent' as const,
    phone: '305-555-0101',
    status: 'active',
    notif_prefs: { picked_up: true, no_show: true, emergency: true, delay: true },
  },
  driver: {
    id: 'demo-driver-1',
    email: 'driver.demo@vipkidstest.com',
    name: 'Alexander Goncalves',
    role: 'driver' as const,
    phone: '305-308-7206',
    status: 'active',
    on_duty: true,
  },
  child: {
    id: 'demo-child-user-1',
    email: 'child.demo@vipkidstest.com',
    name: 'Mia Gonzalez',
    role: 'child' as const,
    child_id: 'demo-child-1',
    status: 'active',
  },
  admin: {
    id: 'demo-admin-1',
    email: 'admin.demo@vipkidstest.com',
    name: 'VIP Concierge',
    role: 'admin' as const,
    phone: '305-555-0000',
    status: 'active',
  },
};

export const demoParents = parentNames.map((name, index) => ({
  id: `demo-parent-${index + 1}`,
  email: index === 0 ? demoUsers.parent.email : `parent${index + 1}.demo@vipkidstest.com`,
  name,
  role: 'parent',
  phone: `305-555-01${String(index + 1).padStart(2, '0')}`,
  status: 'active',
}));

export const demoDrivers = driverNames.map((name, index) => ({
  id: `demo-driver-${index + 1}`,
  email: index === 0 ? demoUsers.driver.email : `driver${index + 1}.demo@vipkidstest.com`,
  name,
  role: 'driver',
  phone: index === 0 ? '305-308-7206' : `305-555-02${String(index + 1).padStart(2, '0')}`,
  status: 'active',
  on_duty: index < 8,
  photo_url: `https://i.pravatar.cc/180?img=${11 + index}`,
  license_number: index === 0 ? 'G230-618-16-600-0' : `D-${9300 + index}-VIP`,
  license_expiry: `2026-${String((index % 9) + 3).padStart(2, '0')}-15`,
  permit_expiry: `2026-${String((index % 8) + 4).padStart(2, '0')}-22`,
}));

export const demoVehicles = vehicleModels.map(([make, model], index) => ({
  id: `demo-vehicle-${index + 1}`,
  driver_id: `demo-driver-${index + 1}`,
  make,
  model,
  color: 'BLACK',
  plate: index === 0 ? 'B8UFT' : `VIP${String(index + 2).padStart(3, '0')}`,
  seats: 7,
  fleet_index: index,
  registration_date: `2025-${String((index % 9) + 1).padStart(2, '0')}-01`,
  registration_expiry: `2026-${String((index % 8) + 4).padStart(2, '0')}-28`,
}));

export const demoChildren = childNames.map((name, index) => {
  const driverIndex = Math.min(index, 9);
  return {
    id: `demo-child-${index + 1}`,
    parent_id: `demo-parent-${index === 1 ? 1 : Math.min(index + 1, 10)}`,
    driver_id: `demo-driver-${driverIndex + 1}`,
    vehicle_id: `demo-vehicle-${driverIndex + 1}`,
    name,
    school: index % 2 === 0 ? 'Pinecrest Academy' : 'St. Thomas Preparatory',
    school_address: index % 2 === 0 ? '1020 Academy Dr, Miami, FL' : '1850 Coral Way, Miami, FL',
    home_address: `${1200 + index * 77} VIP Residence Ave, Miami, FL`,
    pickup_time: index % 2 === 0 ? '7:15 AM' : '7:35 AM',
    dropoff_time: index % 2 === 0 ? '8:00 AM' : '8:20 AM',
    emergency_contact_name: index % 2 === 0 ? 'Parent / Guardian' : 'Emergency Contact',
    emergency_contact_phone: `305-555-03${String(index + 1).padStart(2, '0')}`,
    latest_event: {
      id: `demo-event-child-${index + 1}`,
      event_type: index % 4 === 0 ? 'picked_up' : index % 5 === 0 ? 'approaching' : 'on_the_way',
      message: index % 4 === 0 ? `${name.split(' ')[0]} has been picked up.` : 'Driver is following the assigned route.',
      created_at: nowIso(),
    },
  };
});

const decorateChild = (child: any) => {
  const driver = demoDrivers.find((item) => item.id === child.driver_id);
  const vehicle = demoVehicles.find((item) => item.id === child.vehicle_id);
  return { ...child, driver, vehicle };
};

const publicUsers = () => [
  demoUsers.admin,
  ...demoParents,
  ...demoDrivers,
  ...demoChildren.map((child, index) => ({
    id: `demo-child-user-${index + 1}`,
    email: index === 0 ? demoUsers.child.email : `child${index + 1}.demo@vipkidstest.com`,
    name: child.name,
    role: 'child',
    status: 'active',
    child_id: child.id,
  })),
];

const parentChildren = () => demoChildren.filter((child) => child.parent_id === demoUsers.parent.id).map(decorateChild);
const driverChildren = () => demoChildren.filter((child) => child.driver_id === demoUsers.driver.id).map(decorateChild);

const trackForChild = (childId: string) => {
  const child = decorateChild(demoChildren.find((item) => item.id === childId) || demoChildren[0]);
  const driverIndex = Math.max(0, demoDrivers.findIndex((item) => item.id === child.driver_id));
  const planned = makeRoutePoints(driverIndex);
  return {
    child,
    driver: child.driver,
    vehicle: child.vehicle,
    location: liveLocationFor(driverIndex),
    events: [child.latest_event],
    planned_route_points: planned,
    route_points: planned.slice(0, 3),
    route_color: routeColors[driverIndex % routeColors.length],
  };
};

const liveRoutes = () => demoDrivers.map((driver, index) => {
  const children = demoChildren.filter((child) => child.driver_id === driver.id).map(decorateChild);
  const route = makeRoutePoints(index);
  return {
    id: `demo-live-route-${index + 1}`,
    route_name: `Route ${String(index + 1).padStart(2, '0')}`,
    driver,
    vehicle: demoVehicles[index],
    children,
    location: driver.on_duty ? liveLocationFor(index) : null,
    planned_route_points: route,
    route_points: route.slice(0, 3),
    route_color: routeColors[index % routeColors.length],
  };
});

const announcements = () => [
  {
    id: 'demo-announcement-1',
    title: 'VIP route demo is active',
    body: 'This preview shows assigned drivers, vehicles, maps, and safety updates with sample data.',
    category: 'general',
    created_at: nowIso(),
  },
];

const notifications = () => [
  {
    id: 'demo-notification-1',
    type: 'picked_up',
    title: 'Picked up',
    body: 'Mia has been picked up by Alexander.',
    read: false,
    created_at: nowIso(),
  },
  {
    id: 'demo-notification-2',
    type: 'delay',
    title: 'Traffic update',
    body: 'Dedicated driver is following the assigned route with light traffic.',
    read: false,
    created_at: nowIso(),
  },
];

const activityEvents = () => demoChildren.slice(0, 8).map((child, index) => ({
  id: `demo-activity-${index + 1}`,
  type: child.latest_event.event_type,
  title: child.latest_event.event_type.replace(/_/g, ' ').toUpperCase(),
  detail: child.latest_event.message,
  child_name: child.name,
  driver_name: demoDrivers[Math.min(index, 9)].name,
  severity: child.latest_event.event_type === 'no_show' ? 'critical' : child.latest_event.event_type === 'picked_up' ? 'success' : 'info',
  created_at: nowIso(),
}));

export function demoTokenFor(role: DemoRole) {
  return `${DEMO_TOKEN_PREFIX}${role}`;
}

export function isDemoToken(token?: string) {
  return !!token && token.startsWith(DEMO_TOKEN_PREFIX);
}

export function demoRoleFromToken(token?: string): DemoRole {
  const role = token?.replace(DEMO_TOKEN_PREFIX, '') as DemoRole;
  return ['parent', 'driver', 'child', 'admin'].includes(role) ? role : 'parent';
}

export function getDemoUser(role: DemoRole) {
  return demoUsers[role];
}

export function demoRoleForCredentials(email: string, password: string): DemoRole | null {
  if (password !== DEMO_PASSWORD) return null;
  const normalized = email.trim().toLowerCase();
  const found = (Object.keys(demoUsers) as DemoRole[]).find((role) => demoUsers[role].email === normalized);
  return found || null;
}

export function demoApiResponse(path: string, opts: { method?: string; body?: any }, token: string): any {
  const role = demoRoleFromToken(token);
  const method = opts.method || 'GET';
  const ok = { ok: true, demo: true };

  if (path === '/auth/me') return getDemoUser(role);
  if (path === '/push/register' || path === '/push/unregister') return ok;
  if (path === '/auth/notif-prefs' || path === '/auth/photo') return ok;
  if (path === '/auth/delete-account') return ok;

  if (path === '/parent/dashboard') return { children: parentChildren(), announcements: announcements() };
  if (path === '/parent/children' && method === 'POST') return { id: 'demo-new-child', ...(opts.body || {}) };
  if (path === '/parent/children') return parentChildren();
  if (path.startsWith('/parent/track/')) return trackForChild(path.split('/').pop() || 'demo-child-1');
  if (path.startsWith('/parent/child/')) return decorateChild(demoChildren.find((child) => child.id === path.split('/').pop()) || demoChildren[0]);
  if (path === '/parent/schedule-requests') return [
    { id: 'demo-schedule-1', child_id: 'demo-child-1', request_type: 'temporary_change', when: 'Friday 3:30 PM', status: 'pending', notes: 'Sample concierge request.' },
  ];
  if (path === '/parent/schedule-request') return ok;

  if (path === '/child/track') return trackForChild(demoUsers.child.child_id);
  if (path === '/child/ready') return { ok: true, message: 'Demo driver notified that you are ready.' };

  if (path === '/driver/today') return driverChildren();
  if (path === '/driver/checkin') return { ok: true, event: { id: `demo-event-${Date.now()}`, ...(opts.body || {}), created_at: nowIso() } };
  if (path === '/driver/location' || path === '/driver/route/start' || path === '/driver/route/plan' || path === '/driver/route/end') return ok;
  if (path === '/driver/emergency') return { ok: true, admin_phone: '305-555-0000' };

  if (path === '/chat/conversations') return [
    {
      user: role === 'driver' ? demoParents[0] : demoDrivers[0],
      child_name: demoChildren[0].name,
      last_message: 'Demo conversation is ready.',
    },
  ];
  if (path.startsWith('/chat/messages/')) return [
    { id: 'demo-message-1', from_user_id: demoDrivers[0].id, to_user_id: demoParents[0].id, text: 'Good morning, I am on the assigned route.', created_at: nowIso() },
    { id: 'demo-message-2', from_user_id: demoParents[0].id, to_user_id: demoDrivers[0].id, text: 'Thank you, I can see the route.', created_at: nowIso() },
  ];
  if (path === '/chat/send') return { ok: true, id: `demo-message-${Date.now()}` };

  if (path === '/notifications') return notifications();
  if (path.startsWith('/notifications/') && path.endsWith('/read')) return ok;
  if (path === '/announcements') return announcements();

  if (path.startsWith('/admin/users')) {
    const roleParam = path.includes('?role=') ? decodeURIComponent(path.split('?role=')[1]) : '';
    const users = publicUsers();
    return roleParam ? users.filter((user: any) => user.role === roleParam) : users;
  }
  if (path === '/admin/children') return demoChildren.map(decorateChild);
  if (path === '/admin/vehicles') return demoVehicles;
  if (path === '/admin/routes') return liveRoutes().map((route) => ({
    id: route.id,
    name: route.route_name,
    driver_id: route.driver.id,
    color: route.route_color,
    stops: route.children.map((child: any) => child.home_address),
  }));
  if (path === '/admin/live-routes') return liveRoutes();
  if (path === '/admin/compliance-alerts') return [
    { kind: 'driver', field: 'license_expiry', days_left: 28, expired: false, item: demoDrivers[0] },
    { kind: 'vehicle', field: 'registration_expiry', days_left: 42, expired: false, item: demoVehicles[0] },
  ];
  if (path === '/admin/operations/today') {
    return {
      date: new Date().toLocaleDateString(),
      counts: { picked_up: 4, pending: 7, absent: 1 },
      children: demoChildren.map((child, index) => ({
        child,
        driver: demoDrivers[Math.min(index, 9)],
        status: index % 6 === 0 ? 'picked_up' : index === 5 ? 'absent' : 'pending',
        latest_event: child.latest_event,
      })),
    };
  }
  if (path.startsWith('/admin/activity')) return activityEvents();
  if (path === '/admin/schedule-requests') return [
    { id: 'demo-admin-schedule-1', child: demoChildren[0], parent: demoParents[0], request_type: 'temporary_change', when: 'Friday 3:30 PM', status: 'pending' },
  ];
  if (path === '/admin/announcement') return { id: `demo-announcement-${Date.now()}`, ...(opts.body || {}), created_at: nowIso() };
  if (path.startsWith('/admin/')) return method === 'GET' ? [] : ok;

  return method === 'GET' ? [] : ok;
}
