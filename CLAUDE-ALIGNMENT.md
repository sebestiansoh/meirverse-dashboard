# CLAUDE.md ↔ ARCHITECTURE.md alignment audit

> Working artifact tracking divergences between the **Platform Mandate**
> ([`CLAUDE.md`](./CLAUDE.md) v1.5 · 25 May 2026) and the in-flight build
> briefs ([`ARCHITECTURE.md`](./ARCHITECTURE.md) v4.5,
> [`CRM-INVENTORY.md`](./CRM-INVENTORY.md) v4.2).
>
> The mandate wins on conflict. This document is the punchlist for
> closing each divergence — either by amending the build briefs to match,
> by re-platforming the running system, or by recording an explicit
> Principal override.
>
> **Status legend:**
> - 🔴 **Strategic decision needed** — Principal call required before the brief or code can be amended.
> - 🟡 **Auto-align in progress** — doc-level edit underway; no Principal input needed.
> - 🟢 **Aligned** — closed; tracked for history only.
> - 🔵 **Phase 2 / deferred** — applies to future surface (External Dashboard, mobile, gateway); recorded so it isn't lost.

---

## Decision log

Principal decisions captured via the alignment Q&A (2026-05-25, Round 2).
Where a decision unblocks a 🔴 conflict, the conflict's status is
updated in place below.

| # | Decision | Resolves / affects |
|---|---|---|
| D-A | **Underwriting** = separate Child under v1.5's "and others"; keep its audience entries. Subdomain TBD (likely `finance.` or a new name). | Conflict #5 sub-question; not a full close. |
| D-B | **Renames** (Conflict #1, Conflict #5) piggyback the consolidation commit. Apex move + subdomain renames happen AFTER the DB consolidation, in one coordinated commit. | Conflicts #1, #5 — sequencing decision, doesn't close them. |
| D-C | **DB consolidation now** — provision ONE `internal` Supabase + ONE `internal-staging` (covers mandate's "from day one"). Retrofit migrations onto it. Drop the per-CRM Supabase-per-repo plan. | Conflicts #3, #6, #7 — moved from 🔴 → 🟡 (auto-align in progress this session). |
| **D-D** | **Cubo / Caerus / MADE are independent org units.** ⚠ **Principal amendment to v1.5** — expands §Org units from 6 to 9. CLAUDE.md should rev to v1.6 with the three additions. | Conflict #4 — closes with 9 org units, not 6. |
| **D-E** | **Property Maintenance** = scope inside Good Class Builders. **Property Management** = scope inside Meir Collective. Both populate Internal AND External dashboards as modules within existing org units. | Conflict #4 closes; Property Mgmt + Maint NOT separate org units. |
| **D-F** | **No `propertymgmt.` subdomain.** Property Management functionally = extension of Leads (External `leads.meirverse.world`) cross-linked to ERP + Property Maintenance modules (Internal `projects.meirverse.app` per D-H). | Conflict #5 partial — `propertymgmt.meirverse.app` row deleted from inventory. |
| **D-G** | **Underwriting** = its own Internal Child at `underwriting.meirverse.app`, under v1.5's "and others" allowance. | Conflict #5 partial — Underwriting subdomain locked. |
| **D-H** | **ERP subdomain = `projects.meirverse.app`** (2026-05-28). Renames the ERP from the earlier `erp.`/`gcb-erp.` target — **supersedes D-B's `erp.` target for this Child only**. SSO `aud` claim stays `construction-erp` (deliberately decoupled from the URL, so the ERP verifier is unchanged). Other D-B renames unaffected. | Conflict #1/#5 — ERP subdomain locked to `projects.`; ERP hosted 2026-05-28. |

### Principal amendment to v1.5 (D-D)

Sebestian's answer to Q1 expands the org-unit list from 6 to 9. The
canonical 9 are:

1. Meir Homes
2. Meir Edition
3. Meir Collective
4. m.lifestyle
5. m.Atelier
6. Good Class Builders
7. **Cubo** *(new under v1.5 amendment)*
8. **Caerus** *(new under v1.5 amendment)*
9. **MADE** *(new under v1.5 amendment)*

Until CLAUDE.md is re-versioned by Sebestian (suggest v1.6 with this
in §Org units), the alignment doc is authoritative for the 9.

### Phase 1 Internal Children — final enumeration

| Subdomain | Child | Status |
|---|---|---|
| `meirverse.app` | Internal Dashboard (root) | Apex (post C-1) |
| `crm.meirverse.app` | CRM (Cluster 2 deal pipeline consolidated — 4 stages internal) | Rebuild needed |
| `projects.meirverse.app` | ERP (Construction + Property Management module + Property Maintenance module) | Hosted 2026-05-28 (D-H rename from `erp.`) — repo `meirverse-gcb-erp` |
| `hr.meirverse.app` | HR | In progress — repo `meirverse-hr` |
| `finance.meirverse.app` | Finance | Not started |
| `inventory.meirverse.app` | Inventory | Not started |
| `underwriting.meirverse.app` | Underwriting (under v1.5 "and others") | Concurrent session |

---

## 1 · Domain — apex vs subdomain 🔴

| Source | Says |
|---|---|
| Mandate §Dashboards | Internal Dashboard lives at **`meirverse.app`** (apex) |
| Mandate §Domain & naming | Children at `function.meirverse.app` (`crm.`, `erp.`, `hr.`, `finance.`, `inventory.`) |
| Current build | Dashboard deployed at **`dashboard.meirverse.app`** (subdomain) |

**Implication:** the running site is on the wrong host per mandate. Children are partially named per mandate (`hr.meirverse.app` matches; `gcb-erp.meirverse.app` does not — mandate would call it `erp.meirverse.app`).

**Decision needed:** migrate to apex now (one-shot DNS + Vercel domain swap; redirect `dashboard.meirverse.app` → apex), or carry the subdomain through Phase 1 and migrate at the Phase 1 → Phase 2 boundary?

**Decision (D-B, 2026-05-25):** rename piggybacks the DB consolidation
commit. Apex move + Vercel domain swap + redirect from
`dashboard.meirverse.app` happen AFTER consolidation lands cleanly.
Still 🔴 until executed.

---

## 2 · Permission model — Departments×Role vs per-user matrix 🟢

**Closed 2026-05-26** by commit `777724d` — new `public.user_access` matrix (per-user · module · action · company) replaces `user_departments`. Helpers `is_super_admin()` and `has_access(module, action, company)` drive every RLS policy. Legacy `user_departments` survives as a compatibility view (`100500_legacy_departments_compat.sql`) so older code keeps working during the deprecation window.

| Source | Says |
|---|---|
| Mandate §Access control | Four layers: **Super Admin · Org Admin · Ranks (no auto-grant) · End user**. Access is explicit (module × action × data-segment) and back-end managed. |
| Current build | **Departments × Role** (Director/Manager/Staff/Viewer) — role within a department implicitly grants action scope across that department |

**Implication:** the just-shipped `user_departments` table + RLS director-policies + `lib/auth/scopes.ts` role→scope mapping all assume the old model. The mandate replaces this with a per-(user, module, action, data-segment) matrix. Different shape entirely.

**Decision needed:** rewrite Phase 2.3 schema (deprecate `user_departments`, add `user_access_grants` per-user matrix) now, or treat `user_departments` as legacy and bolt the mandate's matrix on alongside?

The interim RLS-recursion fix (migration `20260525000004`) is still worth applying so the dashboard renders today — it doesn't deepen the divergence, just makes the current model functional while the strategic call is being made.

---

## 3 · Database topology — 1 project vs 4 🟢 (Phase 1) / 🔵 (Phase 2)

**Phase 1 closed 2026-05-26** by commit `777724d` — single Internal DB with `public` (dashboard) + `erp.*` + `hr.*` schemas, all sharing `auth.users`. No mirror tables. `internal-staging` still owed (Sebestian to action — Supabase dashboard create). Phase 2 (External DB + external-staging + Fly.io gateway) intentionally deferred.

| Source | Says |
|---|---|
| Mandate §Tech stack + §Environments | **Internal DB** + **External DB** + `internal-staging` + `external-staging` (4 Supabase projects, all SG region) |
| Current build | 1 Supabase project (`xwrthxehkrwmikhzqhma`, SG) — Internal DB |
| Concurrent CRM work | 3 separate Supabase projects planned (one per CRM); per-CRM mirror tables (`gcb_users`, `hr_users`) | 

**Decision (D-C, 2026-05-25):** consolidate **now**. The existing project
is the **Internal DB**. The per-CRM Supabase plan is retired. ERP + HR +
Underwriting all live as schemas within the Internal DB (one
`auth.users` table; no mirror tables). `internal-staging` provisioned in
the same session.

**Auto-align in progress this session:**
- Internal DB schema retrofit (Step 1 of execution plan below)
- `internal-staging` Supabase project create — Sebestian to action
- `external-db` + `external-staging` — Phase 2 work 🔵

---

## 4 · Org units — 12 entities vs 9 (post-D-D) 🟢

**Closed 2026-05-26** by commits `777724d` (seed) + decisions **D-D** (Cubo / Caerus / MADE added → 9) and **D-E** (Property Management + Maintenance fold as modules inside Meir Collective + GCB respectively). The Mandate at `~/Projects/CLAUDE.md` should rev to v1.6 to absorb D-D when convenient.

| Source | Org units / entities |
|---|---|
| Mandate §Org units | **6**: Meir Homes · Meir Edition · Meir Collective · m.lifestyle · m.Atelier · Good Class Builders |
| Current build (`entities` seed in migration 3) | **12** across 4 segments — also includes Property Management, Property Maintenance, Cubo, Caerus, made-commercial, made-venture |

**Mapping needed:**
| Current entity | Mandate org unit | Notes |
|---|---|---|
| `meir-homes` | Meir Homes | ✓ |
| `meir-edition` | Meir Edition | ✓ |
| `meir-collective` | Meir Collective | ✓ |
| `m-atelier` | m.Atelier | ✓ |
| `m-lifestyle` | m.lifestyle | ✓ |
| `good-class-builders` | Good Class Builders | ✓ |
| `property-mgmt` | — | Fold under Meir Collective as a module? Or another unit? 🔴 |
| `property-maint` | — | Same question 🔴 |
| `cubo` · `caerus` · `made-venture` · `made-commercial` | — | Removed from mandate org units. Status? 🔴 |

**Decision needed:** confirm 6 is final and decide where the unmapped entities go (fold-as-module, sunset, or treat as exception-class).

---

## 5 · CRM subdomain naming 🟡

| Current (CRM-INVENTORY v4.2) | Mandate-compliant |
|---|---|
| `hr.meirverse.app` | `hr.meirverse.app` ✓ |
| `gcb-erp.meirverse.app` | `projects.meirverse.app` (D-H 2026-05-28 — supersedes the earlier `erp.` target) |
| `termsheet.` · `engagement.` · `prospect.` · `specsheet.` | likely **consolidate into `crm.meirverse.app`** with stages as routes inside (mandate forbids parallel subdomains for one function) |
| `propertymgmt.meirverse.app` | depends on Conflict #4 resolution |
| (none yet) | `finance.meirverse.app` (mandate lists; not yet built) |
| (none yet) | `inventory.meirverse.app` (mandate lists; not yet built) |

**Decision needed:** confirm consolidation of the four Cluster 2 stages into a single `crm.` host. If yes, the Cluster 2 shared-DB design from ARCHITECTURE §8 maps cleanly (one DB, one UI with stage filters — was already the architecture, just unifies the URL).

**Decision (D-A, D-B, 2026-05-25):**
- Underwriting kept as separate Child; subdomain TBD (likely `finance.` or its own name).
- All renames piggyback the consolidation commit (D-B) — `gcb-erp.` → `projects.` (per **D-H**, 2026-05-28; was `erp.`), Cluster 2 → `crm.`, dashboard apex move all happen together AFTER the DB consolidation lands.

---

## 6 · `company` column on every primary table 🟢

**Closed 2026-05-26** by commit `777724d` — every primary table in `public`, `erp.*`, `hr.*` carries a `company` column FK'd to `public.company`. Holdco-scoped shared-services rows use the `holdco` sentinel.

| Source | Says |
|---|---|
| Mandate §Data model | *"Every primary table in both DBs carries a `company` column. If a migration omits it, that is a bug."* |
| Current build (migration 1) | No `company` columns on `tasks`, `notes`, `quick_launch`, `announcements`, `feedback`, `sso_issuances` |

**Auto-align:** queue a follow-up migration (`20260525000005_company_column_backfill.sql`) following the mandate's **expand-then-contract** pattern:
1. Add `company text` nullable on each primary table
2. Default value `null` for global/holdco-scoped rows; backfill `meir.sg` placeholder once org units stabilise
3. Deploy code to write `company` on insert
4. Backfill historical
5. Add NOT NULL constraint in a later migration

**Defer:** until Conflict #4 (the 6 org units) is locked, because the column's allowed values depend on it.

---

## 7 · Migration discipline — staging soak 🟡

| Source | Says |
|---|---|
| Mandate §Environments + §Deploy | Staging soak ≥ 24h before production. Direct-to-prod forbidden unless emergency hotfix. |
| Current build | Direct-to-prod migrations via Supabase SQL Editor (we just did this for Phase 2.3 + the upcoming RLS fix) |

**Implication:** today's RLS-recursion fix should soak in staging first per mandate. Treating today's deploy as the final pre-mandate operation; from the alignment commit forward, **no production migrations without a staging soak unless Principal-declared hotfix**.

**Decision (D-C, 2026-05-25):** `internal-staging` Supabase project to be
provisioned in this session alongside Internal DB. From the consolidation
commit forward, every new migration:
1. Lands on `internal-staging` first via `supabase db push` against staging ref.
2. Soak ≥ 24h.
3. Production push via separate workflow_dispatch.

Today's RLS-recursion fix is the **last hotfix-class direct-to-prod** —
explicitly grandfathered.

---

## 8 · Fly.io API gateway 🔵

| Source | Says |
|---|---|
| Mandate §Channels | Mandatory for cross-DB calls, third-party integrations, and mobile clients |
| Current build | No gateway |

**Why it doesn't break Phase 1:** the Internal Dashboard speaks only to the Internal DB, with no third-party calls and no mobile client yet. The gateway becomes a hard prerequisite once Phase 2 begins (cross-DB reads to External DB).

**Auto-align:** add to the Phase 1 → Phase 2 transition checklist.

---

## 9 · External Dashboard — `meirverse.world` 🔵

Entirely new platform per mandate §Dashboards. Magic-link auth, no domain whitelist, separate design system, separate DB, zero-base-access until explicit Project / POS assignment.

Out of scope for today. Recorded for completeness.

---

## 10 · Tooling — Sentry · UptimeRobot · GitHub Actions CI 🟡 (Sentry + UptimeRobot pending; CI 🟢)

**CI portion closed 2026-05-26** by commit `a885b3f` — GitHub Actions runs typecheck + lint + build on every PR and `main` push. Sentry + UptimeRobot still on the punchlist for this session.

| Source | Says |
|---|---|
| Mandate §Observability & CI | All required, every Child |
| Current build | None of the above wired |

**Auto-align:** add to the Phase 1 closure checklist. Sentry + UptimeRobot are small lifts (env vars + npm package + 1 endpoint each); CI lint+test+build on every PR is a 1-file `.github/workflows/ci.yml` add.

---

## 11 · Mobile · Expo SDK · OTA cadence 🔵

Phase-2-or-later concern. No mobile client built; mandate's RN+Expo + quarterly SDK bump + OTA-first releases recorded for the eventual build.

---

## 12 · System of Record vs 2-way sync infra 🟡

| Source | Says |
|---|---|
| Mandate §Data model | **SoR rule**: every entity has exactly one DB that is its canonical home. The other DB never holds the master copy. Cross-DB display via the API — *no caching, mirroring, or duplication*. |
| Current build | 2-way sync infra built earlier today: `sync_outbound_events`, `sync_inbound_events`, 10+ event-type registry, RS256 service tokens, inbound webhook receivers in HR + ERP. **Event-driven mirroring between sibling CRMs** — replicates state across DB boundaries. |

**Implication:** within Internal DB (where HR + ERP both live after Conflict #3 closes), the sync infra is **redundant** — a direct SQL JOIN between `hr.employees` and `erp.project_members` is the SoR-compliant pattern. The sync infra would only apply to Internal ↔ External crossings, which the mandate requires to go through the Fly.io gateway (Conflict #8) anyway.

**Auto-align (this session):**
1. Tag the sync code in `meirverse-hr` and `meirverse-gcb-erp` as "Phase 2 cross-DB use only". Do not emit any within-Internal-DB events from Phase 1 code.
2. The `sync_outbound_events` + `sync_inbound_events` tables stay in the schema migrations — harmless, and a useful audit trail when they're switched on for cross-DB use.
3. The dashboard's `mint-service-token` endpoint stays — same auth surface works for cross-DB calls via the gateway.
4. Update `docs/2-way-sync.md` with a top banner: "Phase 2 cross-DB infrastructure. Do NOT use for within-DB sync — that's a direct SQL JOIN."

---

## 13 · Uploads must offer Local + Google Drive + Google Photos 🟡

| Source | Says |
|---|---|
| Mandate §Uploads | *"Every upload control must offer three sources: Local · Google Drive · Google Photos."* |
| Current build | No upload UI built yet (ERP Item photos + HR documents are Phase 1 features) |

**Auto-align:** When the first upload control lands (likely ERP Items
photo upload in Phase 1), build a reusable `<UploadPicker>` component
with the three-source affordance. Share it across both CRMs.

---

## 14 · Expand-then-contract migrations 🟡

| Source | Says |
|---|---|
| Mandate §Schema migrations | Default pattern for any schema change. Six explicit steps from additive add to drop-old. |
| Current build | Local dev uses drop-and-recreate (acceptable for pre-prod schema design); production migrations not yet exercised. |

**Auto-align (discipline):** Once consolidation lands and production
sees its first real data, every schema change adopts the six-step
pattern. Tracked here as a process commitment, not a code change.

---

## 15 · Cellar CRM migration 🔵

Mandate §Migration & exceptions covers this explicitly:
- `cellar.meir.sg` → rebuilt on Internal stack → `cellar.meirverse.app`
- Existing instance grandfathered until cutover

Tracked separately from the conflict ledger. Not in this session's
scope.

---

## What gets done now (this session)

Cumulative across the alignment + consolidation work:

1. ✅ Mandate adopted at repo root + global (`~/.claude/CLAUDE.md` + all 3 repos).
2. ✅ This alignment doc captures the punchlist (this commit + the user's earlier auto-align banners).
3. ✅ Subordination banners on `ARCHITECTURE.md` + `CRM-INVENTORY.md`.
4. ✅ Decision log + status updates for conflicts #1, #3, #5, #6, #7 per D-A / D-B / D-C.
5. ✅ New conflicts #12 (SoR vs sync infra), #13 (upload picker), #14 (expand-then-contract), #15 (Cellar) added.
6. ✅ **Step 1 — DB consolidation** (per D-C). Landed 2026-05-25:
   - Unified Internal DB migration set in `meir-dashboard/supabase/migrations/`:
     `20260525100010_company_catalog.sql` (9 org units per D-D) ·
     `20260525100020_user_profiles.sql` ·
     `20260525100030_user_access_matrix.sql` (new per-user matrix per Conflict #2) ·
     `20260525100040_dashboard_schema.sql` (with `company` column per Conflict #6) ·
     `20260525100100_erp_schema.sql` (`erp.*` Postgres schema, 17 tables) ·
     `20260525100200_hr_schema.sql` (`hr.*` Postgres schema, 5 tables) ·
     `20260525100300_sync_infrastructure.sql` (tagged Phase-2-cross-DB-only per Conflict #12) ·
     `20260525100400_rls_policies.sql` (all RLS keyed off `user_access` + `company`) ·
     `20260525100500_legacy_departments_compat.sql` (transitional shim for dashboard app code until Conflict #2 rewrite) ·
     `20260525100900_seed.sql` (9 companies + modules + leave types + ERP taxonomies)
   - Old per-CRM migrations archived to `supabase/migrations/_legacy/` in all 3 repos.
   - `gcb_users` + `hr_users` mirror tables retired — all FKs now reference `auth.users` directly.
   - `meirverse-gcb-erp` + `meirverse-hr` `.env.local.example` files updated to share Internal DB connection.
   - `lib/sso/user-sync.ts` in both CRMs rewritten as a READ-only resolver against `public.user_profiles` (no upsert — SoR violation).
   - `lib/sync/inbound-dispatch.ts` handlers retagged "Phase 2 cross-DB only" with notes pointing at the Phase 1 SQL JOIN path.
   - typecheck + lint + build all green across 3 repos.

## What needs Principal decisions (before Step 1 executes)

Six open questions for Step 1's details:

| Q | Question | Answered |
|---|---|---|
| Q1 | Conflict #4 — Cubo / Caerus / MADE: confirmed retired from v1.5's org-unit list? Catalog deletes them entirely? | ✅ D-D: independent org units (9 total) |
| Q2 | Conflict #4 — Property Mgmt / Property Maint / Sub-brands: fold to modules inside Good Class Builders / Meir Collective, OR new org units? | ✅ D-E: Property Maint inside GCB; Property Mgmt inside Meir Collective. Sub-brands TBD. |
| Q3 | Conflict #5 — Property Mgmt subdomain: `inventory.`? `erp.` module? Its own Child? | ✅ D-F: no dedicated subdomain — extends Leads + ERP + Property Maintenance modules |
| Q4 | Conflict #5 — Underwriting subdomain: `finance.`? Its own Child name? | ✅ D-G: `underwriting.meirverse.app` under "and others" |
| Q5 | Conflict #2 — Per-user access matrix UI: draft the layout (rows × cols of modules × actions) before building schema? | Deferred — non-blocking for migration design; schema in §C-2 sketch is implementable, UI can follow |
| Q6 | Conflict #3 — Schema layout preference: Postgres schemas (`erp.projects`) vs flat with prefix (`erp_projects`). | **Default applied:** Postgres schemas. Cleaner `search_path` and per-Child RLS, no real downside. Override by Principal note if otherwise preferred. |

### Sub-brands (under D-E, not yet decided)

Sub-brands under Residential (mentioned in ARCHITECTURE.md §2 as "TBD"
inside Meir Homes / Meir Edition) are unaddressed by D-E. Defer as
Q-future until a sub-brand concretely needs to exist as a distinct
data segment. Until then, all rows go under their parent org unit
(`meir-homes` or `meir-edition`).

## What auto-aligns once Step 1 lands

- Conflict **#6** (`company` column) — added in the unified migration set; no separate work.
- Conflict **#7** (staging soak) — new migration discipline kicks in from this point.
- Conflict **#10** (Sentry / UptimeRobot / CI) — wireable in parallel.

## What stays deferred (Phase 2 / later)

- Conflicts **#3 Phase 2 leg** (External DB), **#8** (Fly.io gateway), **#9** (External Dashboard), **#11** (mobile), **#13's three-source picker hardening** for External Dashboard cases.
