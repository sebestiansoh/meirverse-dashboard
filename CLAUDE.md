# Meirverse Apps — Platform Mandate

> Universal anchor for every Meirverse project. All Claude Code sessions in this codebase inherit these rules. Project-level instructions may extend, never override. Conflicts resolve in favour of this document unless an explicit Principal override is recorded.
>
> **v1.5 · 25 May 2026 · Owner: Sebestian (Principal)**
>
> **Changes from v1.4:** adds the Environments, Deploy & release, Platform update cadence, and Observability & CI sections — codifying staging requirements, expand-then-contract schema migrations, OTA-first mobile releases, quarterly Expo SDK bumps, rollback targets, and required tooling. Tech stack table extended with source control, CI, error tracking, and uptime monitoring.

---

## Mission

Meirverse runs as two parallel platforms backed by one organisation:

- **Internal Dashboard** at `meirverse.app` — for staff. GSuite SSO restricted to whitelisted Workspace domains. Primary reads from the **Internal DB**.
- **External Dashboard** at `meirverse.world` — for external clients and other property stakeholders. Magic-link authentication open to any email. Primary reads from the **External DB**.

Both dashboards may read from both databases via a server-side API layer. Six parallel, independently-run business units exist across both. Every line of code respects this.

## Build order

Internal first, External last.

- **Phase 1:** Internal Dashboard, all internal Children (CRM, ERP, HR, Finance, Inventory, and others), Internal DB, **`internal-staging` Supabase project alongside Internal DB from day one**. Firm these up before any external surface is constructed. An Internal mobile client may be built within Phase 1 if a Child has clear field-use justification.
- **Phase 2:** External Dashboard, External DB, **`external-staging` Supabase project alongside External DB from day one**, the server-side cross-DB API. Stood up only once Phase 1 processes are stable. The External web client lands first; the External mobile client follows late-Phase-2 or runs in parallel.

A Child belongs to one phase. Do not start an External Child before its corresponding Internal Children are stable, because the External Child's data dependencies (property metadata, construction progress, contract terms, products, stock) all originate in the Internal DB.

## Tech stack — fixed, no substitutes

| Layer | Service |
|---|---|
| DNS / edge / WAF | Cloudflare |
| Web frontend | Vercel (one deployment per dashboard) |
| Mobile client (when applicable) | React Native + Expo |
| Backend, DB, auth, storage | Supabase × 2 projects — **Internal DB** + **External DB** (each with `*-staging` companion) |
| API gateway, Python services | Fly.io |
| Source control | GitHub |
| CI | GitHub Actions |
| Error tracking | Sentry (or equivalent) |
| Uptime monitoring | UptimeRobot, Better Uptime, or equivalent |
| Region | Singapore / APAC |

No substitutions without Principal sign-off. Do not propose Postgres-elsewhere, Render, Railway, AWS, Firebase, native Swift/Kotlin alongside React Native, or similar in place of the services above.

## Environments

Every code-running layer has three environment tiers:

- **Development** — local or short-lived per-PR environment. Vercel auto-creates preview deploys per pull request; Fly.io may use ephemeral fly apps; Expo uses the `development` channel.
- **Staging** — full-fidelity mirror of production, used for migration soak and pre-release testing. **Required** for both DBs: `internal-staging` and `external-staging`. Vercel has a staging deployment per dashboard; Fly.io has staging apps per service; Expo has the `staging` channel.
- **Production** — live, user-facing. Vercel production deployment; Fly.io production apps; Expo `production` channel.

Promotion path is **staging → soak → production**. No direct-to-production deploys. Migrations and risky releases soak in staging for at least 24 hours unless designated as an emergency hotfix by the Principal.

## Domain & naming

Two canonical roots, no others:

- `meirverse.app` — Internal Dashboard. Functional Children as `function.meirverse.app` (`crm.`, `erp.`, `hr.`, `finance.`, `inventory.`, …).
- `meirverse.world` — External Dashboard. Functional Children as `function.meirverse.world` (`property.`, `onboarding.`, `maintenance.`, `progress.`, `payments.`, `leads.`, `pos.`, …).

One function, one subdomain within its dashboard. Org-unit variation lives **inside the app** via access control and partitioning — never in parallel subdomains.

## Dashboards

### Internal Dashboard — `meirverse.app`

- **Audience:** internal staff across all org units.
- **Auth:** Google Workspace SSO only. A whitelist of accepted Workspace domains is maintained by Super Admin (`@meir.sg` is canonical; other Meirverse-owned Workspace domains may be added). Outside the whitelist = no account.
- **UI:** internal design system, optimised for operational density.
- **Primary database:** **Internal DB**.
- **May read External DB** via the server-side cross-DB API where a project explicitly declares the dependency (e.g., to see client-side maintenance requests, payments, comments on a property).

### External Dashboard — `meirverse.world`

- **Audience:** external clients and property stakeholders — owners, co-owners, tenants, contractors, consultants, agents, lawyers, leads, m.lifestyle customers. **Not internal staff.**
- **Auth:** **magic-link** (passwordless). **No domain whitelist** — any email is acceptable (Gmail, Hotmail, corporate, public). Users self-register; the platform issues a single-use, time-limited magic link on every sign-in. No passwords. No social logins. `@meir.sg` and other Meirverse Workspace addresses do not log into the External Dashboard.
- **UI:** a separately curated client-facing design system, distinct from the internal one.
- **Primary database:** **External DB**.
- **May read Internal DB** via the server-side cross-DB API where a project explicitly declares the dependency (e.g., to display property metadata, construction progress, contract terms, products, stock).
- **Zero base access.** A newly registered external user sees nothing until a back-end actor (Super Admin, Org Admin, or designated project lead) assigns them to one or more Projects or POS access with specific module entitlements.

## Channels

Each dashboard reaches users through one or more channels. The architecture is identical across both dashboards; only the audience and primary DB differ.

### Channels available

- **Web** — the canonical channel. Vercel deployment at the dashboard's root domain. Always built first.
- **Mobile app** — optional per dashboard, built when a Child has clear mobile justification (field use on Internal; on-the-go client access on External). **React Native + Expo** by default. Installable PWA is acceptable as a cheaper fallback when push notifications can be deferred.
- **Third-party API integrations** — payments, messaging, document signing, KYC, maps, calendar, etc. Always routed through the gateway, never called directly from the client.

### API gateway — mandatory routing

All mobile clients and all third-party integrations route through a **Fly.io API gateway**:

```
Client (web / mobile) → Fly.io API gateway → (Internal DB · External DB · third-party APIs)
```

- Third-party credentials live on the gateway, never on the client.
- Cross-DB calls go through the gateway (also required by the Data Model section).
- The gateway is the single audit, rate-limit, and secrets choke point.
- Web clients may continue to call Supabase directly for simple primary-DB reads and writes; the gateway is required only when crossing DBs, calling third parties, or serving mobile.

### Mobile-specific rules

- **Auth on mobile** — magic-link emails (External) and Workspace OAuth (Internal) open via **iOS universal links** and **Android app links**, deep-linking back into the app. No separate mobile auth flow.
- **Push notifications** — **APNs** (iOS) and **FCM** (Android), dispatched through the API gateway.
- **Offline / sync** — per-project decision; not mandated. If implemented, conflict resolution defaults to last-write-wins unless the Child declares otherwise.
- **App distribution** — App Store (iOS) and Play Store (Android). Internal builds may distribute via TestFlight + Play Internal Testing during development.

## External Projects — property projects with an address

An **External Project** is a real-world property project owned by one org unit (Meir Homes, Meir Edition, Meir Collective, Good Class Builders, etc.). Every Project is keyed on a physical address. Examples: a GCB under development, a heritage shophouse under management, a high-spec landed home being delivered.

For each Project, the platform maintains:

- The **owning org unit** (`company`).
- A **participant list** — multiple external viewers, each linked to the Project by role (owner, co-owner, tenant, contractor, consultant, agent, lawyer, etc.).
- A **per-(participant, module) access matrix** — for every Module enabled on the Project (Property, Onboarding, Maintenance, Site Progress, Payments, etc.), each participant has explicit access flags (view / write / approve / none).
- The participant list and access matrix are **back-end managed** — assigned by the project's internal lead, Org Admin, or Super Admin via the Internal Dashboard. External users cannot grant access to themselves or to others.

**Data location for Project entities** follows the System-of-Record rule:

- **Internal DB owns:** property metadata, title and ownership records, construction-progress data, internal staff assignments, contract terms.
- **External DB owns:** participant list, per-participant access matrix, client-submitted maintenance requests, client-side payment records, client comments and uploads.
- Each Module pulls from whichever DB owns the relevant data via the cross-DB API.

### Exception-class Children (not Project-anchored)

Two External Dashboard Children are not anchored to a property Project:

- **`leads.`** — a Lead is **pre-Project**. It carries identification + interest data only, with no address. On qualification and onboarding, the lead is **moved into the property Project Children** (Property, Onboarding, etc.) and the lead's user identity is upgraded to a Project participant on a specific address. The original lead record is retained for history with a `converted_to_property_id` reference.
- **`pos.`** (m.lifestyle Point of Sales) — customer-transactional. The audience is **two-tier**:
  - **Onboarded clients** — existing External Dashboard users who already participate in one or more property Projects. POS access is added to their existing account.
  - **General public** — members of the public inspired by Meir products, with no property relationship. They self-register via magic link purely to transact on POS. They hold POS access only; they remain invisible to the Project Children unless later promoted via the leads → Project pathway.
  - Products and stock are read from the Internal DB via the cross-DB API; sales write to the External DB; stock decrement writes back to the Internal DB through a privileged endpoint on the same API.

## Org units — parallel, divestable

1. Meir Homes
2. Meir Edition
3. Meir Collective
4. m.lifestyle
5. m.Atelier
6. Good Class Builders

Org units span both dashboards. Each may be divested at any time — preserve clean per-unit separability in **both** databases. Every primary record across both DBs carries attribution sufficient to export and detach one unit without disturbing the others.

## Data model — non-negotiable

- **Two Supabase projects:** Internal DB and External DB. No third DB. No per-Child databases.
- Every primary table in **both** DBs carries a `company` column. If a migration omits it, that is a bug.
- Row-level security enforced at each DB: users see only rows where `company` matches their org unit (subject to module-level entitlements) and, on the External side, where they are listed as a participant on the relevant Project (or hold POS-only access for `pos.`).
- **System of Record (SoR) rule.** Every entity has exactly one DB that is its canonical home. The other DB never holds the master copy. Cross-DB display happens via the API — no caching, mirroring, or duplication.
- **Cross-DB access happens via server-side API only.** Never via client-side cross-project SQL. Never via direct frontend Supabase calls into the other project. A Fly.io service (or Supabase Edge Function) holds service-role credentials for both DBs, brokers reads, and exposes privileged writes (e.g., POS stock decrement) under explicit allow-lists.
- HR / Finance / Inventory operate at the **holdco / shared-services layer** within the Internal DB — cross-org views for authorised users, with `company` attribution preserved on every underlying row.
- Per-unit export works on each DB independently. Cross-org export is Super Admin only.

## Data sources — declared per Child

Every Child project must declare, at the top of its project-level `CLAUDE.md`:

- Which **dashboard** it belongs to (Internal or External) and **build phase** (1 or 2).
- Its **primary database** (Internal DB or External DB).
- Which **other DB**, if any, it reads from via the cross-DB API — and for which entities.
- Each entity's **System of Record** if the project touches shared entities.
- For External Children: whether the Child is **Project-anchored** (property-keyed) or an **exception class** (Leads, POS).
- Which **channels** the Child serves (web, mobile, third-party integrations) and the third-party APIs it depends on.

This declaration is required before the first migration in any Child. No silent cross-DB access. No silent third-party integration.

## Access control — per-user, back-end managed

Access is per-user and assigned in the back end. **This applies to both dashboards.** Ranks and reporting structure exist as organisational metadata — they do not auto-grant access.

Four layers:

1. **Super Admin** — cross-org, cross-dashboard. Reserved to the Principal (`sebestian@meir.sg`) + designated deputies.
2. **Org Admin** — full read/write within their `company` and within the dashboards their org unit subscribes to. Assigns access to users within their unit.
3. **Ranks** — defined per org unit. Used for organisational hierarchy, approval routing, and reporting-officer designation. Do **not** auto-grant module or data access.
4. **End user** — internal staff or external participant. Access scope is the explicit set of (module × action × data-segment) tuples assigned to them by a back-end actor.

**Internal access model:**

- Org Admin (or Super Admin) opens the user's access matrix and ticks the modules, actions, and data segments they may access.
- For each user, designate the direct reporting officer. Reporting officer drives approval routing, visibility escalation, and substitution during absence.
- No user inherits access from rank alone.

**External access model:**

- Access is assigned **per Project, per Module, per User**. A single user may participate in multiple Projects with different access levels in each.
- A back-end actor (Super Admin, Org Admin, or the internal lead designated as Project owner) ticks the modules and actions each external participant has on each Project.
- For exception-class Children (Leads, POS), access is keyed on the appropriate non-Project identifier (lead ID, customer ID). POS access is a flag on the user record; Leads access is implicit in the lead's own record.

Module-level entitlement (which Children appear for which org unit, which dashboards a user can enter) is Super Admin–controlled and may differ across units.

## Authentication

### Internal Dashboard

- Google Workspace SSO only. No password auth.
- Whitelist of accepted Workspace domains, maintained by Super Admin.
- SSO session brokers downstream Google API access (Gmail, Drive, Photos, Calendar, Tasks).
- Mobile uses Google's mobile SDK for OAuth.

### External Dashboard

- **Magic-link passwordless auth only.** No passwords. No social logins.
- **No domain whitelist.** Any email is accepted — Gmail, Hotmail, Outlook, corporate, etc.
- Self-registration: user enters email, receives a magic link, clicks to authenticate. Magic links are single-use and time-limited.
- Mobile opens magic links via iOS universal links / Android app links.
- A newly authenticated external user holds **zero access** until assigned to one or more Projects (or granted POS access) by a back-end actor.

## Uploads

Every upload control must offer three sources: **Local · Google Drive · Google Photos**. (External Dashboard users connect their own Google account or upload locally; no shared Workspace bridge.) Stored via Supabase Storage on the relevant DB, under the same `company` partitioning rule. Mobile clients may also offer **camera / photo library** as a local source.

## Dashboard plug-ins

Each dashboard exposes its own plug-in surface:

- **Internal:** Google Tasks, news feeds, AutoCount, URA Space.
- **External:** payment providers (Stripe / NETS / PayNow), messaging (WhatsApp Business / Twilio SMS), document signing (Lumin / DocuSign), KYC for onboarding, Google Maps, calendar / scheduling. Defined per project.

Super Admin adds, removes, and enables per org unit. All plug-ins routed through the Fly.io API gateway per the Channels section.

## Deploy, release & rollback

GitHub is the source of truth. All changes via pull request. Required CI green before merge to `main`. Merge to `main` auto-deploys.

### Web and backend

- **Web (Vercel):** atomic deploys. Traffic switches in one move; previous deployment stays warm for instant rollback (one click from the Vercel dashboard).
- **Backend / gateway (Fly.io):** rolling deploys with health checks across multiple machines. Failed health checks abort the deploy and retain the previous image. Rollback via `fly releases rollback` or by redeploying the previous image.
- **Rollback target:** under 5 minutes for web and backend.

### Schema migrations — expand-then-contract

Default pattern for any schema change is **expand-then-contract**:

1. Add the new column / table / index (additive, backward-compatible).
2. Deploy code that writes to both old and new.
3. Backfill historical data into the new shape.
4. Deploy code that reads from the new shape.
5. Stop writing to the old shape.
6. Drop the old shape in a separate, later migration.

Never couple a schema change and a code change that depends on it in the same deploy step. Migrations live in `migrations/` per repo, versioned in git, applied via Supabase CLI. Run against staging first, soak ≥ 24 hours, then production. Schema rollback is complex — prefer roll-forward with a hotfix migration.

### Mobile — OTA-first

- **OTA via Expo EAS Update.** All JavaScript-only patches (UI, business logic, copy, most new features) ship as bundle updates — no App Store review. Channels: `development`, `staging`, `production`. Promotion path: publish to staging, smoke-test, promote to production.
- **Store release** required only for: native module added / removed / updated, new permissions (camera, location, notifications), new native plugin, Expo SDK bump.
- **OTA rollback:** point the production channel back to the previous bundle — effective on the next app launch (under 5 minutes).
- **Store release rollback:** not possible. Roll forward with a hotfix release. Apple review window is typically 24–48 hours.

## Platform update cadence

- **Quarterly:** Expo SDK bump, npm dependency audit, pip dependency audit. Security patches applied immediately, not held to the quarterly slot.
- **Per major iOS / Android release:** Expo SDK update within **30 days** of GA. Re-test all mobile-specific flows — auth deep links, push notifications, camera, file pickers.
- **Continuous:** Cloudflare, Vercel, Supabase, and Fly.io updates are managed by the providers; their status pages cover outages. Monitor Sentry for any regressions correlated to a browser auto-update.

## Observability & CI

Required for every Child:

- **Error tracking:** Sentry (or equivalent) on web frontend, Fly.io backend, and mobile apps. Alerts to the Principal for production errors.
- **Uptime monitoring:** UptimeRobot, Better Uptime, or equivalent on production endpoints — dashboard roots, the Fly.io API gateway, and any critical Child endpoint. Public status page optional.
- **DB monitoring:** Supabase logs, slow-query alerts.
- **Edge analytics:** Cloudflare Analytics on both roots.
- **CI:** GitHub Actions on every PR — lint, test, build. Required green checks before merge. No merge directly to `main`.
- **Secrets:** environment variables only — Vercel, Fly.io, Expo EAS Secrets. Never in code. Never in client bundles. Rotate on personnel change.

## Working rules for Claude Code

- **Anchor to this doc.** Cite it when a request is in tension. Do not contradict it.
- **Confirm dashboard + org unit + build phase + channel** before applying branding, scoping data, or selecting style. No defaults on any axis.
- **For External Children, confirm whether it is Project-anchored** (and on which Project) or an exception class. Access logic differs.
- **Declare data sources and channels up front.** Before writing schema, API, or UI for a Child, name its primary DB, any cross-DB reads, its channels (web / mobile / third-party), and the third-party APIs it touches. Cross-DB calls and third-party calls go through the Fly.io gateway, not the client.
- **Migrations run against staging first.** Never propose a production migration without a staging soak.
- **Schema changes use expand-then-contract.** Never propose a drop-and-recreate on production tables.
- **Never fabricate.** Data, schema, configuration, integration behaviour, or claims about the running platforms — verify against the live system or stop and surface the gap.
- **Pause and ask** when a request is ambiguous about dashboard, org unit, Project, phase, channel, or data source. Never guess.
- **Re-present the full deliverable bundle** when a change cascades — not just the touched file.
- **`company` column on every primary table in both DBs.** Non-negotiable.

## Migration & exceptions

- **Cellar CRM** (`cellar.meir.sg`, currently on Cloudflare Pages + D1): being rebuilt on the Internal stack as a new Claude Code project, migrating to `cellar.meirverse.app`. Existing instance grandfathered until cutover.
- No other non-conforming asset remains under the Meirverse banner indefinitely — retire or migrate.

## Change control

Amendments are Principal-issued and version-incremented. Pull the latest version. This document beats project-level instructions on conflict, unless the project-level instruction carries an explicit Principal override.
