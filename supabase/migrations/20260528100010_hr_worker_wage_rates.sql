-- ============================================================================
-- 20260528100010_hr_worker_wage_rates.sql
-- ============================================================================
-- HR Phase 2 — Labour Worker Operations, HR-side of the M-1 split.
--
-- Principal decision M-1 (meir-hr/CLAUDE-ALIGNMENT.md Conflict #7):
--   ERP owns jobsites / check-ins / time chits (erp.* schema, separate
--   migration). HR owns WAGE RATES + OVERTIME RULES. This migration lands the
--   HR-side only:
--     • hr.employees.is_labour_worker  — flag that gates the module
--     • hr.worker_wage_rates           — effective-dated daily-wage config
--
-- EXPAND-THEN-CONTRACT (Mandate §Deploy → Schema migrations): this is purely
-- the EXPAND step — additive, backward-compatible. The new column has a safe
-- default; the new table is independent. No code yet depends on either, so no
-- contract step is needed. Apply to internal-staging first, soak >= 24h, then
-- production (Mandate §Environments). Do NOT apply straight to production.
--
-- Money note: AutoCount remains SoR for actual payroll/salary (ARCHITECTURE
-- §1). worker_wage_rates is RATE CONFIG (the rule), not a money ledger — the
-- analog of hr.employees.salary_band for daily-wage workers. Computed pay is a
-- leaf-level worksheet feeding AutoCount, never a canonical money store here.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · Gate flag on the canonical staff record (additive, safe default)
-- ─────────────────────────────────────────────────────────────────────────────

alter table hr.employees
  add column if not exists is_labour_worker boolean not null default false;

comment on column hr.employees.is_labour_worker is
  'Gates Labour Worker Operations (Phase 2). When true, the worker has daily-wage rates in hr.worker_wage_rates and time chits in erp.* (per M-1). Default false = salaried/regular staff.';

-- Partial index — labour workers are a minority; only index the true rows.
create index if not exists hr_employees_labour_worker_idx
  on hr.employees(company)
  where is_labour_worker;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · hr.worker_wage_rates · effective-dated daily-wage configuration
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per (worker, effective period). Payroll reads the rate as-of the
-- pay period_end (mirrors the CPF/citizenship as-of pattern). A time chit
-- snapshots the rate at chit time for audit reproducibility, so historical
-- chits stay correct even after a rate change.

create table hr.worker_wage_rates (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references hr.employees(user_id) on delete cascade,
  company                text not null references public.company(company_id),
  -- Rate config
  base_daily_wage        numeric(12,2) not null check (base_daily_wage >= 0),
  regular_hours_per_day  numeric(4,2)  not null default 8   check (regular_hours_per_day > 0),
  ot_multiplier          numeric(4,2)  not null default 1.5 check (ot_multiplier >= 1.5),
  currency               text          not null default 'SGD',
  -- Effective dating (effective_to NULL = current/open-ended)
  effective_from         date not null,
  effective_to           date check (effective_to is null or effective_to >= effective_from),
  -- Provenance
  notes                  text,
  created_by_user_id     uuid references auth.users(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table hr.worker_wage_rates is
  'Effective-dated daily-wage config for labour workers (HR side of M-1). Rate CONFIG, not a money ledger — AutoCount is SoR for payroll. Snapshot onto each time chit at chit time for audit reproducibility.';
comment on column hr.worker_wage_rates.ot_multiplier is
  'Overtime multiplier. CHECK >= 1.5 enforces the MOM statutory minimum (1.5x). OT-cap warnings (72h/month) + HR Director sign-off to exceed are application logic, not enforced here.';
comment on column hr.worker_wage_rates.effective_to is
  'NULL = the current open-ended rate. A partial unique index allows exactly one open-ended rate per worker.';

-- Exactly one current (open-ended) rate per worker.
create unique index hr_worker_wage_rates_current_uniq
  on hr.worker_wage_rates(user_id)
  where effective_to is null;

create index hr_worker_wage_rates_user_idx
  on hr.worker_wage_rates(user_id, effective_from desc);
create index hr_worker_wage_rates_company_idx
  on hr.worker_wage_rates(company);

create trigger hr_worker_wage_rates_touch
  before update on hr.worker_wage_rates
  for each row execute function public.touch_updated_at();

alter table hr.worker_wage_rates enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · RLS · worker sees own rate; HR admins by company; writes are HR-admin
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirrors the hr.employees / hr.leave_balances pattern in
-- 20260525100400_rls_policies.sql. Access via public.has_access('hr', …) — never
-- from rank (Mandate §Access control).

create policy "hr_worker_wage_rates select own or hr-admin"
  on hr.worker_wage_rates for select
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.has_access('hr', 'view', company)
  );

create policy "hr_worker_wage_rates write hr-admin"
  on hr.worker_wage_rates for all
  using (public.is_super_admin() or public.has_access('hr', 'write', company))
  with check (public.is_super_admin() or public.has_access('hr', 'write', company));
