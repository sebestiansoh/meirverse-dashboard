-- ============================================================================
-- 20260525100200_hr_schema.sql
-- ============================================================================
-- HR (holdco shared-services Child at hr.meirverse.app) — Internal DB schema.
-- Lives in the `hr` Postgres schema.
--
-- Per Mandate §Data model: "HR / Finance / Inventory operate at the holdco /
-- shared-services layer within the Internal DB — cross-org views for
-- authorised users, with `company` attribution preserved on every
-- underlying row."
--
-- This means:
--   • Every employee row carries a `company` column — the org unit they're
--     employed under (their on-payroll entity).
--   • A staff member with HR access scoped to a specific company sees only
--     their unit's employees. Cross-org HR access (Super Admin, Holdco HR
--     Director) requires a NULL-company grant in user_access.
--
-- Per Mandate §Data model + D-C: NO mirror users table. Every user_id FK
-- references auth.users(id) directly. The deprecated public.hr_users is
-- NOT created.
--
-- Phase 0 surface (sufficient for go-live):
--   • employees           — canonical staff record
--   • leave_types         — config (annual, medical, etc.)
--   • leave_balances      — per-employee per-year ledger
--   • leave_requests      — workflow entity
--   • employee_documents  — file registry (Supabase Storage)
--
-- Deferred to Phase 1+ per Mandate §Migration & exceptions discipline:
--   • appraisals, onboarding_checklist, benefits
--   • payroll (NEVER — AutoCount is SoR for money per ARCHITECTURE §1)
-- ============================================================================


create schema if not exists hr;

comment on schema hr is
  'HR Child (hr.meirverse.app). Holdco shared-services. SoR: Internal DB. Every row company-attributed for clean per-org-unit export.';

grant usage on schema hr to authenticated, anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- hr.employees · canonical staff record
-- ─────────────────────────────────────────────────────────────────────────────

create table hr.employees (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  company                 text not null references public.company(company_id),
  -- Identity
  full_legal_name         text not null,
  preferred_name          text,
  nric_or_passport_last4  text,
  nationality             text,
  date_of_birth           date,
  -- Contact
  phone_e164              text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  -- Employment
  position                text not null,
  employment_type         text not null check (employment_type in (
    'full-time', 'part-time', 'contract', 'intern', 'consultant'
  )),
  hired_at                date not null,
  terminated_at           date,
  -- Salary band (NOT salary — AutoCount is SoR for money)
  salary_band             text,
  -- Reporting (organisational — does NOT grant access; user_access does)
  reports_to_user_id      uuid references auth.users(id),
  -- Status
  status                  text not null default 'active' check (status in (
    'active', 'on-leave', 'notice-period', 'terminated'
  )),
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table hr.employees is
  'HR-side staff record. PK = auth.users.id (one row per onboarded person). The `company` column = the org unit they''re payrolled under.';
comment on column hr.employees.nric_or_passport_last4 is
  'Last 4 of identity document, for quick verification. Full document lives in hr.employee_documents.';
comment on column hr.employees.reports_to_user_id is
  'Pure organisational hierarchy. NOT used for access control (Mandate §Access control: rank does not auto-grant access). Mirror of user_reporting_line for HR-domain reads.';

create index hr_employees_company_idx     on hr.employees(company);
create index hr_employees_status_idx      on hr.employees(status) where status = 'active';
create index hr_employees_reports_to_idx  on hr.employees(reports_to_user_id);

create trigger hr_employees_touch
  before update on hr.employees
  for each row execute function public.touch_updated_at();

alter table hr.employees enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- hr.leave_types · config (admin-edited, seeded with Singapore defaults)
-- ─────────────────────────────────────────────────────────────────────────────
-- NOT company-scoped — leave types are shared across all org units.

create table hr.leave_types (
  leave_type_id           text primary key,
  display_name            text not null,
  default_entitlement     integer not null default 0,
  paid                    boolean not null default true,
  requires_attachment     boolean not null default false,
  is_active               boolean not null default true,
  notes                   text,
  created_at              timestamptz not null default now()
);

comment on table hr.leave_types is
  'Reference catalog. Shared across all org units. Per-employee entitlements live in hr.leave_balances and may vary by company via the application layer.';

alter table hr.leave_types enable row level security;

create policy "leave_types readable by authenticated users"
  on hr.leave_types
  for select
  using (auth.role() = 'authenticated');


-- ─────────────────────────────────────────────────────────────────────────────
-- hr.leave_balances · per-employee per-type per-year ledger
-- ─────────────────────────────────────────────────────────────────────────────

create table hr.leave_balances (
  user_id           uuid not null references hr.employees(user_id) on delete cascade,
  company           text not null references public.company(company_id),
  leave_type_id     text not null references hr.leave_types(leave_type_id),
  calendar_year     integer not null,
  entitlement_days  numeric not null default 0,
  taken_days        numeric not null default 0,
  primary key (user_id, leave_type_id, calendar_year)
);

comment on table hr.leave_balances is
  'Authoritative remaining-leave = entitlement_days - taken_days. taken_days recomputed from approved leave_requests by app logic.';

create index hr_leave_balances_year_idx    on hr.leave_balances(calendar_year);
create index hr_leave_balances_company_idx on hr.leave_balances(company);

alter table hr.leave_balances enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- hr.leave_requests · main workflow entity
-- ─────────────────────────────────────────────────────────────────────────────

create table hr.leave_requests (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references hr.employees(user_id) on delete cascade,
  company             text not null references public.company(company_id),
  leave_type_id       text not null references hr.leave_types(leave_type_id),
  start_date          date not null,
  end_date            date not null check (end_date >= start_date),
  half_day_start      boolean not null default false,
  half_day_end        boolean not null default false,
  total_days          numeric not null,
  reason              text,
  attachment_keys     jsonb not null default '[]'::jsonb,
  status              text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected', 'cancelled'
  )),
  submitted_at        timestamptz not null default now(),
  decided_at          timestamptz,
  decided_by_user_id  uuid references auth.users(id),
  decision_note       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index hr_leave_requests_user_idx        on hr.leave_requests(user_id);
create index hr_leave_requests_status_idx      on hr.leave_requests(status, submitted_at desc);
create index hr_leave_requests_date_range_idx  on hr.leave_requests(start_date, end_date);
create index hr_leave_requests_company_idx     on hr.leave_requests(company);

create trigger hr_leave_requests_touch
  before update on hr.leave_requests
  for each row execute function public.touch_updated_at();

alter table hr.leave_requests enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- hr.employee_documents · Supabase Storage-backed attachment registry
-- ─────────────────────────────────────────────────────────────────────────────

create table hr.employee_documents (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references hr.employees(user_id) on delete cascade,
  company               text not null references public.company(company_id),
  kind                  text not null check (kind in (
    'offer-letter', 'contract', 'identity', 'work-pass',
    'cpf-document', 'tax-document', 'medical-cert',
    'qualification', 'other'
  )),
  display_name          text not null,
  storage_key           text not null,
  mime_type             text,
  size_bytes            bigint,
  uploaded_at           timestamptz not null default now(),
  uploaded_by_user_id   uuid not null references auth.users(id),
  sensitivity           text not null default 'restricted' check (sensitivity in (
    'public', 'employee-only', 'restricted', 'confidential'
  )),
  notes                 text
);

comment on column hr.employee_documents.sensitivity is
  'public = visible to anyone with hr:view · employee-only = subject employee + their HR org admin · restricted = HR Org Admins only · confidential = Super Admin only.';

create index hr_employee_documents_user_idx     on hr.employee_documents(user_id);
create index hr_employee_documents_kind_idx     on hr.employee_documents(user_id, kind);
create index hr_employee_documents_company_idx  on hr.employee_documents(company);

alter table hr.employee_documents enable row level security;
