-- VIP Kids Transportation production schema.
-- Run in Supabase SQL Editor as the database owner. This migration is designed
-- for private child transportation: direct client queries are limited by RLS,
-- while operational writes run through authenticated Edge Functions.

create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'parent', 'driver', 'child');
create type public.account_status as enum ('pending', 'approved', 'active', 'suspended');
create type public.route_phase as enum ('morning', 'afternoon');
create type public.attendance_status as enum ('on_the_way', 'picked_up', 'absent', 'arrived_school', 'leaving_school', 'arrived_home');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  status public.account_status not null default 'pending',
  full_name text not null check (char_length(full_name) between 2 and 100),
  phone text,
  address text,
  photo_url text,
  notification_preferences jsonb not null default '{"pickup":true,"absence":true,"arrival":true,"emergency":true,"announcements":true}',
  license_number text,
  license_expiry date,
  permit_expiry date,
  guardian_consent_confirmed_at timestamptz,
  guardian_consent_confirmed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references public.profiles(id) on delete set null,
  make text not null,
  model text not null,
  year integer check (year between 1990 and 2100),
  color text not null,
  plate text not null unique,
  image_url text,
  registration_expiry date,
  insurance_expiry date,
  inspection_expiry date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  child_account_id uuid unique references public.profiles(id) on delete set null,
  assigned_driver_id uuid references public.profiles(id) on delete set null,
  assigned_vehicle_id uuid references public.vehicles(id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 100),
  school text not null,
  home_address text not null,
  school_address text not null,
  pickup_time time not null,
  dropoff_time time not null,
  grade text,
  birth_date date,
  round_trip boolean not null default true,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  name text not null,
  phase public.route_phase not null,
  route_color text not null default '#D4AF37',
  ordered_stops jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.route_children (
  route_id uuid not null references public.routes(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  stop_order integer not null check (stop_order >= 1),
  primary key (route_id, child_id),
  unique (route_id, stop_order)
);

create table public.route_sessions (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references public.routes(id) on delete set null,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  phase public.route_phase not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  precheck jsonb not null default '{}'::jsonb,
  planned_geometry jsonb not null default '[]'::jsonb
);

create table public.live_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  route_session_id uuid references public.route_sessions(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  heading real,
  speed real,
  recorded_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 minutes'
);

create table public.route_points (
  id bigint generated always as identity primary key,
  route_session_id uuid not null references public.route_sessions(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  recorded_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete restrict,
  route_session_id uuid references public.route_sessions(id) on delete set null,
  status public.attendance_status not null,
  note text check (char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create table public.emergency_events (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete restrict,
  route_session_id uuid references public.route_sessions(id) on delete set null,
  latitude double precision,
  longitude double precision,
  message text check (char_length(message) <= 1000),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  disabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create index children_parent_idx on public.children(parent_id);
create index children_driver_idx on public.children(assigned_driver_id);
create index routes_driver_idx on public.routes(driver_id);
create index route_sessions_driver_active_idx on public.route_sessions(driver_id) where ended_at is null;
create index route_points_session_time_idx on public.route_points(route_session_id, recorded_at desc);
create index attendance_child_time_idx on public.attendance_events(child_id, created_at desc);

-- Helpers deliberately use `security definer` so policies stay short. They do
-- not expose data; each merely answers whether the current auth user is related
-- to the requested record.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active')
$$;

create or replace function public.is_parent_of(target_child_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.children where id = target_child_id and parent_id = auth.uid())
$$;

create or replace function public.is_driver_of(target_child_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.children where id = target_child_id and assigned_driver_id = auth.uid())
$$;

create or replace function public.is_child_account_for(target_child_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.children where id = target_child_id and child_account_id = auth.uid())
$$;

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.children enable row level security;
alter table public.routes enable row level security;
alter table public.route_children enable row level security;
alter table public.route_sessions enable row level security;
alter table public.live_locations enable row level security;
alter table public.route_points enable row level security;
alter table public.attendance_events enable row level security;
alter table public.emergency_events enable row level security;
alter table public.push_tokens enable row level security;

create policy "profiles: self or admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
-- Profile edits are handled by a trusted function. A broad `update where id =
-- auth.uid()` policy would let a user promote their own status or alter consent.
create policy "vehicles: assigned parties or admin" on public.vehicles for select using (
  public.is_admin() or driver_id = auth.uid() or exists (
    select 1 from public.children c where c.assigned_vehicle_id = vehicles.id and c.parent_id = auth.uid()
  )
);
create policy "children: assigned parties or admin" on public.children for select using (
  public.is_admin() or parent_id = auth.uid() or assigned_driver_id = auth.uid()
);
create policy "children: parent creates own request" on public.children for insert with check (parent_id = auth.uid() and exists(select 1 from public.profiles where id = auth.uid() and role = 'parent'));
create policy "children: parent updates own record" on public.children for update using (parent_id = auth.uid()) with check (parent_id = auth.uid());
create policy "routes: assigned driver or admin" on public.routes for select using (public.is_admin() or driver_id = auth.uid());
create policy "route children: related party or admin" on public.route_children for select using (
  public.is_admin() or public.is_parent_of(child_id) or public.is_driver_of(child_id)
);
-- Route geometry can reveal other families' homes. Parents receive only their
-- allowed route segment from a trusted Edge Function, not raw multi-stop data.
create policy "sessions: driver or admin" on public.route_sessions for select using (
  public.is_admin() or driver_id = auth.uid()
);
create policy "locations: active assigned audience" on public.live_locations for select using (
  public.is_admin() or driver_id = auth.uid() or exists(select 1 from public.children c where c.assigned_driver_id = live_locations.driver_id and (c.parent_id = auth.uid() or c.child_account_id = auth.uid()))
);
create policy "route points: active assigned audience" on public.route_points for select using (
  public.is_admin() or exists(select 1 from public.route_sessions s where s.id = route_points.route_session_id and s.driver_id = auth.uid())
);
create policy "attendance: assigned parties" on public.attendance_events for select using (public.is_admin() or public.is_parent_of(child_id) or public.is_driver_of(child_id) or public.is_child_account_for(child_id));
create policy "emergency: driver/admin" on public.emergency_events for select using (public.is_admin() or driver_id = auth.uid());
create policy "push tokens: owner only" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Child accounts never query the raw child, parent, or route tables. This view
-- exposes only their assigned ride, vehicle, driver contact, and fresh vehicle
-- location.
create or replace view public.child_assigned_ride
with (security_barrier = true) as
select
  c.id as child_id,
  c.full_name as child_name,
  c.school,
  c.pickup_time,
  c.dropoff_time,
  p.id as driver_id,
  p.full_name as driver_name,
  p.phone as driver_phone,
  v.make as vehicle_make,
  v.model as vehicle_model,
  v.color as vehicle_color,
  v.plate as vehicle_plate,
  l.latitude,
  l.longitude,
  l.recorded_at as location_recorded_at
from public.children c
left join public.profiles p on p.id = c.assigned_driver_id
left join public.vehicles v on v.id = c.assigned_vehicle_id
left join public.live_locations l on l.driver_id = c.assigned_driver_id and l.expires_at > now()
where c.child_account_id = auth.uid();

grant select on public.child_assigned_ride to authenticated;

-- Realtime is intentionally limited to the two live operational tables.
alter publication supabase_realtime add table public.live_locations, public.attendance_events;

-- Schedule this in Supabase Cron (or an Edge Function) once daily. These values
-- match the product policy: live location 2 minutes; route points 30 days.
-- delete from public.live_locations where expires_at < now();
-- delete from public.route_points where expires_at < now();
