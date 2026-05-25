-- ============================================================================
-- 20260525100500_legacy_departments_compat.sql
-- ============================================================================
-- ⚠ DEPRECATED — TRANSITIONAL SHIM ⚠
--
-- The dashboard app code (lib/auth/user-context.ts, lib/auth/scopes.ts,
-- lib/auth/jwt-sign.ts, /api/sso/issue, (dashboard)/page.tsx) still queries
-- the deprecated Department × Role model. Conflict #2 (CLAUDE-ALIGNMENT.md)
-- is the strategic call to rewrite that code onto the new
-- public.user_access matrix — Principal decision pending.
--
-- This migration re-creates the two tables that code expects:
--
--   • public.departments       — functional labels (hr, admin, …, legal)
--   • public.user_departments  — (user_id, department_id, role) tuples
--
-- They are REAL TABLES (not views) so the existing admin UI in
-- /api/sso/issue and (dashboard)/page.tsx can read/write them unchanged.
-- When Conflict #2 lands and the dashboard code migrates onto user_access,
-- these tables get a follow-up migration that:
--   1. Backfills user_access rows from user_departments mappings.
--   2. Switches the dashboard code to read user_access.
--   3. Drops these tables in a later migration (expand-then-contract).
--
-- Until then, treat user_departments as the SoR for the dashboard's
-- department-based scoping and treat user_access as the future SoR for
-- the new CRMs (ERP, HR) that don't use the legacy model.
--
-- See:
--   • CLAUDE-ALIGNMENT.md §2 (Permission model conflict)
--   • CLAUDE-ALIGNMENT.md §14 (expand-then-contract discipline)
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- public.departments · functional labels (NOT org units)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.departments (
  department_id   text primary key,
  display_name    text not null,
  description     text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.departments is
  'DEPRECATED — kept for backward compat with the dashboard app code until Conflict #2 (CLAUDE-ALIGNMENT.md) lands. Functional labels (hr, admin, …), distinct from company catalog.';

alter table public.departments enable row level security;

create policy "departments readable by authenticated users"
  on public.departments
  for select
  using (auth.role() = 'authenticated');


-- ─────────────────────────────────────────────────────────────────────────────
-- public.user_departments · (user, department, role) tuples
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
  'DEPRECATED — see public.departments comment. Director > manager > staff > viewer. Phase 1+ migrates rows into public.user_access (per Conflict #2 strategic decision).';

alter table public.user_departments enable row level security;

create policy "user_departments select own or super-admin"
  on public.user_departments for select
  using (user_id = auth.uid() or public.is_super_admin());

create policy "user_departments write super-admin only"
  on public.user_departments for all
  using (public.is_super_admin())
  with check (public.is_super_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- Seed the six functional labels (idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.departments (department_id, display_name, description, is_active) values
  ('hr',         'Human Resources', 'Personnel · onboarding · benefits · leave',            true),
  ('admin',      'Administration',  'Office · facilities · contracts · vendors',            true),
  ('accounting', 'Accounting',      'Bookkeeping · A/R · A/P · reporting (AutoCount tile)', true),
  ('operations', 'Operations',      'Project delivery · construction · site mgmt',          true),
  ('sales',      'Sales',           'Termsheet · engagement · client onboarding',           true),
  ('legal',      'Legal',           'Contracts · compliance · disputes',                    true)
on conflict (department_id) do update set
  display_name = excluded.display_name,
  description  = excluded.description,
  is_active    = excluded.is_active;


-- ─────────────────────────────────────────────────────────────────────────────
-- Entities + cluster_entities — also deprecated, replaced by public.company
-- but the dashboard still renders Cluster tiles from cluster_entities.
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

comment on table public.entities is
  'DEPRECATED — replaced by public.company (the 9-row catalog). Kept while dashboard cluster-tile rendering hasn''t been retrofitted. Cluster 2 consolidation (CLAUDE-ALIGNMENT.md #5) drops this in a later migration.';

create index entities_segment_idx on public.entities(segment) where is_active = true;

alter table public.entities enable row level security;

create policy "entities readable by authenticated users"
  on public.entities
  for select
  using (auth.role() = 'authenticated');


create table public.cluster_entities (
  cluster_id   text not null check (cluster_id in ('cluster-1', 'cluster-2', 'cluster-3')),
  entity_id    text not null references public.entities(entity_id),
  primary key (cluster_id, entity_id)
);

create index cluster_entities_cluster_idx on public.cluster_entities(cluster_id);

alter table public.cluster_entities enable row level security;

create policy "cluster_entities readable by authenticated users"
  on public.cluster_entities
  for select
  using (auth.role() = 'authenticated');


-- ─────────────────────────────────────────────────────────────────────────────
-- Seed entities + cluster_entities (matches the old seed verbatim)
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.entities (entity_id, display_name, segment, is_active) values
  ('meir-collective',     'Meir Collective',      'commercial',     true),
  ('made-commercial',     'MADE (Commercial)',    'commercial',     true),
  ('meir-homes',          'Meir Homes',           'residential',    true),
  ('meir-edition',        'Meir Edition',         'residential',    true),
  ('good-class-builders', 'Good Class Builders',  'support',        true),
  ('m-atelier',           'm.Atelier',            'support',        true),
  ('m-lifestyle',         'm.Lifestyle',          'support',        true),
  ('property-mgmt',       'Property Management',  'support',        true),
  ('property-maint',      'Property Maintenance', 'support',        true),
  ('cubo',                'Cubo',                 'venture-builds', true),
  ('caerus',              'Caerus',               'venture-builds', true),
  ('made-venture',        'MADE (Venture)',       'venture-builds', true)
on conflict (entity_id) do update set
  display_name = excluded.display_name,
  segment      = excluded.segment,
  is_active    = excluded.is_active;

insert into public.cluster_entities (cluster_id, entity_id)
  select 'cluster-1', entity_id from public.entities where is_active = true
on conflict (cluster_id, entity_id) do nothing;

insert into public.cluster_entities (cluster_id, entity_id) values
  ('cluster-2', 'meir-homes'),
  ('cluster-2', 'meir-edition'),
  ('cluster-2', 'meir-collective'),
  ('cluster-2', 'm-atelier'),
  ('cluster-3', 'meir-homes'),
  ('cluster-3', 'meir-edition'),
  ('cluster-3', 'meir-collective'),
  ('cluster-3', 'm-atelier')
on conflict (cluster_id, entity_id) do nothing;
