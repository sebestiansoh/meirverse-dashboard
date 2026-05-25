-- ============================================================================
-- 20260525100040_dashboard_schema.sql
-- ============================================================================
-- Internal Dashboard orchestration tables. These live in `public` because
-- they belong to the dashboard root (`meirverse.app` apex per Mandate
-- §Domain & naming, target state per D-B), not to any single Child CRM.
--
-- Every primary table carries a `company` column (Mandate §Data model,
-- Alignment doc Conflict #6). For dashboard-level surfaces that are
-- inherently cross-org (announcements posted by the Principal,
-- Super-Admin-only audit logs), `company` may be 'holdco' or NULL with
-- explicit comments.
--
-- Tables:
--   • announcements      — org-wide read-by-all banner posts
--   • feedback           — open-ended suggestions, routed by company + module
--   • quick_launch       — per-user or shared launch tiles
--   • tasks              — personal Google-Tasks-mirrored todos
--   • notes              — client-encrypted scratchpad (AES-GCM)
--   • sso_issuances      — audit trail of every CRM SSO JWT minted
--   • entities (LEGACY)  — REMOVED. The 9-row company catalog from
--                          20260525100010 replaces it. Code that
--                          referenced `entities` migrates to `company`.
--
-- The deprecated `departments` + `user_departments` from the old build
-- are NOT recreated. user_access (20260525100030) replaces them.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- tasks · personal tasks (mirrored from / to Google Tasks)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  company           text not null references public.company(company_id),
  text              text not null,
  done              boolean not null default false,
  due_date          date,
  google_task_id    text,
  google_task_list  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on column public.tasks.company is
  'The org unit this task belongs to. Defaults to the user''s primary_company at insert (app layer). holdco for shared-services todos.';

create index tasks_user_idx    on public.tasks(user_id);
create index tasks_due_idx     on public.tasks(due_date) where due_date is not null;
create index tasks_company_idx on public.tasks(company);

create trigger tasks_touch
  before update on public.tasks
  for each row execute function public.touch_updated_at();

alter table public.tasks enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- notes · client-encrypted scratchpad (AES-GCM ciphertext only)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.notes (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  company             text not null references public.company(company_id),
  encrypted_content   text not null,
  iv                  text not null,
  updated_at          timestamptz not null default now()
);

comment on table public.notes is
  'Plaintext NEVER reaches the server. Browser derives AES-GCM key from the session. Server stores ciphertext + IV only.';

create index notes_user_idx    on public.notes(user_id);
create index notes_company_idx on public.notes(company);

create trigger notes_touch
  before update on public.notes
  for each row execute function public.touch_updated_at();

alter table public.notes enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- quick_launch · per-user or team-shared launch tiles
-- ─────────────────────────────────────────────────────────────────────────────

create table public.quick_launch (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid references auth.users(id) on delete cascade,
  company             text not null references public.company(company_id),
  name                text not null,
  url                 text not null,
  color               text,
  module_id           text references public.modules(module_id),
  shared_with_team    boolean not null default false,
  position            integer not null default 0,
  created_at          timestamptz not null default now()
);

comment on column public.quick_launch.module_id is
  'Optional module association (e.g. ''erp'', ''hr''). Drives which dashboard cluster the tile renders under. NULL for free-standing links.';

create index quick_launch_owner_idx   on public.quick_launch(owner_user_id);
create index quick_launch_shared_idx  on public.quick_launch(shared_with_team) where shared_with_team = true;
create index quick_launch_company_idx on public.quick_launch(company);

alter table public.quick_launch enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- announcements · org-wide read-by-all
-- ─────────────────────────────────────────────────────────────────────────────

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  posted_by   uuid references auth.users(id),
  company     text not null references public.company(company_id),
  title       text not null,
  body        text,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on column public.announcements.company is
  'The org unit the announcement applies to. Use holdco for cross-org messages. RLS shows users only announcements for their primary_company OR holdco.';

create index announcements_pinned_idx  on public.announcements(pinned, created_at desc);
create index announcements_company_idx on public.announcements(company);

alter table public.announcements enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- feedback · open-ended suggestions
-- ─────────────────────────────────────────────────────────────────────────────

create table public.feedback (
  id                    uuid primary key default gen_random_uuid(),
  submitter_user_id     uuid references auth.users(id),
  company               text not null references public.company(company_id),
  anonymous             boolean not null default false,
  submitter_token       text unique not null,

  category              text check (category in (
    'process', 'culture', 'tooling', 'compensation',
    'client-handling', 'other'
  )),
  module_id             text references public.modules(module_id),

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

create index feedback_module_idx    on public.feedback(module_id);
create index feedback_status_idx    on public.feedback(status);
create index feedback_submitter_idx on public.feedback(submitter_user_id);
create index feedback_token_idx     on public.feedback(submitter_token);
create index feedback_company_idx   on public.feedback(company);

create trigger feedback_touch
  before update on public.feedback
  for each row execute function public.touch_updated_at();

alter table public.feedback enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- sso_issuances · audit trail of every CRM SSO JWT minted
-- ─────────────────────────────────────────────────────────────────────────────
-- This is an audit log, not a primary business table. It is NOT
-- company-scoped — Super Admins audit across all org units. Users see
-- only their own issuance records (RLS in 100400).

create table public.sso_issuances (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  target_crm  text not null,    -- audience: 'erp', 'hr', 'underwriting', etc.
  issued_at   timestamptz not null default now(),
  jwt_jti     text unique,
  user_agent  text,
  ip          inet
);

comment on table public.sso_issuances is
  'Append-only audit. Records every JWT minted by the SSO bridge. NOT company-scoped — Super Admins audit cross-org. Individual users see only their own issuances via RLS.';

create index sso_issuances_user_idx   on public.sso_issuances(user_id);
create index sso_issuances_target_idx on public.sso_issuances(target_crm, issued_at desc);

alter table public.sso_issuances enable row level security;
