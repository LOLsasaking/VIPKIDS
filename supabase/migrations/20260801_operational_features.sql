-- Operational tables and privacy controls required by the mobile application.

alter table public.profiles
  add column if not exists email text unique,
  add column if not exists on_duty boolean not null default false,
  add column if not exists active_route_session_id uuid references public.route_sessions(id) on delete set null;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare requested_role public.user_role;
begin
  requested_role := case
    when new.raw_user_meta_data->>'role' in ('parent', 'driver', 'child')
      then (new.raw_user_meta_data->>'role')::public.user_role
    else 'parent'::public.user_role
  end;
  insert into public.profiles(id, email, role, status, full_name, phone, address)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    requested_role,
    'pending',
    left(coalesce(nullif(new.raw_user_meta_data->>'name', ''), 'Pending account'), 100),
    nullif(new.raw_user_meta_data->>'phone', ''),
    case when requested_role = 'parent' then nullif(new.raw_user_meta_data->>'address', '') else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

alter table public.children
  add column if not exists contact_phone text,
  add column if not exists assignment_status text not null default 'pending_admin_assignment';

alter table public.vehicles
  add column if not exists seats integer check (seats between 1 and 20),
  add column if not exists registration_date date;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 240),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.schedule_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  request_type text not null,
  requested_when text not null check (char_length(requested_when) between 2 and 120),
  pickup_address text check (char_length(pickup_address) <= 300),
  dropoff_address text check (char_length(dropoff_address) <= 300),
  notes text check (char_length(notes) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 1000),
  category text not null default 'general',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  subject_type text,
  subject_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  attempts integer not null default 0,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table if not exists public.push_tickets (
  ticket_id text primary key,
  push_token_id uuid not null references public.push_tokens(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  checked_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists messages_participants_time_idx on public.messages(from_user_id, to_user_id, created_at desc);
create index if not exists notifications_user_time_idx on public.notifications(user_id, created_at desc);
create index if not exists schedule_requests_parent_time_idx on public.schedule_requests(parent_id, created_at desc);
create index if not exists audit_events_time_idx on public.audit_events(created_at desc);
create index if not exists notification_outbox_pending_idx on public.notification_outbox(delivered_at, attempts) where delivered_at is null;
create index if not exists push_tickets_unchecked_idx on public.push_tickets(created_at) where checked_at is null;

alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.schedule_requests enable row level security;
alter table public.announcements enable row level security;
alter table public.audit_events enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.push_tickets enable row level security;

create policy "messages: participant read" on public.messages for select using (from_user_id = auth.uid() or to_user_id = auth.uid() or public.is_admin());
create policy "notifications: recipient read" on public.notifications for select using (user_id = auth.uid() or public.is_admin());
create policy "notifications: recipient marks read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "schedule: parent or admin reads" on public.schedule_requests for select using (parent_id = auth.uid() or public.is_admin());
create policy "announcements: authenticated read" on public.announcements for select to authenticated using (true);
create policy "audit: admin only" on public.audit_events for select using (public.is_admin());

-- Notification records and push delivery must be committed together. Edge
-- Functions call this RPC; clients cannot write directly to the outbox.
create or replace function public.enqueue_notification(
  target_user_id uuid,
  notification_type text,
  notification_title text,
  notification_body text,
  notification_data jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'not authorized';
  end if;
  insert into public.notifications(user_id, type, title, body, data)
  values (target_user_id, notification_type, left(notification_title, 120), left(notification_body, 240), notification_data)
  returning id into new_id;
  insert into public.notification_outbox(notification_id) values (new_id);
  return new_id;
end;
$$;

create or replace function public.purge_expired_transport_data()
returns table(live_locations_deleted bigint, route_points_deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare live_count bigint; route_count bigint;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  delete from public.live_locations where expires_at < now();
  get diagnostics live_count = row_count;
  delete from public.route_points where expires_at < now();
  get diagnostics route_count = row_count;
  return query select live_count, route_count;
end;
$$;

-- Store compliance documents privately. Only trusted server functions create
-- signed URLs after checking the caller's role.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('compliance-documents', 'compliance-documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

-- Realtime contains current operations only, never messages or family records.
alter publication supabase_realtime add table public.notifications;
