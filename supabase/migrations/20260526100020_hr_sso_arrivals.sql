-- ============================================================================
-- 20260526100020_hr_sso_arrivals.sql
-- ============================================================================
-- Closes contract §6 + §10 line 9 of meir-dashboard/docs/child-crm-sso-contract.md
-- (v1.0, 26 May 2026): every Child SHOULD record SSO arrivals locally so a
-- "who landed here when" question doesn't need cross-DB joins.
--
-- The dashboard's public.sso_issuances (in 20260525100040_dashboard_schema.sql)
-- records the MINT side; this table records the LANDING side at HR. Same `jti`
-- is the join key. Mirrors the shape of erp.sso_arrivals
-- (20260526100010_erp_sso_arrivals.sql) — both children use the same audit
-- pattern.
--
-- Per the contract:
--   "Each child should log SSO arrivals in its own table so debugging a
--    'who landed here when' question doesn't require cross-DB joins"
--
-- Schema notes:
--   • NO `company` column — deliberately. This is an audit table parallel
--     to public.sso_issuances (which also has no company column for the
--     same reason: Super Admins audit cross-org; users see only their own).
--     The user's subsequent in-HR writes are company-scoped via hr.* RLS —
--     this table just records the door-opening event.
--   • `jti` UNIQUE — replay protection at the DB layer. The verifier
--     (meir-hr/lib/sso/verifier.ts) already maintains an in-process jti
--     cache; this adds a durable second line of defence. A duplicate
--     insert means the same JWT was used twice → reject.
--   • `inet` for IP — Postgres-native type, queryable by CIDR.
-- ============================================================================


create table hr.sso_arrivals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  jti          text not null unique,
  arrived_at   timestamptz not null default now(),
  user_agent   text,
  ip           inet
);

comment on table hr.sso_arrivals is
  'Audit log of SSO landings at HR. Pairs with public.sso_issuances via jti — same join key on both sides of the bridge. No company column: this is the audit layer, not a business table (see comment on public.sso_issuances for the same exception).';
comment on column hr.sso_arrivals.jti is
  'JWT ID from the dashboard-minted bridge token. UNIQUE = durable replay protection (the verifier also caches jtis in-process for hot rejection).';

create index hr_sso_arrivals_user_idx
  on hr.sso_arrivals(user_id, arrived_at desc);
create index hr_sso_arrivals_arrived_idx
  on hr.sso_arrivals(arrived_at desc);

alter table hr.sso_arrivals enable row level security;

-- RLS: user sees own arrivals; Super Admin audits all. Inserts are
-- service-role only — clients cannot fabricate audit rows.
create policy "hr_sso_arrivals select own or super-admin"
  on hr.sso_arrivals for select
  using (user_id = auth.uid() or public.is_super_admin());

create policy "hr_sso_arrivals insert service-role only"
  on hr.sso_arrivals for insert
  with check (false);   -- service role bypasses RLS; clients cannot insert
