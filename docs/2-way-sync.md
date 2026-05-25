# Cross-CRM 2-way sync

This doc is the **contract every Meirverse CRM implements** when it
needs to push state to or accept state from a sibling CRM. Distinct
from [`crm-data-pulls.md`](./crm-data-pulls.md), which covers on-demand
read-only pulls — sync is for **writes**: state changes in CRM A that
must be reflected as durable records in CRM B (and vice versa).

Triggered by the 2026-05-25 access-logic clarification: HR ↔
Underwriting needs bidirectional flow of HR-relevant data (employee
roster, status, salary band ↔ underwriting decisions, insurance
enrollment, risk flags). Same pattern works for any pair (e.g., HR ↔
ERP for employment-status ↔ project-assignment sync).

## Why event-driven (and not shared mirror tables)

Three patterns were considered. Decision logged here so the next
person doesn't re-derive it:

| Pattern | Verdict | Why |
| --- | --- | --- |
| Shared mirror tables via Supabase replication | ❌ Rejected | Couples every CRM to every CRM's schema. Migrations become a cross-team negotiation. Hardest to evolve. |
| On-demand pulls (existing `crm-data-pulls.md`) | ⚠️ Insufficient on its own | Read-only. Doesn't handle "Bob's employment was terminated yesterday — Underwriting must close his policy." |
| **Event-driven outbox + webhook** (this doc) | ✅ Chosen | Each CRM owns its schema. Events flow on relevant changes only. Idempotent + retryable. Loose coupling — Underwriting can be in maintenance and HR's outbox just retains pending events. |

## The flow

```
┌─────────────────────────────────────┐
│ HR (hr.meirverse.app)               │
│                                     │
│  1. employee status changes in HR   │
│  2. trigger writes outbox row       │
│     (sync_outbound_events)          │
│  3. worker (cron / on-demand)       │
│     reads unpushed rows             │
│  4. mints service-token JWT from    │
│     dashboard's /api/sso/mint-svc   │
│  5. POSTs the event to              │
│     underwriting.meirverse.app/     │
│       api/sync/inbound              │
│  6. on 2xx, marks the outbox row    │
│     pushed_at = now()               │
│  7. on 4xx, dead-letters the row    │
│  8. on 5xx / timeout, retries with  │
│     exponential backoff             │
└─────────────────────────────────────┘
                │
                ▼ POST + Bearer <service JWT>
┌─────────────────────────────────────┐
│ Underwriting                        │
│   POST /api/sync/inbound            │
│                                     │
│   9. verify service-token JWT       │
│  10. de-dupe by event_id            │
│  11. insert into sync_inbound_events│
│  12. dispatch to event handler      │
│      (closes the policy etc.)      │
│  13. return 2xx                     │
└─────────────────────────────────────┘
```

The mirror flow (Underwriting → HR) is structurally identical, just
swap the labels.

## The contract

### Event envelope

Every event is a JSON object with this shape, regardless of who emits
it or who receives it:

```json
{
  "event_id":     "01HMK…",            // ULID or UUID, globally unique
  "event_type":   "hr.employee.terminated",
  "schema_version": 1,                  // monotonic per event_type
  "occurred_at":  "2026-05-25T14:30:00.000Z",  // when the source-of-truth changed
  "emitter":      "hr",                 // sibling identifier (same string as JWT aud)
  "subject": {
    "kind":       "employee",
    "user_id":    "auth-uuid-here",     // dashboard's stable user identity
    "email":      "alice@meirverse.app" // helpful for cross-system lookups
  },
  "payload": {
    // event-type-specific data; see registry below
  }
}
```

### Authentication — service-token JWTs

Inter-CRM calls use a new flavour of dashboard-signed JWT distinct
from the user-bound bridge tokens. Same RS256 keypair (same JWKS
endpoint, so receivers reuse `verifyBridgeToken` with a different
audience check).

Endpoint: `POST https://dashboard.meirverse.app/api/sso/mint-service-token`.
Auth: each emitting CRM holds a `SYNC_SVC_SECRET` env var the dashboard
recognises (HMAC-signed bearer in the request header). The dashboard
returns a JWT with:

- `iss`: `https://dashboard.meirverse.app`
- `aud`: the **target** CRM's audience (e.g. `underwriting`, `hr`)
- `sub`: `svc:<emitter>` — e.g. `svc:hr` — distinguishes service
  calls from user calls
- `scopes`: `["sync:inbound"]` — granular so receivers can reject
  service tokens trying to call non-sync endpoints
- `exp`: 5 minutes from issuance
- `jti`: unique

Receivers verify with the same JWKS-backed `verifyBridgeToken` they
already use for the user-bound flow, plus an extra check that
`sub.startsWith("svc:")` and `scopes.includes("sync:inbound")`.

### Idempotency

`event_id` is the de-dupe key. Receivers maintain a
`sync_inbound_events` table with `event_id` as PRIMARY KEY. Re-receiving
the same event is a no-op — the insert errors with a unique-constraint
violation, the handler returns 2xx, the emitter clears its outbox.

This makes the contract **at-least-once delivery**. Handlers must be
idempotent. (Most are naturally so — "set Bob's policy status to
inactive" is idempotent regardless of how many times it's run.)

### Retry policy

Emitter side:
- 2xx response → mark `pushed_at = now()`, done.
- 4xx response → mark `dead_lettered_at = now()`, record `last_error_code`
  + `last_error_body`. Do NOT retry — a 4xx means the receiver
  considered the event malformed, retrying won't help. Sebestian
  inspects the dead-letter table manually.
- 5xx / network timeout → bump `attempts`, schedule next retry with
  exponential backoff (5 min → 15 → 60 → 240 → 720 → 1440 → give up
  after 6 attempts).

Receiver side:
- Verify auth before reading the body. Fail with 401 fast.
- Validate event envelope structure. Fail with 400 if malformed.
- Validate event_type is in the registry. Fail with 400 if unknown.
- De-dupe by event_id. If already present, return 200 (idempotent OK).
- Dispatch to the handler. Handler errors → return 500 (emitter will retry).
- All handlers run synchronously within the request — no async/queue
  on the receiver side. Keep handlers fast (<5s) or do the actual
  work in a separate worker that polls `sync_inbound_events`.

## Event-type registry

The canonical list. Each CRM's outbound emitter only emits the events
it owns; each CRM's inbound handler only registers handlers for events
it cares about. **Adding an event type requires updating this doc AND
notifying every sibling CRM.**

### Owned by HR

| event_type | when emitted | payload shape |
| --- | --- | --- |
| `hr.employee.created` | New employee record created in HR | `{ full_legal_name, entity_id, position, employment_type, hired_at, salary_band }` |
| `hr.employee.updated` | Any field on `employees` changes | `{ changed_fields: string[], previous_values: {...}, current_values: {...} }` |
| `hr.employee.terminated` | `employees.status` set to `terminated` (or `terminated_at` set) | `{ terminated_at, reason: 'resignation'|'dismissal'|'redundancy'|'retirement'|'end-of-contract', last_working_day }` |
| `hr.employee.department_changed` | Reporting line or department assignment changed in dashboard | `{ added_departments: DepartmentClaim[], removed_departments: DepartmentClaim[] }` |
| `hr.leave_request.approved` | A leave request transitions to `approved` | `{ leave_request_id, leave_type_id, start_date, end_date, total_days }` |
| `hr.leave_request.cancelled` | An already-approved leave is cancelled (rare but happens) | `{ leave_request_id, original_start_date, original_end_date, cancellation_reason }` |

### Owned by Underwriting (Child 3)

> **Note for the concurrent session building Underwriting:** define the
> events Underwriting owns in this section. The list below is a
> reasonable starting set — adjust based on Underwriting's actual
> entities and workflows.

| event_type | when emitted | payload shape |
| --- | --- | --- |
| `underwriting.policy.created` | A new policy is bound for a person | `{ policy_id, policy_type, insured_user_id, coverage_amount_sgd, effective_date, expiry_date }` |
| `underwriting.policy.terminated` | Policy ends (lapsed, cancelled, or natural expiry) | `{ policy_id, terminated_at, reason }` |
| `underwriting.risk_flag.raised` | Risk decisioning flagged a person for review | `{ flag_id, severity: 'low'|'medium'|'high', notes }` |
| `underwriting.risk_flag.cleared` | A previously raised flag is resolved | `{ flag_id, cleared_at, resolution }` |

### Owned by GCB ERP (Child 2)

| event_type | when emitted | payload shape |
| --- | --- | --- |
| `construction-erp.project.assigned` | A user is added to a project's `project_members` | `{ project_id, project_address, role, position, joined_at }` |
| `construction-erp.project.removed` | A user removed from `project_members` | `{ project_id, removed_at, reason }` |
| `construction-erp.project.archived` | Project archived | `{ project_id, archived_at, archived_by_user_id }` |

### Owned by dashboard (rare — dashboard usually mints not emits)

| event_type | when emitted | payload shape |
| --- | --- | --- |
| `dashboard.user.suspended` | A user is removed from the Workspace allowlist or otherwise blocked at the dashboard level | `{ reason, effective_at }` |
| `dashboard.user.reinstated` | A previously-suspended user is reinstated | `{ effective_at }` |

## Subscriptions table

Which CRM consumes which events, so the picture is clear:

| Receiver → / Owner ↓ | dashboard | HR | ERP | Underwriting |
| --- | --- | --- | --- | --- |
| **dashboard** | — | ✅ | ✅ | ✅ |
| **HR** | — | — | ✅ all employee.* | ✅ all employee.* and leave_request.* |
| **ERP** | — | ✅ project.assigned/removed (for employee profile sidebar) | — | — |
| **Underwriting** | — | ✅ policy.* and risk_flag.* (for employee profile sidebar) | — | — |

When you add a new CRM, append a row + column to this table.

## Implementation checklist per CRM

When a sibling CRM wires up sync, this checklist makes sure both sides
are covered.

### Outbound (events this CRM emits)

- [ ] `sync_outbound_events` table — see schema below
- [ ] DB triggers (or app-level write paths) populate the outbox row
      on every relevant change
- [ ] A worker (cron, or on-demand from a dashboard webhook) reads
      unpushed rows, mints a service token, POSTs, marks pushed
- [ ] Dead-letter table inspection page in admin UI (Phase 2+)

### Inbound (events this CRM receives)

- [ ] `POST /api/sync/inbound` endpoint
- [ ] `sync_inbound_events` table — see schema below
- [ ] Verify service-token JWT (audience = this CRM, scopes includes
      `sync:inbound`, sub starts with `svc:`)
- [ ] De-dupe by event_id
- [ ] Dispatch table: event_type → handler function
- [ ] Handlers are idempotent
- [ ] Failed dispatches return 500 (emitter retries); malformed events
      return 400 (no retry)

### Env

- [ ] `SYNC_SVC_SECRET` — HMAC bearer the dashboard uses to identify
      this CRM when minting service tokens
- [ ] `DASHBOARD_SVC_MINT_URL` — defaults to
      `https://dashboard.meirverse.app/api/sso/mint-service-token`

## Standard tables (copy into your CRM's schema)

```sql
-- Outbound: events this CRM has emitted (or wants to).
create table public.sync_outbound_events (
  event_id            text primary key,                  -- ULID
  event_type          text not null,                     -- e.g. 'hr.employee.terminated'
  schema_version      integer not null default 1,
  target_audience     text not null,                     -- e.g. 'underwriting'
  subject_kind        text not null,
  subject_user_id     uuid,
  payload             jsonb not null,
  occurred_at         timestamptz not null default now(),
  pushed_at           timestamptz,                       -- null = unpushed
  attempts            integer not null default 0,
  next_attempt_at     timestamptz,                       -- null OR set if scheduled retry
  dead_lettered_at    timestamptz,                       -- null OR set if 4xx received
  last_error_code     integer,                           -- HTTP status of last failed attempt
  last_error_body     text                               -- truncated to 2KB
);

create index sync_outbound_events_pending_idx
  on public.sync_outbound_events(target_audience, occurred_at)
  where pushed_at is null and dead_lettered_at is null;

create index sync_outbound_events_retry_idx
  on public.sync_outbound_events(next_attempt_at)
  where pushed_at is null and dead_lettered_at is null and next_attempt_at is not null;

alter table public.sync_outbound_events enable row level security;
-- No anon-role policies — only the service-role client writes here.


-- Inbound: events this CRM has received from siblings.
create table public.sync_inbound_events (
  event_id          text primary key,                    -- de-dupe key (from envelope)
  event_type        text not null,
  schema_version    integer not null,
  emitter           text not null,                       -- which CRM sent it
  subject_kind      text not null,
  subject_user_id   uuid,
  payload           jsonb not null,
  occurred_at       timestamptz not null,                -- when the upstream change happened
  received_at       timestamptz not null default now(),  -- when this CRM accepted it
  dispatched_at     timestamptz,                         -- when the handler ran successfully
  dispatch_error    text                                 -- truncated stack/message if handler threw
);

create index sync_inbound_events_emitter_idx
  on public.sync_inbound_events(emitter, occurred_at desc);

alter table public.sync_inbound_events enable row level security;
-- Only Super Admin reads via dashboard; service role writes; no anon access.
```

## Caveats and unsolved problems

### Ordering

Events are NOT delivered in occurred_at order across multiple emitters.
Receiver-side handlers must tolerate out-of-order arrival. If your
handler genuinely needs ordering, it must reconstruct it from
`occurred_at` and process accordingly.

### Schema evolution

`schema_version` lets emitters bump payload shapes without breaking
receivers. New schema version → all receivers must be updated to
handle BOTH the old and new shapes during a transition window. After
all receivers ship the new handler, the emitter can drop the old
shape.

In practice: small additive changes (new optional fields) don't need
a schema bump. Removed or renamed required fields do.

### "What if the dashboard is down?"

Service tokens are minted by the dashboard. If the dashboard is down,
emitters can't push. The outbox accumulates. When the dashboard
recovers, the worker drains the backlog. Acceptable for a 2-3 staff
operation at this scale — Phase 1's CRM observability dashboard will
surface long-pending outbox depth as an alert.

### "What if a CRM is permanently offline?"

Set `target_audience` to that CRM and outbox rows accumulate. After 6
failed attempts, rows dead-letter. Manual cleanup if the CRM is being
decommissioned.

### "What about real-time sync?"

This pattern has end-to-end latency on the order of "cron tick + HTTP
round-trip" — likely 1 minute median, 5 minutes worst case. If you
genuinely need lower latency (e.g., HR's leave-approval UI should
immediately reflect in Underwriting's risk model), use
`crm-data-pulls.md`'s on-demand-pull pattern from the consumer side
to fetch the latest state — sync is for durable replication, pulls
are for live reads.
