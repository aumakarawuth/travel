-- =====================================================================
-- TripSync AI — initial schema (Phase 1 creates the full data model so
-- later phases add code, not risky table rewrites).
-- Every trip-scoped table carries trip_id and is protected by RLS that
-- checks membership through SECURITY DEFINER helpers (no cross-trip leaks).
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.trip_role as enum ('owner', 'editor', 'member');
create type public.travel_mode as enum ('car', 'motorbike', 'public_transit', 'walking', 'bicycle', 'mixed');
create type public.submission_status as enum ('pending', 'analyzing', 'needs_review', 'completed', 'failed');
create type public.source_platform as enum (
  'tiktok', 'facebook', 'instagram', 'youtube', 'google_maps', 'google_search',
  'google_hotels', 'booking', 'agoda', 'review_site', 'website', 'manual'
);
create type public.place_category as enum (
  'attraction', 'cafe', 'restaurant', 'accommodation', 'activity', 'nature',
  'shopping', 'nightlife', 'viewpoint', 'transportation', 'other'
);
create type public.place_status as enum ('proposed', 'shortlisted', 'selected', 'rejected', 'scheduled');
create type public.vote_value as enum ('want', 'maybe', 'not_interested');
create type public.place_priority as enum ('must_visit', 'high', 'normal', 'optional');
create type public.hotel_status as enum ('proposed', 'confirmed');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'dead');

-- ---------------------------------------------------------------------
-- Utility: updated_at trigger
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text check (avatar_url is null or avatar_url ~ '^https://'),
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  locale text not null default 'th' check (locale in ('th', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile for every new auth user, with a deterministic palette colour.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  palette text[] := array['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#6366f1','#a855f7','#ec4899','#64748b'];
  idx int := (abs(hashtext(new.id::text)) % array_length(palette, 1)) + 1;
begin
  insert into public.profiles (id, display_name, avatar_url, color)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1), 'Traveler'), 60),
    case when new.raw_user_meta_data->>'avatar_url' like 'https://%' then new.raw_user_meta_data->>'avatar_url' end,
    palette[idx]
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 2000),
  start_location_name text check (char_length(start_location_name) <= 200),
  start_lat double precision check (start_lat between -90 and 90),
  start_lng double precision check (start_lng between -180 and 180),
  end_location_name text check (char_length(end_location_name) <= 200),
  end_lat double precision check (end_lat between -90 and 90),
  end_lng double precision check (end_lng between -180 and 180),
  start_date date not null,
  end_date date not null,
  day_count int generated always as ((end_date - start_date) + 1) stored,
  budget_total numeric(12, 2) check (budget_total >= 0),
  currency char(3) not null default 'THB',
  expected_member_count int not null default 1 check (expected_member_count between 1 and 100),
  travel_mode public.travel_mode not null default 'car',
  daily_start_time time not null default '09:00',
  daily_end_time time not null default '20:00',
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  invite_enabled boolean not null default true,
  created_by uuid not null references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_dates_valid check (end_date >= start_date and end_date - start_date <= 60),
  constraint trips_daily_time_valid check (daily_end_time > daily_start_time)
);
create trigger trips_updated before update on public.trips
  for each row execute function public.set_updated_at();
create index trips_created_by_idx on public.trips(created_by);

-- ---------------------------------------------------------------------
-- trip_members
-- ---------------------------------------------------------------------
create table public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.trip_role not null default 'member',
  -- per-trip colour override (null = use profile colour)
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members(user_id);
-- exactly one owner per trip
create unique index trip_members_one_owner on public.trip_members(trip_id) where role = 'owner';

-- ---------------------------------------------------------------------
-- Permission helpers (SECURITY DEFINER avoids RLS recursion on trip_members)
-- ---------------------------------------------------------------------
create or replace function public.trip_role_of(p_trip uuid, p_user uuid default auth.uid())
returns public.trip_role language sql stable security definer set search_path = public as $$
  select role from public.trip_members where trip_id = p_trip and user_id = p_user
$$;

create or replace function public.is_trip_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members where trip_id = p_trip and user_id = auth.uid())
$$;

create or replace function public.can_edit_trip(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip and user_id = auth.uid() and role in ('owner', 'editor')
  )
$$;

create or replace function public.is_trip_owner(p_trip uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip and user_id = auth.uid() and role = 'owner'
  )
$$;

create or replace function public.shares_trip_with(p_other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members a
    join public.trip_members b on a.trip_id = b.trip_id
    where a.user_id = auth.uid() and b.user_id = p_other
  )
$$;

-- ---------------------------------------------------------------------
-- trip_invitations (email / single-use links; the trip-wide code lives on trips)
-- ---------------------------------------------------------------------
create table public.trip_invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  email citext,
  role public.trip_role not null default 'member' check (role <> 'owner'),
  max_uses int check (max_uses is null or max_uses > 0),
  use_count int not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index trip_invitations_trip_idx on public.trip_invitations(trip_id);

-- ---------------------------------------------------------------------
-- link_submissions
-- ---------------------------------------------------------------------
create table public.link_submissions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  original_url text not null check (char_length(original_url) <= 2048),
  normalized_url text not null check (char_length(normalized_url) <= 2048),
  resolved_url text check (char_length(resolved_url) <= 2048),
  platform public.source_platform not null default 'website',
  share_channel text check (share_channel in ('paste', 'share_target', 'manual')),
  user_note text check (char_length(user_note) <= 2000),
  status public.submission_status not null default 'pending',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- the same user posting the same URL twice in one trip is idempotent
  constraint link_submissions_dedupe unique (trip_id, submitted_by, normalized_url)
);
create trigger link_submissions_updated before update on public.link_submissions
  for each row execute function public.set_updated_at();
create index link_submissions_trip_status_idx on public.link_submissions(trip_id, status);
create index link_submissions_trip_url_idx on public.link_submissions(trip_id, normalized_url);

-- ---------------------------------------------------------------------
-- places (one row per unique place per trip)
-- ---------------------------------------------------------------------
create table public.places (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  name_normalized text not null,
  category public.place_category not null default 'other',
  place_type text,
  description text check (char_length(description) <= 4000),
  address text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  google_place_id text,
  location_verified boolean not null default false, -- only verified places get a confirmed pin
  estimated_price numeric(12, 2) check (estimated_price >= 0),
  currency char(3),
  price_source text,
  price_checked_at timestamptz,
  opening_hours jsonb,
  opening_hours_source text,
  opening_hours_checked_at timestamptz,
  visit_duration_minutes int check (visit_duration_minutes between 5 and 1440),
  images jsonb not null default '[]'::jsonb,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  needs_review boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint places_price_has_source check (estimated_price is null or price_source is not null),
  constraint places_latlng_pair check ((lat is null) = (lng is null))
);
create trigger places_updated before update on public.places
  for each row execute function public.set_updated_at();
create unique index places_trip_google_id on public.places(trip_id, google_place_id) where google_place_id is not null;
create index places_trip_idx on public.places(trip_id, category);
create index places_trip_name_idx on public.places(trip_id, name_normalized);

-- ---------------------------------------------------------------------
-- place_sources (evidence used for a place: url, OG data, AI output)
-- ---------------------------------------------------------------------
create table public.place_sources (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  submission_id uuid references public.link_submissions(id) on delete set null,
  source_type text not null check (source_type in ('open_graph', 'oembed', 'official_api', 'google_places', 'ai', 'user')),
  url text,
  evidence jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);
create index place_sources_place_idx on public.place_sources(place_id);
create index place_sources_trip_idx on public.place_sources(trip_id);

-- ---------------------------------------------------------------------
-- place_submissions (many members can submit the same place)
-- ---------------------------------------------------------------------
create table public.place_submissions (
  place_id uuid not null references public.places(id) on delete cascade,
  submission_id uuid not null references public.link_submissions(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (place_id, submission_id)
);
create index place_submissions_trip_user_idx on public.place_submissions(trip_id, submitted_by);

-- ---------------------------------------------------------------------
-- votes / comments
-- ---------------------------------------------------------------------
create table public.place_votes (
  trip_id uuid not null references public.trips(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote public.vote_value not null,
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id)
);
create index place_votes_trip_idx on public.place_votes(trip_id);

create table public.place_comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index place_comments_place_idx on public.place_comments(place_id, created_at);

-- ---------------------------------------------------------------------
-- trip_place_selections (planning state; never deletes the place)
-- ---------------------------------------------------------------------
create table public.trip_place_selections (
  trip_id uuid not null references public.trips(id) on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  status public.place_status not null default 'proposed',
  priority public.place_priority not null default 'normal',
  fixed_start_at timestamptz,
  fixed_end_at timestamptz,
  preferred_day date,
  note text check (char_length(note) <= 2000),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (trip_id, place_id),
  constraint selection_fixed_time_valid check (fixed_end_at is null or fixed_start_at is null or fixed_end_at > fixed_start_at)
);
create trigger trip_place_selections_updated before update on public.trip_place_selections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- accommodations
-- ---------------------------------------------------------------------
create table public.accommodations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  place_id uuid references public.places(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  check_in_date date not null,
  check_out_date date not null,
  check_in_time time default '14:00',
  check_out_time time default '12:00',
  price_per_night numeric(12, 2) check (price_per_night >= 0),
  currency char(3) not null default 'THB',
  price_source text,
  room_count int not null default 1 check (room_count between 1 and 50),
  guest_user_ids uuid[] not null default '{}',
  status public.hotel_status not null default 'proposed',
  booking_reference text check (char_length(booking_reference) <= 120),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accommodations_dates_valid check (check_out_date > check_in_date)
);
create trigger accommodations_updated before update on public.accommodations
  for each row execute function public.set_updated_at();
create index accommodations_trip_idx on public.accommodations(trip_id, check_in_date);

-- ---------------------------------------------------------------------
-- itinerary (versioned — re-optimising creates a new version)
-- ---------------------------------------------------------------------
create table public.itinerary_versions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  version int not null,
  label text,
  is_active boolean not null default false,
  algorithm text not null default 'greedy_nn_2opt',
  routing_source text not null default 'estimate' check (routing_source in ('google_routes', 'estimate')),
  input_snapshot jsonb not null default '{}'::jsonb,
  explanation text,
  unscheduled jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (trip_id, version)
);
create unique index itinerary_versions_one_active on public.itinerary_versions(trip_id) where is_active;

create table public.itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  version_id uuid not null references public.itinerary_versions(id) on delete cascade,
  day_index int not null check (day_index >= 0),
  date date not null,
  start_time time not null,
  end_time time not null,
  start_accommodation_id uuid references public.accommodations(id) on delete set null,
  end_accommodation_id uuid references public.accommodations(id) on delete set null,
  locked boolean not null default false,
  is_rain_plan boolean not null default false,
  summary_th text,
  unique (version_id, day_index, is_rain_plan)
);
create index itinerary_days_trip_idx on public.itinerary_days(trip_id);

create table public.itinerary_stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  day_id uuid not null references public.itinerary_days(id) on delete cascade,
  place_id uuid references public.places(id) on delete set null,
  position int not null check (position >= 0),
  stop_kind text not null default 'place' check (stop_kind in ('place', 'meal', 'rest', 'hotel', 'custom')),
  label text,
  arrive_at timestamptz,
  depart_at timestamptz,
  travel_minutes_from_prev int,
  travel_meters_from_prev int,
  travel_is_estimate boolean not null default true,
  visit_minutes int,
  estimated_cost numeric(12, 2),
  locked boolean not null default false,
  note text,
  unique (day_id, position) deferrable initially deferred
);
create index itinerary_stops_trip_idx on public.itinerary_stops(trip_id);

-- ---------------------------------------------------------------------
-- route_cache (server-only, keyed by hash of origin/dest/mode)
-- ---------------------------------------------------------------------
create table public.route_cache (
  cache_key text primary key,
  travel_mode text not null,
  distance_meters int,
  duration_seconds int,
  polyline text,
  provider text not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index route_cache_expires_idx on public.route_cache(expires_at);

-- ---------------------------------------------------------------------
-- ai_extraction_jobs (idempotent queue: one live job per submission)
-- ---------------------------------------------------------------------
create table public.ai_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  submission_id uuid not null references public.link_submissions(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  idempotency_key text not null unique,
  status public.job_status not null default 'queued',
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  provider text,
  model text,
  input_tokens int,
  output_tokens int,
  result jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ai_extraction_jobs_updated before update on public.ai_extraction_jobs
  for each row execute function public.set_updated_at();
create index ai_jobs_queue_idx on public.ai_extraction_jobs(status, run_after) where status in ('queued', 'failed');
create index ai_jobs_trip_idx on public.ai_extraction_jobs(trip_id, created_at);
create index ai_jobs_user_idx on public.ai_extraction_jobs(requested_by, created_at);

-- ---------------------------------------------------------------------
-- audit_logs (append-only)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  trip_id uuid references public.trips(id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_trip_idx on public.audit_logs(trip_id, created_at desc);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_trip uuid;
  v_id text;
begin
  if tg_table_name = 'trips' then
    v_trip := coalesce(new.id, old.id);
  else
    v_trip := coalesce((to_jsonb(new)->>'trip_id')::uuid, (to_jsonb(old)->>'trip_id')::uuid);
  end if;
  v_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id',
                   to_jsonb(new)->>'place_id', to_jsonb(old)->>'place_id',
                   to_jsonb(new)->>'user_id', to_jsonb(old)->>'user_id');
  -- a cascading trip delete removes the trip row first; skip dangling FK
  if tg_op = 'DELETE' and tg_table_name <> 'trips'
     and not exists (select 1 from public.trips where id = v_trip) then
    return old;
  end if;
  insert into public.audit_logs (trip_id, actor_id, action, entity, entity_id, before, after)
  values (
    case when tg_op = 'DELETE' and tg_table_name = 'trips' then null else v_trip end,
    auth.uid(), lower(tg_op), tg_table_name, v_id,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_trips after insert or update or delete on public.trips
  for each row execute function public.audit_row();
create trigger audit_trip_members after insert or update or delete on public.trip_members
  for each row execute function public.audit_row();
create trigger audit_selections after insert or update or delete on public.trip_place_selections
  for each row execute function public.audit_row();
create trigger audit_accommodations after insert or update or delete on public.accommodations
  for each row execute function public.audit_row();
create trigger audit_itinerary_versions after insert or update on public.itinerary_versions
  for each row execute function public.audit_row();
create trigger audit_places after update or delete on public.places
  for each row execute function public.audit_row();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invitations enable row level security;
alter table public.link_submissions enable row level security;
alter table public.places enable row level security;
alter table public.place_sources enable row level security;
alter table public.place_submissions enable row level security;
alter table public.place_votes enable row level security;
alter table public.place_comments enable row level security;
alter table public.trip_place_selections enable row level security;
alter table public.accommodations enable row level security;
alter table public.itinerary_versions enable row level security;
alter table public.itinerary_days enable row level security;
alter table public.itinerary_stops enable row level security;
alter table public.route_cache enable row level security;      -- no policies: service role only
alter table public.ai_extraction_jobs enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: see yourself and people you share a trip with
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_trip_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- trips: members read, owner/editor update, owner deletes. Inserts go through create_trip().
create policy trips_select on public.trips for select to authenticated
  using (public.is_trip_member(id));
create policy trips_update on public.trips for update to authenticated
  using (public.can_edit_trip(id)) with check (public.can_edit_trip(id));
create policy trips_delete on public.trips for delete to authenticated
  using (public.is_trip_owner(id));

-- trip_members: members read roster; role changes via RPC; a member may leave
create policy trip_members_select on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));
create policy trip_members_leave on public.trip_members for delete to authenticated
  using (user_id = auth.uid() and role <> 'owner');
create policy trip_members_update_self_color on public.trip_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and role = public.trip_role_of(trip_id));

-- invitations: owner/editor manage
create policy invitations_all on public.trip_invitations for all to authenticated
  using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id) and created_by = auth.uid());

-- link_submissions: members read; members insert as themselves; owner of row or editor updates
create policy submissions_select on public.link_submissions for select to authenticated
  using (public.is_trip_member(trip_id));
create policy submissions_insert on public.link_submissions for insert to authenticated
  with check (public.is_trip_member(trip_id) and submitted_by = auth.uid());
create policy submissions_update on public.link_submissions for update to authenticated
  using (public.is_trip_member(trip_id) and (submitted_by = auth.uid() or public.can_edit_trip(trip_id)))
  with check (public.is_trip_member(trip_id));
create policy submissions_delete on public.link_submissions for delete to authenticated
  using (submitted_by = auth.uid() or public.can_edit_trip(trip_id));

-- places + sources + submissions: members read/insert/update (review flow); editors delete
create policy places_select on public.places for select to authenticated using (public.is_trip_member(trip_id));
create policy places_insert on public.places for insert to authenticated
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());
create policy places_update on public.places for update to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy places_delete on public.places for delete to authenticated using (public.can_edit_trip(trip_id));

create policy place_sources_select on public.place_sources for select to authenticated using (public.is_trip_member(trip_id));
create policy place_sources_insert on public.place_sources for insert to authenticated
  with check (public.is_trip_member(trip_id)
              and exists (select 1 from public.places p where p.id = place_id and p.trip_id = place_sources.trip_id));

create policy place_submissions_select on public.place_submissions for select to authenticated using (public.is_trip_member(trip_id));
create policy place_submissions_insert on public.place_submissions for insert to authenticated
  with check (public.is_trip_member(trip_id)
              and exists (select 1 from public.places p where p.id = place_id and p.trip_id = place_submissions.trip_id)
              and exists (select 1 from public.link_submissions s where s.id = submission_id and s.trip_id = place_submissions.trip_id
                          and s.submitted_by = place_submissions.submitted_by));

-- votes: read all in trip; write only own vote
create policy votes_select on public.place_votes for select to authenticated using (public.is_trip_member(trip_id));
create policy votes_write on public.place_votes for all to authenticated
  using (user_id = auth.uid() and public.is_trip_member(trip_id))
  with check (user_id = auth.uid() and public.is_trip_member(trip_id)
              and exists (select 1 from public.places p where p.id = place_id and p.trip_id = place_votes.trip_id));

-- comments: read all; write own; soft-delete via update
create policy comments_select on public.place_comments for select to authenticated using (public.is_trip_member(trip_id));
create policy comments_insert on public.place_comments for insert to authenticated
  with check (user_id = auth.uid() and public.is_trip_member(trip_id)
              and exists (select 1 from public.places p where p.id = place_id and p.trip_id = place_comments.trip_id));
create policy comments_update on public.place_comments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- selections: members read; only owner/editor decide
create policy selections_select on public.trip_place_selections for select to authenticated using (public.is_trip_member(trip_id));
create policy selections_write on public.trip_place_selections for all to authenticated
  using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id)
              and exists (select 1 from public.places p where p.id = place_id and p.trip_id = trip_place_selections.trip_id));

-- accommodations: members read & propose; owner/editor confirm/delete
create policy acc_select on public.accommodations for select to authenticated using (public.is_trip_member(trip_id));
create policy acc_insert on public.accommodations for insert to authenticated
  with check (public.is_trip_member(trip_id) and created_by = auth.uid()
              and (status = 'proposed' or public.can_edit_trip(trip_id)));
create policy acc_update on public.accommodations for update to authenticated
  using (public.can_edit_trip(trip_id) or (created_by = auth.uid() and status = 'proposed'))
  with check (public.can_edit_trip(trip_id) or status = 'proposed');
create policy acc_delete on public.accommodations for delete to authenticated
  using (public.can_edit_trip(trip_id) or (created_by = auth.uid() and status = 'proposed'));

-- itinerary: members read; owner/editor write
create policy itv_select on public.itinerary_versions for select to authenticated using (public.is_trip_member(trip_id));
create policy itv_write on public.itinerary_versions for all to authenticated
  using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy itd_select on public.itinerary_days for select to authenticated using (public.is_trip_member(trip_id));
create policy itd_write on public.itinerary_days for all to authenticated
  using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id)
              and exists (select 1 from public.itinerary_versions v where v.id = version_id and v.trip_id = itinerary_days.trip_id));
create policy its_select on public.itinerary_stops for select to authenticated using (public.is_trip_member(trip_id));
create policy its_write on public.itinerary_stops for all to authenticated
  using (public.can_edit_trip(trip_id))
  with check (public.can_edit_trip(trip_id)
              and exists (select 1 from public.itinerary_days d where d.id = day_id and d.trip_id = itinerary_stops.trip_id));

-- jobs: members can see status of their trip's jobs; writes are service-role only
create policy jobs_select on public.ai_extraction_jobs for select to authenticated using (public.is_trip_member(trip_id));

-- audit: owner/editor can read their trip's log; writes only via trigger
create policy audit_select on public.audit_logs for select to authenticated using (public.can_edit_trip(trip_id));

-- =====================================================================
-- RPCs (atomic, permission-checked operations)
-- =====================================================================

-- Create a trip and its owner membership in one transaction.
create or replace function public.create_trip(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  -- simple abuse guard: at most 20 trips created per user per day
  if (select count(*) from public.trips where created_by = v_uid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into public.trips (
    name, description, start_location_name, start_lat, start_lng, end_location_name, end_lat, end_lng,
    start_date, end_date, budget_total, currency, expected_member_count, travel_mode,
    daily_start_time, daily_end_time, created_by
  ) values (
    p->>'name', nullif(p->>'description', ''),
    nullif(p->>'start_location_name', ''), (p->>'start_lat')::float8, (p->>'start_lng')::float8,
    nullif(p->>'end_location_name', ''), (p->>'end_lat')::float8, (p->>'end_lng')::float8,
    (p->>'start_date')::date, (p->>'end_date')::date,
    (p->>'budget_total')::numeric, coalesce(nullif(p->>'currency', ''), 'THB'),
    coalesce((p->>'expected_member_count')::int, 1),
    coalesce((p->>'travel_mode')::public.travel_mode, 'car'),
    coalesce((p->>'daily_start_time')::time, '09:00'), coalesce((p->>'daily_end_time')::time, '20:00'),
    v_uid
  ) returning id into v_id;
  insert into public.trip_members (trip_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
end $$;

-- Preview a trip by invite code (only minimal, non-sensitive fields).
create or replace function public.preview_invite(p_code text)
returns table (trip_id uuid, name text, start_date date, end_date date, member_count bigint, already_member boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.start_date, t.end_date,
         (select count(*) from public.trip_members m where m.trip_id = t.id),
         exists (select 1 from public.trip_members m where m.trip_id = t.id and m.user_id = auth.uid())
  from public.trips t
  where t.invite_code = upper(trim(p_code)) and t.invite_enabled and t.archived_at is null
    and auth.uid() is not null
$$;

-- Join via trip-wide invite code or a single invitation token.
create or replace function public.join_trip(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_trip uuid;
  v_role public.trip_role := 'member';
  v_inv public.trip_invitations;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select id into v_trip from public.trips
   where invite_code = upper(trim(p_code)) and invite_enabled and archived_at is null;
  if v_trip is null then
    select * into v_inv from public.trip_invitations
     where token = trim(p_code) and revoked_at is null
       and (expires_at is null or expires_at > now())
       and (max_uses is null or use_count < max_uses)
     for update;
    if v_inv.id is null then raise exception 'invalid_invite' using errcode = 'P0002'; end if;
    if v_inv.email is not null and v_inv.email <> (select email from auth.users where id = v_uid)::citext then
      raise exception 'invite_email_mismatch' using errcode = 'P0003';
    end if;
    v_trip := v_inv.trip_id;
    v_role := v_inv.role;
  end if;
  if (select count(*) from public.trip_members where trip_id = v_trip) >= 100 then
    raise exception 'trip_full' using errcode = 'P0004';
  end if;
  insert into public.trip_members (trip_id, user_id, role) values (v_trip, v_uid, v_role)
  on conflict (trip_id, user_id) do nothing;
  if found and v_inv.id is not null then
    update public.trip_invitations set use_count = use_count + 1 where id = v_inv.id;
  end if;
  return v_trip;
end $$;

-- Change a member's role. Owner can set editor/member; ownership transfer is explicit.
create or replace function public.set_member_role(p_trip uuid, p_user uuid, p_role public.trip_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_owner(p_trip) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot_change_own_role' using errcode = 'P0005'; end if;
  if not exists (select 1 from public.trip_members where trip_id = p_trip and user_id = p_user) then
    raise exception 'not_a_member' using errcode = 'P0006';
  end if;
  if p_role = 'owner' then
    -- transfer ownership: demote current owner to editor first (one-owner unique index)
    update public.trip_members set role = 'editor' where trip_id = p_trip and user_id = auth.uid();
  end if;
  update public.trip_members set role = p_role where trip_id = p_trip and user_id = p_user;
end $$;

-- Remove a member. Owner removes anyone except self; editor removes plain members.
create or replace function public.remove_member(p_trip uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor public.trip_role := public.trip_role_of(p_trip);
  v_target public.trip_role := public.trip_role_of(p_trip, p_user);
begin
  if v_target is null then raise exception 'not_a_member' using errcode = 'P0006'; end if;
  if v_target = 'owner' then raise exception 'cannot_remove_owner' using errcode = 'P0007'; end if;
  if not (v_actor = 'owner' or (v_actor = 'editor' and v_target = 'member')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.trip_members where trip_id = p_trip and user_id = p_user;
end $$;

-- Rotate the trip-wide invite code.
create or replace function public.regenerate_invite_code(p_trip uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.can_edit_trip(p_trip) then raise exception 'forbidden' using errcode = '42501'; end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  update public.trips set invite_code = v_code where id = p_trip;
  return v_code;
end $$;

revoke all on function public.create_trip(jsonb) from public, anon;
revoke all on function public.join_trip(text) from public, anon;
revoke all on function public.preview_invite(text) from public, anon;
revoke all on function public.set_member_role(uuid, uuid, public.trip_role) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
revoke all on function public.regenerate_invite_code(uuid) from public, anon;
grant execute on function public.create_trip(jsonb), public.join_trip(text), public.preview_invite(text),
  public.set_member_role(uuid, uuid, public.trip_role), public.remove_member(uuid, uuid),
  public.regenerate_invite_code(uuid) to authenticated;

-- invite_code must only be visible to owner/editor. Column-level revoke does not
-- override a table-level grant, so re-grant SELECT on every column except invite_code.
create or replace function public.get_invite_code(p_trip uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when public.can_edit_trip(p_trip) then invite_code end from public.trips where id = p_trip
$$;
revoke all on function public.get_invite_code(uuid) from public, anon;
grant execute on function public.get_invite_code(uuid) to authenticated;

revoke select on public.trips from authenticated, anon;
grant select (
  id, name, description, start_location_name, start_lat, start_lng, end_location_name, end_lat, end_lng,
  start_date, end_date, day_count, budget_total, currency, expected_member_count, travel_mode,
  daily_start_time, daily_end_time, invite_enabled, created_by, archived_at, created_at, updated_at
) on public.trips to authenticated;
-- clients never insert directly (create_trip RPC) and must not set invite_code/created_by
revoke insert, update on public.trips from authenticated, anon;
grant update (
  name, description, start_location_name, start_lat, start_lng, end_location_name, end_lat, end_lng,
  start_date, end_date, budget_total, currency, expected_member_count, travel_mode,
  daily_start_time, daily_end_time, invite_enabled, archived_at
) on public.trips to authenticated;
-- members may only change their own colour, never their role
revoke update on public.trip_members from authenticated, anon;
grant update (color) on public.trip_members to authenticated;

-- =====================================================================
-- Realtime
-- =====================================================================
alter publication supabase_realtime add table
  public.trips, public.trip_members, public.link_submissions, public.places,
  public.place_votes, public.place_comments, public.trip_place_selections,
  public.accommodations, public.itinerary_versions, public.ai_extraction_jobs;
