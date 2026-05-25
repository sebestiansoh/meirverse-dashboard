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

## 1 · Domain — apex vs subdomain 🔴

| Source | Says |
|---|---|
| Mandate §Dashboards | Internal Dashboard lives at **`meirverse.app`** (apex) |
| Mandate §Domain & naming | Children at `function.meirverse.app` (`crm.`, `erp.`, `hr.`, `finance.`, `inventory.`) |
| Current build | Dashboard deployed at **`dashboard.meirverse.app`** (subdomain) |

**Implication:** the running site is on the wrong host per mandate. Children are partially named per mandate (`hr.meirverse.app` matches; `gcb-erp.meirverse.app` does not — mandate would call it `erp.meirverse.app`).

**Decision needed:** migrate to apex now (one-shot DNS + Vercel domain swap; redirect `dashboard.meirverse.app` → apex), or carry the subdomain through Phase 1 and migrate at the Phase 1 → Phase 2 boundary?

---

## 2 · Permission model — Departments×Role vs per-user matrix 🔴

| Source | Says |
|---|---|
| Mandate §Access control | Four layers: **Super Admin · Org Admin · Ranks (no auto-grant) · End user**. Access is explicit (module × action × data-segment) and back-end managed. |
| Current build | **Departments × Role** (Director/Manager/Staff/Viewer) — role within a department implicitly grants action scope across that department |

**Implication:** the just-shipped `user_departments` table + RLS director-policies + `lib/auth/scopes.ts` role→scope mapping all assume the old model. The mandate replaces this with a per-(user, module, action, data-segment) matrix. Different shape entirely.

**Decision needed:** rewrite Phase 2.3 schema (deprecate `user_departments`, add `user_access_grants` per-user matrix) now, or treat `user_departments` as legacy and bolt the mandate's matrix on alongside?

The interim RLS-recursion fix (migration `20260525000004`) is still worth applying so the dashboard renders today — it doesn't deepen the divergence, just makes the current model functional while the strategic call is being made.

---

## 3 · Database topology — 1 project vs 4 🔴 / 🔵

| Source | Says |
|---|---|
| Mandate §Tech stack + §Environments | **Internal DB** + **External DB** + `internal-staging` + `external-staging` (4 Supabase projects, all SG region) |
| Current build | 1 Supabase project (`xwrthxehkrwmikhzqhma`, SG) |

**Auto-rename:** the existing project becomes **Internal DB**. No data move required.

**Decision needed for Phase 1 timing:**
- Create `internal-staging` now (mandate says "from day one") — gates direct-to-prod migrations going forward 🔴
- Create `external-db` + `external-staging` — Phase 2 work 🔵

---

## 4 · Org units — 12 entities vs 6 🔴

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

## 5 · CRM subdomain naming 🔴

| Current (CRM-INVENTORY v4.2) | Mandate-compliant |
|---|---|
| `hr.meirverse.app` | `hr.meirverse.app` ✓ |
| `gcb-erp.meirverse.app` | `erp.meirverse.app` (mandate: one function, one subdomain) |
| `termsheet.` · `engagement.` · `prospect.` · `specsheet.` | likely **consolidate into `crm.meirverse.app`** with stages as routes inside (mandate forbids parallel subdomains for one function) |
| `propertymgmt.meirverse.app` | depends on Conflict #4 resolution |
| (none yet) | `finance.meirverse.app` (mandate lists; not yet built) |
| (none yet) | `inventory.meirverse.app` (mandate lists; not yet built) |

**Decision needed:** confirm consolidation of the four Cluster 2 stages into a single `crm.` host. If yes, the Cluster 2 shared-DB design from ARCHITECTURE §8 maps cleanly (one DB, one UI with stage filters — was already the architecture, just unifies the URL).

---

## 6 · `company` column on every primary table 🟡

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

## 7 · Migration discipline — staging soak 🔴

| Source | Says |
|---|---|
| Mandate §Environments + §Deploy | Staging soak ≥ 24h before production. Direct-to-prod forbidden unless emergency hotfix. |
| Current build | Direct-to-prod migrations via Supabase SQL Editor (we just did this for Phase 2.3 + the upcoming RLS fix) |

**Implication:** today's RLS-recursion fix should soak in staging first per mandate. Treating today's deploy as the final pre-mandate operation; from the alignment commit forward, **no production migrations without a staging soak unless Principal-declared hotfix**.

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

## 10 · Tooling — Sentry · UptimeRobot · GitHub Actions CI 🟡

| Source | Says |
|---|---|
| Mandate §Observability & CI | All required, every Child |
| Current build | None of the above wired |

**Auto-align:** add to the Phase 1 closure checklist. Sentry + UptimeRobot are small lifts (env vars + npm package + 1 endpoint each); CI lint+test+build on every PR is a 1-file `.github/workflows/ci.yml` add.

---

## 11 · Mobile · Expo SDK · OTA cadence 🔵

Phase-2-or-later concern. No mobile client built; mandate's RN+Expo + quarterly SDK bump + OTA-first releases recorded for the eventual build.

---

## What gets done now (this commit)

1. ✅ Mandate adopted at repo root (`CLAUDE.md`).
2. ✅ This alignment doc captures the punchlist.
3. ✅ Subordination banners added to `ARCHITECTURE.md` + `CRM-INVENTORY.md`.
4. ⏭ RLS-recursion fix (interim, doesn't deepen divergence) applied as the last pre-mandate hotfix to keep `/` rendering. Migration committed; staging soak waived for this one because the dashboard is currently 500'ing.

## What needs Principal decisions (next session)

Conflicts **#1**, **#2**, **#3 (Phase 1 timing)**, **#4**, **#5**, **#7 (process gate)**. Each blocks substantive code work in its area.

## What auto-aligns once the decisions land

Conflict **#6** (company column) waits on **#4**.
Conflict **#10** (tooling) can land in parallel.
Conflicts **#3 (Phase 2)**, **#8**, **#9**, **#11** are Phase 2 / later.
