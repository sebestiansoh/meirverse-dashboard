# Meirverse Dashboard — Project Context (Master)

> **Inherits from** `../CLAUDE.md` (Meirverse Platform Mandate v1.6).
> Read the Mandate first.
>
> **This project IS the Internal Dashboard itself.** It is not a Child;
> it is the orchestration layer that every Internal Child plugs into
> via SSO bridge.
>
> Project-level deep architecture lives in this folder's
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) (v4.5; pre-Mandate, drift
> catalogued in `CLAUDE-ALIGNMENT.md`), [`CRM-INVENTORY.md`](./CRM-INVENTORY.md)
> (v4.2; subordinate to Mandate per its own header), and the
> [`CLAUDE-ALIGNMENT.md`](./CLAUDE-ALIGNMENT.md) audit log of
> Mandate-vs-existing-build divergences (decisions D-A through D-G).
>
> Update this file at the end of every working session.

---

## Required declarations (per Mandate §"Data sources — declared per Child")

| Axis | Value |
|---|---|
| **Dashboard role** | **This IS the Internal Dashboard.** Not a Child. |
| **Build phase** | **Phase 1** — foundational; everything Internal depends on this. |
| **Target subdomain** | `meirverse.app` (apex, per Mandate §"Domain & naming"). **Current production deployment is at `dashboard.meirverse.app`** — apex move scheduled to piggyback the DB-consolidation commit per Principal decision **D-B**. Conflict #1 in `CLAUDE-ALIGNMENT.md` remains open until executed. |
| **Primary DB** | **Internal DB** — one Supabase project. Companion `internal-staging` provisioned in the same session per **D-C** (drops the per-CRM Supabase pattern). |
| **Cross-DB reads** | External DB via the Fly.io API gateway — only relevant once External Children (`leads.meirverse.world`, etc.) are live. Phase 1 has no cross-DB calls. |
| **Channels** | Web only in Phase 1 (Vercel). No mobile client. |
| **Third-party APIs** | Google OAuth (Workspace SSO), WebAuthn (passkeys), Resend (transactional email). All third-party + cross-DB will route through the Fly.io gateway once that gateway is provisioned. |
| **Org units** | Mandate v1.6 lists **9** (`meir-homes`, `meir-edition`, `meir-collective`, `m-lifestyle`, `m-atelier`, `good-class-builders`, `cubo`, `caerus`, `made`). `entities` table in this DB still seeds 12 — see Conflict #4 mapping in `CLAUDE-ALIGNMENT.md`. |

---

## What this project is

The dashboard is the **identity issuer and orchestration layer** for the Internal platform:

- Hosts the canonical sign-in (Google Workspace SSO + WebAuthn passkeys, gated by Cloudflare Access).
- Issues short-lived RS256 JWTs that Internal Children verify via the dashboard's JWKS endpoint to enable SSO into each CRM.
- Provides the universal staff tools (Identity, Calendar, Tasks, Inbox, Markets, Quick Launch, Documents, Directory, Approvals, Notes, Notifications, Announcements, Settings, Feedback).
- Does not store CRM data; does not duplicate AutoCount data.

For the full architecture (current build, including the 14 universal modules, the JWT bridge spec, the segment view, RLS policies, and the v4.5-v1.6 alignment work) see `ARCHITECTURE.md` + `CLAUDE-ALIGNMENT.md`.

---

## Active alignment work

`CLAUDE-ALIGNMENT.md` tracks every divergence between the existing build briefs (v4.5 ARCHITECTURE, v4.2 CRM-INVENTORY) and the Mandate (v1.6, since this session). Twelve conflicts are listed; seven Principal decisions (D-A through D-G) are recorded. Open conflicts at last update:

- **#1 · Apex vs subdomain** (🔴) — execute D-B's piggyback move
- **#2 · Permission model: Departments × Role vs per-user matrix** (🔴) — Principal decision pending
- **#4 sub · Property Maintenance + Property Management mapping** (🔴 partially closed by D-E; technical impl TBD)
- **#4 sub · Status of `made-commercial` vs `made-venture` entities** (🔴) — D-D added MADE but didn't split commercial vs venture

These are the highest-priority items for the next session in this project.

---

## File inventory

| File | Purpose | Status |
|---|---|---|
| `CLAUDE.md` (this file) | Project-level brief inheriting Mandate | **Live** |
| `../CLAUDE.md` | Platform Mandate v1.6 | **Inherited** |
| `ARCHITECTURE.md` | Pre-Mandate v4.5 detailed architecture | **Subordinate to Mandate; drift in `CLAUDE-ALIGNMENT.md`** |
| `CRM-INVENTORY.md` | v4.2 inventory of Children targeting SSO | **Subordinate to Mandate; renames pending per D-B** |
| `CLAUDE-ALIGNMENT.md` | Working alignment audit (12 conflicts, 7 decisions) | **Live** |
| `README.md` | Quick-start | Live |
| `app/`, `lib/`, `supabase/`, `middleware.ts`, etc. | Next.js 14 implementation | Live |

---

## Working conventions

Project-specific extensions to Mandate §"Working rules for Claude Code":

- **Read both `ARCHITECTURE.md` and `CLAUDE-ALIGNMENT.md`** before proposing architectural changes; they together describe both the current build and the in-flight Mandate alignment.
- **Cite the alignment doc** when a request brushes against any of the 12 conflicts. Don't silently apply a change that closes one — surface the decision explicitly.
- **Every new Internal Child** (CRM, ERP, HR, Finance, Inventory, etc.) consumes this project's JWKS endpoint for SSO. Adding a new audience requires a CRM-INVENTORY entry and an SSO retrofit checklist completion.
- **Phase 1 Internal Children block External Phase 2** per Mandate §"Build order". Treat this project's stability as the critical-path gate.

---

*Version 1.0 · 25 May 2026 · Initial project-level CLAUDE.md replacing the 297-line verbatim Mandate copy that previously occupied this file. Authored from `meir-leads` session during a cross-project alignment pass. Project-level architecture remains in `ARCHITECTURE.md` + `CRM-INVENTORY.md` + `CLAUDE-ALIGNMENT.md`.*
