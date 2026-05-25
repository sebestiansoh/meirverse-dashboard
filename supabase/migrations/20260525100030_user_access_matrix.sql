-- ============================================================================
-- 20260525100030_user_access_matrix.sql
-- ============================================================================
-- The per-user access matrix that replaces the old Department × Role model
-- (Alignment doc Conflict #2). Implements Mandate §Access control:
--
--   "End user — Access scope is the explicit set of
--    (module × action × data-segment) tuples assigned to them by a
--    back-end actor."
--
-- Three tables:
--
--   1. modules            — extensible catalog of dashboard surfaces
--                            ('erp', 'hr', 'finance', 'inventory', 'crm',
--                             'underwriting', 'dashboard-admin', …)
--
--   2. user_access        — the matrix. One row per (user, module, action,
--                            company) tuple the user is granted.
--                            Action is one of: view / write / approve.
--                            company='holdco' means the grant is
--                            shared-services scope, NULL means cross-org
--                            (Super-Admin-issued only).
--
--   3. user_reporting_line — per Mandate §Access control: "designate the
--                            direct reporting officer. Reporting officer
--                            drives approval routing, visibility escalation,
--                            and substitution during absence."
--                            Pure organisational metadata — does NOT grant
--                            access on its own.
--
-- The old `departments` + `user_departments` tables are NOT recreated. They
-- belonged to the deprecated Department × Role model.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- modules · extensible catalog of access targets
-- ─────────────────────────────────────────────────────────────────────────────

create table public.modules (
  module_id      text primary key,
  display_name   text not null,
  description    text,
  category       text not null check (category in (
    'crm', 'erp', 'hr', 'finance', 'inventory',
    'underwriting', 'dashboard', 'admin'
  )),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

comment on table public.modules is
  'Extensible catalog of access targets. Adding a module is a single insert. The (module × action × company) tuple is the unit of access in user_access.';

create index modules_category_idx on public.modules(category) where is_active = true;

alter table public.modules enable row level security;

create policy "modules readable by authenticated users"
  on public.modules
  for select
  using (auth.role() = 'authenticated');


-- ─────────────────────────────────────────────────────────────────────────────
-- user_access · the per-user access matrix
-- ─────────────────────────────────────────────────────────────────────────────

create table public.user_access (
  user_id      uuid not null references auth.users(id) on delete cascade,
  module_id    text not null references public.modules(module_id),
  action       text not null check (action in ('view', 'write', 'approve')),
  company      text references public.company(company_id),
  granted_at   timestamptz not null default now(),
  granted_by   uuid references auth.users(id),
  notes        text,
  -- A NULL company means cross-org grant (Super Admin issuance only).
  -- A non-NULL company scopes the grant to that org unit.
  -- 'holdco' is a valid company_id for shared-services modules (HR, Finance, Inventory).
  primary key (user_id, module_id, action, company)
);

comment on table public.user_access is
  'Per-(user, module, action, company) matrix. Replaces the deprecated Department × Role model. NULL company = cross-org (Super-Admin-issued).';
comment on column public.user_access.action is
  'view = read-only · write = create + update · approve = sign-off / decision authority. Higher actions IMPLY lower (write implies view, approve implies write).';

create index user_access_user_idx        on public.user_access(user_id);
create index user_access_module_idx      on public.user_access(module_id, company);
create index user_access_user_module_idx on public.user_access(user_id, module_id);

alter table public.user_access enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- user_reporting_line · organisational hierarchy (NOT access-granting)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.user_reporting_line (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  reporting_to_user_id uuid references auth.users(id),
  rank                 text,        -- 'Director', 'Manager', 'Senior', 'Staff', etc. — free-form per org unit
  effective_from       date not null default current_date,
  effective_to         date,
  updated_at           timestamptz not null default now(),
  -- Self-referential constraint enforced at app layer (cycle detection cheap there).
  check (reporting_to_user_id is null or reporting_to_user_id <> user_id)
);

comment on table public.user_reporting_line is
  'Reporting officer + rank. Drives approval routing and absence-substitution UI. Per Mandate §Access control: rank does NOT auto-grant access.';
comment on column public.user_reporting_line.rank is
  'Free-form, per-org-unit rank label. NOT used for access decisions. Access is per-(user, module, action, company) only.';

create index user_reporting_line_reports_to_idx
  on public.user_reporting_line(reporting_to_user_id)
  where reporting_to_user_id is not null;

create trigger user_reporting_line_touch
  before update on public.user_reporting_line
  for each row execute function public.touch_updated_at();

alter table public.user_reporting_line enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- Helper functions used by RLS in 20260525100400_rls_policies.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns true if the calling user is a Super Admin.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.user_profiles where user_id = auth.uid()),
    false
  );
$$;

-- Returns true if the calling user has the given (module, action, company)
-- grant. NULL company in the user's grant matches any company (cross-org).
-- Action hierarchy: approve > write > view. A user with 'write' for the
-- module satisfies an 'view' check.
create or replace function public.has_access(
  p_module text,
  p_action text,
  p_company text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.user_access ua
      where ua.user_id = auth.uid()
        and ua.module_id = p_module
        and (ua.company is null or ua.company = p_company)
        and case p_action
          when 'view'    then ua.action in ('view', 'write', 'approve')
          when 'write'   then ua.action in ('write', 'approve')
          when 'approve' then ua.action = 'approve'
          else false
        end
    );
$$;

comment on function public.has_access(text, text, text) is
  'RLS helper. Returns true if the calling user can perform p_action on p_module within p_company (or any company if user has a NULL grant). Action hierarchy: approve > write > view.';
