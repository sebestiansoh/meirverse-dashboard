> ⚠ **Subordinate to the Platform Mandate.** This catalog predates
> [`CLAUDE.md`](./CLAUDE.md) v1.5 (25 May 2026), which redefines Children
> naming as `function.meirverse.app` — meaning `gcb-erp.` becomes `erp.`,
> the four Cluster 2 stage-subdomains likely consolidate into one
> `crm.meirverse.app`, and two Children (`finance.`, `inventory.`) are
> named into Phase 1 scope. See
> [`CLAUDE-ALIGNMENT.md`](./CLAUDE-ALIGNMENT.md) Conflict #5 for the
> mapping table. This inventory remains the working catalog for in-flight
> retrofit and rebuild work until each row's mandate-name is locked in.

# CRM Inventory · Meirverse Dashboard SSO Bridge (v4)

**Purpose:** Single source of truth for every operational system under `*.meirverse.app` that needs SSO via the dashboard.

**Status:** 7 core CRMs across 3 clusters + reserved Cluster 4 · subordinate to CLAUDE.md v1.5

---

## CRM cluster overview

| Cluster | Entity scope | Architecture pattern | Status |
|---|---|---|---|
| **Cluster 1 · Group-wide** | All Meirverse entities (incl. Cubo, Caerus, MADE) | Standalone CRM, own DB | HR — Planned (Phase A) |
| **Cluster 2 · Deal pipeline** | Homes / Edition / Collective / Atelier (Venture Builds entities can join via `cluster_entities`) | **Shared DB, 4 UIs** | 2 built, 2 planned |
| **Cluster 3 · Asset lifecycle** | Mixed (H+E+C+A for Construction; Collective-only for Property Mgmt) | Each standalone, own DB | 1 built, 1 planned |
| **Cluster 4 · Financial · Underwriting** | Cross-entity (insurance covers staff across all Meirverse entities) | Standalone CRM, own DB · **2-way sync with HR** | Phase 0 in concurrent session 2026-05-25 |
| **Cluster 5 · m.lifestyle suite** | m.lifestyle | TBD | **Deferred** |

**Venture Build entities (Cubo, Caerus, MADE):** Full Meirverse entities in administrative terms — they plug into Cluster 1 (HR) at launch and can be added to Cluster 2 or Cluster 3 via `cluster_entities` if/when needed. No dedicated operational subdomains at launch.

**Inter-CRM 2-way sync.** Sibling CRMs exchange domain events via the outbox pattern documented in [`docs/2-way-sync.md`](./docs/2-way-sync.md). HR ↔ Underwriting is the active integration (employee roster/status/salary ↔ policy/risk-flag). HR ↔ ERP and ERP ↔ Underwriting are planned per the event-type registry in that doc. Dashboard mints short-lived RS256 service-token JWTs via `POST /api/sso/mint-service-token`; each CRM holds an HMAC bearer (`SVC_PRINCIPAL_SECRET_<EMITTER>`) for principal identification.

---

## Full inventory

| # | Cluster | Subdomain (working) | Internal name (working) | Function | Status | Stack | Auth | Audience claim |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | `hr.meirverse.app` | Meirverse HR (**primary tile**) | Personnel, leave, benefits, documents | **Phase 0 scaffolded 2026-05-25 · SSO landing live, schema applied · module work pending** | Next.js 14 + Supabase Postgres + iron-session + jose verifier (Vercel-hosted) | Bridge-only (SSO from dashboard) | `hr` |
| 2 | 2 | `termsheet.meirverse.app` | Termsheet | Deal pipeline stage 1 | **Built** | **TBD — recon needed** | **TBD — recon needed** | `termsheet` |
| 3 | 2 | `engagement.meirverse.app` | Engagement Letter | Deal pipeline stage 2 | **Built** | **TBD — recon needed** | **TBD — recon needed** | `engagement` |
| 4 | 2 | `prospect.meirverse.app` | Prospect DB | Deal pipeline stage 3 | Planned | Next.js + Supabase | Bridge-only | `prospect-db` |
| 5 | 2 | `specsheet.meirverse.app` | Spec Sheet | Deal pipeline stage 4 (onboarding) | Planned | Next.js + Supabase | Bridge-only | `spec-sheet` |
| 6 | 3 | `gcb-erp.meirverse.app` | Construction ERP (GCB ERP) | Project delivery (H+E+C+A) | **Built once (Vite+Workers+D1, 2026-05-20); rebuild in progress on Next.js + Supabase + Vercel — see detail sheet** | Next.js 14 + Supabase Postgres + Supabase Storage (Vercel-hosted) | Bridge-only (SSO from dashboard) | `construction-erp` |
| 7 | 3 | `propertymgmt.meirverse.app` | Property Management | Tenant management, maintenance (Collective-only) | Planned | Next.js + Supabase | Bridge-only | `property-mgmt` |
| 8 | 4 | `underwriting.meirverse.app` | Underwriting | Insurance underwriting · policy lifecycle · risk decisioning · **2-way sync with HR** for staff coverage | **Phase 0 scaffolding in concurrent session 2026-05-25** | Next.js + Supabase (recommended) | Bridge-only · plus service-token receiver for sync | `underwriting` |

**Note:** All working names should be replaced with real product names before Phase 2.5.

---

## Reconnaissance checklist for built CRMs

Three built CRMs need information gathering before retrofit. Send the same six-question form to whoever built (or maintains) each one.

### Six-question form

```
CRM: [Termsheet / Engagement Letter / Construction ERP]

Q1. What framework/language is this built on?
    (e.g. Next.js, Rails, Django, Laravel, Bubble, Retool, WordPress)
    Answer: _________________

Q2. What's the current login method?
    (e.g. email+password, magic link, Google OAuth, Microsoft OAuth, hardcoded)
    Answer: _________________

Q3. Where is the source code stored?
    (GitHub URL, no-code platform name, "lost — only deployed version exists")
    Answer: _________________

Q4. Where does the database live?
    (Supabase, Firebase, MongoDB, MySQL, no separate DB)
    Answer: _________________

Q5. Approximately how many active users does it have today?
    Answer: _________________

Q6. Who has admin access today?
    Answer: _________________
```

### Why each question matters

| Question | Decision it unblocks |
|---|---|
| Q1 Framework | Which JWT library; what `/auth/sso` route looks like |
| Q2 Auth method | Migration strategy; whether to keep fallback login |
| Q3 Source code | Whether retrofit is feasible at all |
| Q4 Database | Whether email-by-lookup works; schema modification needed |
| Q5 Active users | Whether to auto-migrate all users or require fresh enrolment |
| Q6 Admin access | Who owns the retrofit work |

### Worst case: "No source code, only deployed version exists"

If a built CRM has no accessible source code:
- Cannot retrofit cleanly
- Options: (a) rebuild from scratch as a planned CRM, (b) password-injection workaround (NOT recommended), (c) exclude from dashboard SSO
- For Cluster 2 CRMs (Termsheet, Engagement Letter) this is *worse* than for Construction ERP — Cluster 2 needs full data migration to shared `deals` table regardless, so a rebuild may even be the right call

---

## Migration strategy by existing-auth type

### Email + password
- Add `/auth/sso` endpoint creating session for JWT's email
- Keep password login as fallback 30 days post-cutover
- Match users by full email (case-insensitive) — auto-create if no match
- After 30 days, optionally disable password login

### Google OAuth (own integration)
- Add `/auth/sso` endpoint
- Remove independent Google OAuth — dashboard is now sole Google trust point
- Match by email; no auto-create needed (existing users already use Google)

### Microsoft OAuth
- Same pattern as Google OAuth — replace with dashboard SSO bridge

### Magic link / OTP
- Add `/auth/sso` endpoint
- Keep magic links as fallback for users locked out of dashboard
- Lowest-friction migration

### Hardcoded admin / no real auth
- Add `/auth/sso` endpoint as primary login
- Add `users` table if none exists
- Set roles from JWT claims (use `departments` array)
- Highest-risk retrofit — test thoroughly in staging

---

## Per-CRM detail sheets

### Cluster 1 · Group-wide

#### Meirverse HR (Phase 0 scaffolded · primary tile)

- Subdomain: `hr.meirverse.app`
- Function: Personnel, leave, benefits, documents. **Payroll out of scope** — AutoCount is the system of record for money per ARCHITECTURE §1.
- Status: **Phase 0 done 2026-05-25.** SSO bridge landing verifies dashboard JWTs end-to-end; 5-table schema (hr_users mirror, employees, leave_types, leave_balances, leave_requests, employee_documents) applied to local; module work pending Phase 1.
- Audience claim: `hr`
- Stack: Next.js 14 (App Router) + TypeScript strict + Tailwind 3 + Supabase Postgres + iron-session + jose verifier — same template as the GCB ERP rebuild.
- Repo: https://github.com/sebestiansoh/meirverse-hr (private)
- Local path: `~/Projects/hr/`
- Database: Separate Supabase project (Singapore) — provisioned by Sebestian.
- Existing auth: None — bridge-only from day 1.
- **Featured tile in dashboard Quick Launch** (decision 2026-05-25: HR is the primary tile that staff click first because it covers leave / docs / employee profile — the cross-cutting daily concerns).

**Build plan (Phase 1+):**
- [x] ~~Define data model~~ — Phase 0 covers employees, leave (types + balances + requests), documents. Appraisals + onboarding + benefits in Phase 2.
- [x] ~~Create Next.js project, set up Supabase Singapore, add `/auth/sso`, implement JWKS verification~~ — Phase 0.
- [x] ~~Add to dashboard quick-launch tiles~~ — `featured: true` in `lib/auth/audiences.ts`.
- [ ] **Phase 1 RLS policies** via custom-JWT pattern (since CRM doesn't use Supabase Auth, `auth.uid()` isn't populated — mint a Supabase-signed JWT containing `hr_users.user_id` at session-establishment, send as Authorization header, RLS reads it via `current_setting('request.jwt.claims')`).
- [ ] **Phase 1 UI**: own-leave-request page + leave balance dashboard + employee directory.
- [ ] **Phase 2 Director workflows**: approve/reject leave requests, manage entitlements, edit employee records.
- [ ] **Phase 3 Documents**: upload + sensitivity-tagged retrieval. Appraisals. Onboarding checklist.
- [ ] **Phase 4 cross-CRM pulls**: HR pages pull ERP project-assignment data inline via server-to-server pattern — see [`docs/crm-data-pulls.md`](./docs/crm-data-pulls.md). Requires the ERP to ship HTTP `/api/...` endpoints first.
- [ ] Test all 4 department roles end-to-end. Deploy to Vercel. Add `hr.meirverse.app` custom domain.

---

### Cluster 2 · Deal pipeline (shared DB)

**Architecture:** Single Supabase project with one shared `deals` table. Four UIs read/write the same records, each scoped to its stage. Real-time updates flow between UIs via Supabase subscriptions.

#### Cluster 2 shared schema design (Week 8–9)

```sql
-- The one shared table
create table deals (
  id uuid primary key default gen_random_uuid(),
  brand text check (brand in ('homes','edition','collective','atelier')),
  stage text not null check (stage in (
    'termsheet', 'engagement', 'prospect', 'specsheet', 'closed', 'lost'
  )),
  prospect_name text,

  -- Termsheet stage fields
  termsheet_value_sgd numeric,
  termsheet_property text,
  termsheet_signed_at timestamptz,
  termsheet_signed_by uuid references auth.users(id),

  -- Engagement Letter stage fields
  engagement_signed_at timestamptz,
  engagement_signed_by uuid references auth.users(id),
  engagement_fee_sgd numeric,

  -- Prospect DB stage fields
  prospect_source text,
  prospect_qualification jsonb,

  -- Spec Sheet stage fields
  client_preferences jsonb,
  client_spec_locked_at timestamptz,

  -- Common
  encrypted_notes text,  -- AES-GCM
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  owner_user_id uuid references auth.users(id),
  brand_assignments jsonb default '{}'::jsonb
);

create index on deals(stage);
create index on deals(brand);
create index on deals(owner_user_id);
create index on deals(updated_at desc);

-- Audit trail for stage transitions
create table deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_at timestamptz default now(),
  changed_by uuid references auth.users(id),
  notes text
);
```

#### Termsheet (Built · needs migration)

- Subdomain: `termsheet.meirverse.app`
- Function: Initial feasibility study, deal value, property identification
- Audience claim: `termsheet`
- **Status:** Built — must migrate data + UI to shared schema in Phase B
- Stack: **TBD — recon needed**
- Existing auth: **TBD — recon needed**

**Migration plan:**
- [ ] Reconnaissance (6 questions above)
- [ ] Map existing data fields to `deals` table columns
- [ ] Write migration script: existing DB → shared `deals` table
- [ ] Build new Next.js UI reading/writing shared `deals` table (filtered to `stage='termsheet'`)
- [ ] Add `/auth/sso` route
- [ ] Run parallel for 1 week (both old + new), then cutover
- [ ] Decommission old database

#### Engagement Letter (Built · needs migration)

- Subdomain: `engagement.meirverse.app`
- Function: Formal engagement, fees, service scope
- Audience claim: `engagement`
- **Status:** Built — must migrate data + UI to shared schema in Phase B
- Stack: **TBD — recon needed**
- Existing auth: **TBD — recon needed**

**Migration plan:** identical pattern to Termsheet, but for stage 2.

#### Prospect DB (Planned)

- Subdomain: `prospect.meirverse.app`
- Function: Qualified prospects, lead source tracking, qualification scoring
- Audience claim: `prospect-db`
- Status: Planned — greenfield

**Build plan:** Next.js + Supabase, bridge-only auth, reads/writes shared `deals` table filtered to `stage='prospect'`.

#### Spec Sheet (Planned)

- Subdomain: `specsheet.meirverse.app`
- Function: Client preferences, requirements gathering, signed spec
- Audience claim: `spec-sheet`
- Status: Planned — greenfield

**Build plan:** Next.js + Supabase, bridge-only auth, reads/writes shared `deals` table filtered to `stage='specsheet'`.

---

### Cluster 3 · Asset lifecycle

#### Construction ERP / Projects ERP (Rebuild in progress)

- Subdomain: `gcb-erp.meirverse.app`
- Function: Project delivery, construction management for Good Class Builders
- Brand scope: H + E + C + A (entity_id `good-class-builders`)
- Audience claim: `construction-erp`
- **Status:** Standalone build at `~/code/gcb-erp` was scaffolded and deployed on 2026-05-20 (Vite + React + Cloudflare Workers + D1 + R2). **Pivot 2026-05-24** — re-scoped as Child 2 of this dashboard; old build paused (see [`~/code/gcb-erp/PIVOT-NOTE.md`](../../code/gcb-erp/PIVOT-NOTE.md)), rebuild in progress on the standard dashboard CRM stack.
- Stack (new): Next.js 14 (App Router) + TypeScript + Tailwind 3 + Supabase Postgres (Singapore) + Supabase Storage + Vercel + Cloudflare Access
- Existing auth (old standalone): Custom JWT signed by Cloudflare Worker — abandoned in pivot
- New auth: SSO bridge only — verifies dashboard-signed JWT via JWKS

**Reconnaissance — already answered (from the legacy build):**

| Question | Answer |
| -------- | ------ |
| Q1 Framework / language | **Was** Vite + React 18 + TS + Cloudflare Workers (Hono). **Now rebuilding to** Next.js 14 + TS to match dashboard CRM pattern. |
| Q2 Current login method | None in production — only the placeholder is deployed. The legacy custom-JWT plan is dropped. |
| Q3 Source code location | **Rebuild:** https://github.com/sebestiansoh/meirverse-gcb-erp (private, scaffolded 2026-05-25 — Next.js 14 + Supabase + iron-session + jose verifier, end-to-end Phase 0 with /auth/sso landing live). **Legacy:** https://github.com/sebestiansoh/gcb-erp (private, will be archived once rebuild reaches parity). |
| Q4 Database location | **Was** Cloudflare D1 (`gcb-erp-production`, APAC, id `b90d5e04-e498-4fb9-9605-98bd83a183a7`) with full 17-table schema applied. **Now moving to** Supabase Postgres (Singapore) — new project to be created during rebuild. |
| Q5 Active users today | 0 (placeholder only, never went live) |
| Q6 Who has admin access today | Sebestian only — Cloudflare wrangler-authenticated; legacy GitHub Actions secrets in place. |

**Schema source of truth.** The canonical type definitions live at
[`~/code/gcb-erp/migration-spec/02-data-schema.ts`](../../code/gcb-erp/migration-spec/02-data-schema.ts)
and the SQLite migration at
[`~/code/gcb-erp/workers/migrations/0001_init.sql`](../../code/gcb-erp/workers/migrations/0001_init.sql).
Both carry over directly to the rebuild — translate SQLite → Postgres
(boolean columns, `jsonb` for JSON-shaped TEXT, `gen_random_uuid()` for
PKs, RLS policies added per dashboard pattern).

Note the FK ordering quirk: `subcon_claims.payment_cert_id` references
`payment_certs(id)`, so `payment_certs` must be declared first. The
original `02-data-schema.ts` listed them in the wrong order; the
SQLite migration already reorders. Carry the reorder into the
Postgres migration.

**Rebuild plan (when dashboard Phase 2.5 SSO bridge lands, weeks 5-7):**
- [ ] Create new Next.js 14 + TS + Tailwind 3 repo (sibling to meir-dashboard)
- [ ] Create new Supabase project in Singapore region
- [ ] Translate `0001_init.sql` (SQLite) → Postgres migration files under `supabase/migrations/`
- [ ] Add RLS policies to all 17 tables — non-negotiable
- [ ] Wire Supabase Storage bucket `gcb-erp-photos` (replaces R2)
- [ ] Add `/auth/sso` route as the ONLY auth path
- [ ] Install JWKS client; verify against `https://dashboard.meirverse.app/.well-known/jwks.json`
- [ ] Match users by full email; auto-create on first SSO arrival
- [ ] Map `departments` claim: `operations` role grants project access; `director` → admin scope inside ERP
- [ ] Honour `super_admin: true` claim (Sebestian bypass)
- [ ] Add `sso_issuances` audit log entry on every SSO landing
- [ ] Carry over the project-level deletion-restriction `.claude/settings.json` from `~/code/gcb-erp/`
- [ ] Test all 4 roles end-to-end
- [ ] Deploy to Vercel; add `gcb-erp.meirverse.app` custom domain
- [ ] Configure Cloudflare Access policy in front of the deployment (Layer 1 of the 3-layer auth)
- [ ] Add Quick Launch tile in dashboard
- [ ] When at parity: archive `~/code/gcb-erp` on GitHub; tear down Cloudflare Pages, Worker, D1, R2 via Sebestian-run wrangler commands (Claude can't — deletion is denied)

**No password-login fallback needed** — the legacy build never had real
users on it.

#### Property Management (Planned)

- Subdomain: `propertymgmt.meirverse.app`
- Function: Tenant management, maintenance schedules
- Brand scope: Collective-only
- Audience claim: `property-mgmt`
- Status: Planned — greenfield

**Build plan:** Next.js + Supabase (separate project from Cluster 2), bridge-only auth, scoped to Collective properties only.

---

## Cluster 4 · m.lifestyle suite (deferred)

m.lifestyle operates a different business model (physical products: display goods, essential oils) vs. property advisory. Requires its own:

- Inventory schema
- Order management
- Fulfillment tracking
- Customer database (not deal database)
- Possibly integrations with e-commerce platforms, courier APIs, payment gateways

Out of scope for Phase A through E. Revisit after Milestone 2.

---

## Venture Builds entities (administrative integration)

Cubo, Caerus, and MADE are full Meirverse entities in the central `entities` catalog. They are NOT external portfolio companies. Their administrative needs (HR, accounting, admin) are met by the same Cluster 1 + AutoCount infrastructure every other Meirverse entity uses.

| Entity ID | Display name | Segment | Phase A clusters | Operational subdomain |
|---|---|---|---|---|
| `cubo` | Cubo | venture-builds | Cluster 1 (HR) | None at launch |
| `caerus` | Caerus | venture-builds | Cluster 1 (HR) | None at launch |
| `made-venture` | MADE (Venture) | venture-builds | Cluster 1 (HR) | None at launch |

### How they participate

- **Cluster 1 (HR):** Cubo/Caerus/MADE staff appear in the HR system the same way Meir Homes staff do — onboarding, leave, benefits all flow through the HR CRM
- **AutoCount:** Each entity is set up as its own organisation in AutoCount; accounting leads access via the Quick Launch tile
- **Cluster 2 (Deal pipeline):** If/when a Venture Builds entity needs to pitch supply chain services to a client, an `insert into cluster_entities values ('cluster-2', 'cubo')` is enough — no schema change. UI updates to surface the new entity in stage filters
- **Cluster 3 (Asset lifecycle):** Same pattern — add via `cluster_entities` if Construction ERP needs to track Venture Builds projects
- **Dashboard segment view:** All three appear in the Venture Builds segment card; users can drill in to see each entity's status

### MADE in two segments

MADE appears in both Commercial and Venture Builds segments. Default treatment: two separate entries in the `entities` catalog (`made-commercial` and `made-venture`). If they're the same legal entity, merge later via a database update. If they're operationally distinct, keep separate.

### When to provision an operational subdomain

Trigger conditions for graduating a Venture Builds entity to its own operational subdomain (e.g. `cubo.meirverse.app`):

- The entity has staff who need a dedicated operational CRM (not just HR/admin)
- The entity has client-facing workflows that don't fit existing Cluster 2/3 CRMs
- Sebestian decides the operational scale warrants the infrastructure split

None of these apply at launch. Revisit per-entity after Milestone 2.

---

## SSO rollout sequence

### Phase A (Weeks 5–7)
**Slot 1:** Construction ERP **rebuild** (was retrofit; pivot 2026-05-24 — see Construction ERP detail sheet). Now a greenfield Next.js + Supabase build with `/auth/sso` as the only auth path. Reconnaissance complete; schema lifts from `~/code/gcb-erp/migration-spec/02-data-schema.ts`. The legacy Vite + Cloudflare deploy at `~/code/gcb-erp` stays up as a paused reference until the rebuild reaches parity.
**Slot 2:** HR greenfield build

### Phase B (Weeks 8–14)
1. Termsheet migration + rebuild
2. Engagement Letter migration + rebuild
3. Prospect DB greenfield
4. Spec Sheet greenfield

### Phase D (Weeks 13–16, overlaps Phase B end)
5. Property Management greenfield

---

## Open inventory questions

| Item | Status |
|---|---|
| Real names for all 7 CRM subdomains (replace placeholders) | Slot 6 (Construction ERP) confirmed `gcb-erp.meirverse.app` (2026-05-24). Slots 1–5, 7 still pending. |
| Reconnaissance: Construction ERP (6 questions) | ✅ Answered 2026-05-24 — see detail sheet. Legacy standalone build paused; rebuild on Next.js + Supabase + Vercel scheduled for dashboard Phase A weeks 5-7. |
| Reconnaissance: Termsheet (6 questions) | Pending — gate for Week 9 |
| Reconnaissance: Engagement Letter (6 questions) | Pending — gate for Week 10 |
| Cluster 2 `deals` schema fields per stage (detailed) | Pending — Week 8 |
| Whether Venture Builds entities need Cluster 2 or 3 participation at launch | Default: Cluster 1 only |
| Sub-brands under Residential — names? | Pending |
| Whether any CRM needs password login retained permanently | Pending |
| Whether external clients also have logins to any CRM | Pending |

---

*Document version 4.4 · 25 May 2026 · Cluster 4 added (Underwriting) — Phase 0 scaffolded in a concurrent Claude Code session; registered in dashboard `lib/auth/audiences.ts` under aud `underwriting`. 2-way sync contract added at `docs/2-way-sync.md` covering HR ↔ Underwriting (employee roster/status ↔ policy/risk-flag), with outbox pattern, RS256 service-token JWTs, idempotent inbound webhook, event-type registry. HR (row 1) implements the contract Phase 0; Underwriting needs to implement the receiver side per the concurrent session.*

*Document version 4.3 · 25 May 2026 · HR (row 1) Phase 0 scaffolded; primary/featured tile in Quick Launch per access-logic decision; Construction ERP (row 6) Phase 0 also scaffolded same day*

*Document version 4.2 · 24 May 2026 · Construction ERP (row 6) subdomain confirmed `gcb-erp.meirverse.app`; legacy standalone build at `~/code/gcb-erp/` being torn down; rebuild on Next.js + Supabase + Vercel scheduled for dashboard Phase A weeks 5-7*

*Document version 4.1 · 24 May 2026 · Construction ERP (row 6) reconnaissance complete: legacy Vite + Cloudflare Workers + D1 standalone build at `~/code/gcb-erp/` paused, rebuild scheduled on Next.js + Supabase + Vercel for dashboard Phase A weeks 5-7*

*Document version 4 · 21 May 2026 · Venture Builds entities corrected to full Meirverse citizens · Ventures tracker section replaced with administrative-integration model*
