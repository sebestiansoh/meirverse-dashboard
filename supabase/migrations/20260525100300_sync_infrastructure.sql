-- ============================================================================
-- 20260525100300_sync_infrastructure.sql
-- ============================================================================
-- ⚠ PHASE 2 CROSS-DB ONLY ⚠
--
-- This migration installs the outbox + inbound-receiver tables that power
-- 2-way sync between independent DBs (per Alignment doc Conflict #12).
--
-- These tables MUST NOT be used for within-Internal-DB syncing. Within
-- the Internal DB, HR + ERP + Finance + Inventory all share one auth.users
-- and one Postgres instance — cross-table reads happen via direct SQL JOIN.
-- Emitting events for an HR ↔ ERP relationship that lives in the same DB
-- would be a SoR violation (Mandate §Data model: "no caching, mirroring,
-- or duplication").
--
-- These tables come online only when:
--   1. The External DB is provisioned (Phase 2), AND
--   2. The Fly.io API gateway is routing inter-DB calls.
--
-- Why ship them now anyway?
--   • The event-type registry and route handlers already exist in the
--     gcb-erp + hr repos (built earlier today, before alignment). Tagging
--     them Phase-2-only in code is cheaper than ripping them out.
--   • The audit-trail is useful even if no events fire — gives us a place
--     to record manual cross-DB operations.
--
-- Column shape mirrors the in-repo emitters/receivers verbatim
-- (lib/sync/outbox.ts + app/api/sync/inbound/route.ts in both gcb-erp and
-- hr) so no code change is needed when the tables go live.
--
-- See docs/2-way-sync.md (top banner) for the operational rules.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- public.sync_outbound_events · outbox (Phase 2 cross-DB)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.sync_outbound_events (
  id                bigserial primary key,
  event_id          uuid not null unique,
  event_type        text not null,            -- e.g. 'hr.employee.terminated'
  schema_version    integer not null default 1,
  emitter           text,                      -- 'hr', 'erp', 'dashboard', 'underwriting' — emitted by trigger or app
  target_audience   text not null,             -- 'underwriting', 'erp', 'hr', etc.
  subject_kind      text not null,             -- 'employee', 'project_member', 'policy', ...
  subject_user_id   uuid references auth.users(id),
  payload           jsonb not null,
  occurred_at       timestamptz not null default now(),
  -- Drainer bookkeeping (Phase 1+)
  status            text not null default 'pending' check (status in (
    'pending', 'in-flight', 'delivered', 'failed', 'abandoned'
  )),
  attempts          integer not null default 0,
  last_attempt_at   timestamptz,
  last_error        text,
  delivered_at      timestamptz
);

comment on table public.sync_outbound_events is
  'Phase 2 cross-DB outbox. Do NOT emit events for within-Internal-DB syncing — use direct SQL JOINs. Column shape matches lib/sync/outbox.ts in gcb-erp + hr.';
comment on column public.sync_outbound_events.target_audience is
  'Singular per row (matches lib/sync/outbox.ts contract). Fan-out = one row per audience.';

create index sync_outbound_events_status_idx
  on public.sync_outbound_events(status, occurred_at)
  where status in ('pending', 'failed');
create index sync_outbound_events_event_type_idx on public.sync_outbound_events(event_type);
create index sync_outbound_events_target_idx     on public.sync_outbound_events(target_audience, status);

alter table public.sync_outbound_events enable row level security;


-- ─────────────────────────────────────────────────────────────────────────────
-- public.sync_inbound_events · de-dupe + audit log (Phase 2 cross-DB)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.sync_inbound_events (
  id                bigserial primary key,
  event_id          uuid not null unique,
  event_type        text not null,
  schema_version    integer not null default 1,
  emitter           text not null,
  subject_kind      text not null,
  subject_user_id   uuid references auth.users(id),
  payload           jsonb not null,
  occurred_at       timestamptz not null,
  received_at       timestamptz not null default now(),
  dispatched_at     timestamptz,
  dispatch_error    text
);

comment on table public.sync_inbound_events is
  'Phase 2 cross-DB inbound de-dupe + audit. event_id UNIQUE provides idempotency. Column shape matches app/api/sync/inbound/route.ts in gcb-erp + hr.';

create index sync_inbound_events_event_type_idx on public.sync_inbound_events(event_type);
create index sync_inbound_events_dispatched_idx
  on public.sync_inbound_events(received_at)
  where dispatched_at is null;

alter table public.sync_inbound_events enable row level security;
