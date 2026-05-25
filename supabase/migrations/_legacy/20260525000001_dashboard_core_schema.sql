-- ============================================================================
-- 20260525000001_dashboard_core_schema.sql
-- ============================================================================
-- Phase 2.3 · Persistent backend · core dashboard schema.
--
-- Sourced from ARCHITECTURE.md §8 Phase 2.3 (v4.3) and §4 (Department × Role).
-- This migration creates every table the universal dashboard modules need;
-- RLS policies live in the next migration so they can be reviewed separately.
--
-- Apply via:
--   supabase db push                        (remote project)
--   supabase db reset                       (local stack — also runs seed.sql)
--
-- Postgres notes:
--   • Supabase enables pgcrypto by default, so gen_random_uuid() is available
--   • Supabase enables uuid-ossp by default too (use either)
--   • auth.users(id) is the canonical user identity table managed by Supabase
--     Auth — all our user-scoped tables FK into it with ON DELETE CASCADE so
--     a deauthorised user takes their data with them.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- user_profiles · one row per user, includes Super Admin flag
-- ─────────────────────────────────────────────────────────────────────────────

create table public.user_profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text,
  is_super_admin   boolean not null default false,
  ui_preferences   jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.user_profiles is
  'One row per authenticated user. is_super_admin flag is the Sebestian-only universal bypass per ARCHITECTURE §4.';
comment on column public.user_profiles.is_super_admin is
  'Sebestian-only. Bypasses all Department × Role checks. Set manually via service role; never user-settable.';


-- ─────────────────────────────────────────────────────────────────────────────
-- departments · extensible catalog of business functions
-- ─────────────────────────────────────────────────────────────────────────────

create table public.departments (
  department_id   text primary key,
  display_name    text not null,
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.departments is
  'Extensible catalog. Adding a department is a single insert — no schema change, no JWT format change, no CRM code changes (per ARCHITECTURE §4).';


-- ─────────────────────────────────────────────────────────────────────────────
-- user_departments · many-to-many with per-department role
-- ─────────────────────────────────────────────────────────────────────────────

create table public.user_departments (
  user_id         uuid not null references auth.users(id) on delete cascade,
  department_id   text not null references public.departments(department_id),
  role            text not null check (role in ('director', 'manager', 'staff', 'viewer')),
  granted_at      timestamptz not null default now(),
  granted_by      uuid references auth.users(id),
  primary key (user_id, department_id)
);

create index user_departments_user_idx       on public.user_departments(user_id);
create index user_departments_department_idx on public.user_departments(department_id);

comment on table public.user_departments is
  'Department × Role per ARCHITECTURE §4. Users hold many (department, role) pairs. director > manager > staff > viewer.';


-- ─────────────────────────────────────────────────────────────────────────────
-- tasks · personal tasks (mirrored from / to Google Tasks in Phase 2.4)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  text              text not null,
  done              boolean not null default false,
  due_date          date,
  google_task_id    text,
  google_task_list  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index tasks_user_idx     on public.tasks(user_id);
create index tasks_due_idx      on public.tasks(due_date) where due_date is not null;


-- ─────────────────────────────────────────────────────────────────────────────
-- notes · client-encrypted scratchpad (AES-GCM ciphertext only)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.notes (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  encrypted_content   text not null,
  iv                  text not null,
  updated_at          timestamptz not null default now()
);

create index notes_user_idx on public.notes(user_id);

comment on table public.notes is
  'Plaintext NEVER reaches the server. Browser derives AES-GCM key from the session (Phase 2.3 client). Server stores ciphertext + IV only.';


-- ─────────────────────────────────────────────────────────────────────────────
-- quick_launch · per-user or team-shared launch tiles
-- ─────────────────────────────────────────────────────────────────────────────

create table public.quick_launch (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid references auth.users(id) on delete cascade,
  name                text not null,
  url                 text not null,
  color               text,
  department_id       text references public.departments(department_id),
  shared_with_team    boolean not null default false,
  position            integer not null default 0,
  created_at          timestamptz not null default now()
);

create index quick_launch_owner_idx  on public.quick_launch(owner_user_id);
create index quick_launch_shared_idx on public.quick_launch(shared_with_team) where shared_with_team = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- entities · the central Meirverse entity catalog
-- Replaces hardcoded brand enums per ARCHITECTURE §1 lock 6.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.entities (
  entity_id      text primary key,
  display_name   text not null,
  segment        text not null check (segment in (
    'commercial', 'residential', 'support', 'venture-builds'
  )),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create index entities_segment_idx on public.entities(segment) where is_active = true;


-- ─────────────────────────────────────────────────────────────────────────────
-- cluster_entities · declares which entities participate in each CRM cluster
-- Replaces hardcoded "Construction ERP supports H/E/C/A" etc.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.cluster_entities (
  cluster_id   text not null check (cluster_id in ('cluster-1', 'cluster-2', 'cluster-3')),
  entity_id    text not null references public.entities(entity_id),
  primary key (cluster_id, entity_id)
);

create index cluster_entities_cluster_idx on public.cluster_entities(cluster_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- sso_issuances · audit trail of every CRM SSO JWT issued (Phase 2.5)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.sso_issuances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  target_crm  text not null,
  issued_at   timestamptz not null default now(),
  jwt_jti     text unique,
  user_agent  text,
  ip          inet
);

create index sso_issuances_user_idx   on public.sso_issuances(user_id);
create index sso_issuances_target_idx on public.sso_issuances(target_crm, issued_at desc);

comment on table public.sso_issuances is
  'Append-only. Records every JWT minted by the SSO bridge. Includes Super Admin issuances per the §13 security checklist.';


-- ─────────────────────────────────────────────────────────────────────────────
-- announcements · org-wide read-by-all, posted by Director+
-- ─────────────────────────────────────────────────────────────────────────────

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  posted_by   uuid references auth.users(id),
  title       text not null,
  body        text,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

create index announcements_pinned_idx on public.announcements(pinned, created_at desc);


-- ─────────────────────────────────────────────────────────────────────────────
-- feedback · open-ended suggestions on work function
-- Routed to Department Director + Super Admin per ARCHITECTURE §1 / §8.2.3.
-- The `anonymous` flag is display-only (audit integrity > anonymity at small
-- team scale, per the doc's anonymous-display-convention note).
-- ─────────────────────────────────────────────────────────────────────────────

create table public.feedback (
  id                    uuid primary key default gen_random_uuid(),
  submitter_user_id     uuid references auth.users(id),
  anonymous             boolean not null default false,
  submitter_token       text unique not null,

  category              text check (category in (
    'process', 'culture', 'tooling', 'compensation',
    'client-handling', 'other'
  )),
  department_id         text references public.departments(department_id),

  title                 text not null,
  body                  text not null,

  status                text not null default 'received' check (status in (
    'received', 'under-review', 'actioned', 'wont-action', 'archived'
  )),
  response_body         text,
  responded_by          uuid references auth.users(id),
  responded_at          timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index feedback_department_idx   on public.feedback(department_id);
create index feedback_status_idx       on public.feedback(status);
create index feedback_submitter_idx    on public.feedback(submitter_user_id);
create index feedback_token_idx        on public.feedback(submitter_token);


-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at triggers · keep timestamps honest
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_touch    before update on public.user_profiles    for each row execute function public.touch_updated_at();
create trigger tasks_touch            before update on public.tasks            for each row execute function public.touch_updated_at();
create trigger notes_touch            before update on public.notes            for each row execute function public.touch_updated_at();
create trigger feedback_touch         before update on public.feedback         for each row execute function public.touch_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- auth → user_profiles bridge · auto-create a profile on signup
-- Without this, the first thing a new user sees would 500 because every
-- dashboard query joins to public.user_profiles for is_super_admin.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
