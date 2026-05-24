# Meirverse Dashboard · Architecture (v4)

**Owner:** Sebestian Soh (Universal Super Admin)
**Build mode:** Vibe-coded with Claude Code / Cursor
**Status:** All major decisions locked · ready for build

---

## TL;DR — the plan

| Decision | Locked answer |
|---|---|
| **Group identity** | Meirverse = Group Holding Company over four business segments |
| **Domain** | `dashboard.meirverse.app` (same root as CRMs) |
| **Public brand site** | Stays on `meirverse.sg` (out of scope) |
| **Frontend** | Next.js 14 (App Router) + TypeScript + Tailwind |
| **Hosting** | Vercel (Hobby tier sufficient) |
| **Database** | Supabase, Singapore region (Free tier sufficient for 2–3 staff) |
| **Auth identity** | Supabase Auth + Google OAuth + WebAuthn passkeys |
| **Auth network gate** | Cloudflare Access (configured at go-live by Super Admin) |
| **Email domain policy** | Allowlisted Workspace domains — enforced at 3 layers (Cloudflare Access · Google OAuth `hd` · server callback) |
| **Session cookie scope** | `.meirverse.app` |
| **SSO to CRMs** | Signed-JWT bridge (RS256, 5-min TTL, audience-bound) |
| **Permission model** | Many-to-many Departments × Role (Director/Manager/Staff/Viewer) |
| **Super Admin** | Sebestian Soh (bypasses all checks) |
| **Departments at launch** | 6 (HR, Admin, Accounting, Operations, Sales, Legal) — extensible |
| **AutoCount** | Quick Launch tile only (no integration) |
| **Ventures (Cubo/Caerus/MADE)** | Full Meirverse entities · administrative-only · no subdomains yet |
| **Feedback module** | Named-default with anonymous opt-in · routed to Dept Director + Super Admin · with response loop |
| **CRM count** | 7 across 3 active clusters + 1 deferred (m.lifestyle) |
| **Launch model** | Phased — Milestone 1 (wk 7), Milestone 2 (wk 17) |
| **Cost steady state** | ~SGD $0–35/mo infra (Free tier) + WhatsApp usage |

---

## 1. What's locked in v4.2

This is the definitive architecture pre-build. Locks since v3:

1. **Meirverse is the holding company** — not a brand umbrella. Four segments: Commercial (Meir Collective, MADE), Residential (Meir Homes, Meir Edition, sub-brands), Support (Good Class Builders, m.Atelier, m.Lifestyle, Property Management, Property Maintenance), Venture Builds (Cubo, Caerus, MADE). The dashboard is the cross-segment coordination layer.
2. **Cubo / Caerus / MADE are full Meirverse entities** — they participate in administrative backend (HR, accounting, admin) via the standard Cluster 1 + AutoCount pattern, alongside every other entity. They do NOT have their own subdomains under `meirverse.app` yet; staff sign in via `dashboard.meirverse.app` like all other Meirverse staff. Operational subdomains can be added later if a venture entity grows to need its own CRM.
3. **AutoCount is the system of record for money** — accessed via Quick Launch tile, not via integration. No widget on dashboard.
4. **Permission model = Departments × Role (4 levels)** — users hold many `(department, role)` assignments. Sebestian is Universal Super Admin and bypasses all checks. Departments are extensible.
5. **Multi-domain Workspace whitelist · three-layer enforcement.** Allowlisted Google Workspace domains are gated at three independent layers: (1) **Cloudflare Access** policy at the network edge; (2) **Google OAuth `hd` parameter** on the auth request for the primary shared Workspace tenant; (3) **server-side domain check** in the auth callback comparing the returned `email`/`hd` against an `ALLOWED_EMAIL_DOMAINS` env var that mirrors the Cloudflare list. The allowlist is not hard-coded in source; all three layers must be kept in sync. Workspace topology is hybrid — some entities share a single tenant, ventures (Cubo, Caerus, MADE) may run independent tenants — and Layer 3 is what covers the independent tenants since `hd` accepts only one value.
6. **Entity catalog + cluster pluggability** — entities (12 today, extensible) are first-class records. Each cluster declares which entities can participate via `cluster_entities`. This replaces hardcoded brand enums.

---

## 2. The Meirverse ecosystem

```
Meirverse Group Holding
│
├─ Commercial
│  ├─ Meir Collective              (conservation, commercial property)
│  └─ MADE                          (commercial role — also in Venture Builds)
│
├─ Residential Properties
│  ├─ Meir Homes                   (Good Class Bungalows)
│  ├─ Meir Edition                 (Homes lower tier)
│  └─ Sub-brands                   (TBD)
│
├─ Support
│  ├─ Good Class Builders          (contracting/construction arm)
│  ├─ m.Atelier                    (boutique design)
│  ├─ m.Lifestyle                  (physical products: display, oils etc)
│  ├─ Property Management
│  └─ Property Maintenance
│
└─ Venture Builds (JV/portfolio)
   ├─ Cubo                         (built environment supply chain firm)
   ├─ Caerus                       (built environment supply chain firm)
   └─ MADE                         (also in Commercial)
```

Back-office is **compartmentalised under departmental leads** — HR, Admin, Accounting, Operations, Sales, Legal each have their own purview. AutoCount is the accounting system of record across all segments. The dashboard provides each lead with universal tools (calendar, tasks, inbox, etc.) plus CRM access scoped to their departmental authority.

---

## 3. The dashboard's role

The dashboard is the **orchestration layer** — it issues identity, hosts universal staff tools, and provides SSO into operational CRMs. It does not store CRM data; it does not duplicate AutoCount data; it does not subsume the venture companies.

### Universal modules (every authenticated user)

| Module | Purpose |
|---|---|
| Identity | Sign-in, role context switching, lock device, audit own activity |
| Calendar | Personal + team Google Calendar, real-time sync |
| Tasks | Google Tasks bi-directional sync |
| Inbox | WhatsApp (Phase 3) · email summary · eventually WeChat/Line |
| Markets | Live financial pulse: S&P 500, VIX, MSCI China, Gold, BTC, ETH, SORA |
| Quick Launch | Tiles for CRMs (with SSO) and external tools (AutoCount, etc.) |
| Documents | Recent Google Drive files, search |
| Directory | All staff, departments, roles, contact info |
| Approvals | Queue of pending sign-offs (role-scoped) |
| Notes | Personal scratchpad, autosaved |
| Notifications | System-wide attention items |
| Announcements | Org-wide read-by-all, posted by Director+ |
| Settings | Preferences, integrations, security (passkeys) |
| Feedback | Open-ended suggestions on work function — routed to Department Director + Super Admin, with response loop |

### Segment view

The Phase 1 artifact's "five brand cards" UI is replaced by a **segment view with entity drill-down**: four segment cards (Commercial, Residential, Support, Venture Builds) each showing the entities within them, color-coded per segment. Clicking an entity reveals its operational status, the user's role context within it, and Quick Launch tiles to relevant CRMs. The segment view replaces both the original five-brand UI and the previously planned standalone Ventures Tracker — drill-down per entity is sufficient.

---

## 4. Access control architecture

Three layers, each answering a different question.

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1 · Network · Cloudflare Access                       │
│  Q: Are you on the allowlist?                                │
│  Sebestian configures rules at Cloudflare when going live.   │
│  Supports email allowlist, domain rules, device posture,     │
│  geographic restrictions, session length, MFA enforcement.   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2 · Identity · Supabase Auth                          │
│  Q: Can you prove who you are?                               │
│  Google OAuth (Workspace-allowlisted) + WebAuthn passkeys.   │
│  3-layer domain whitelist — see §1 lock 5.                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 · Application · user_departments                    │
│  Q: What can you do here?                                    │
│  Super Admin provisions Department × Role assignments.       │
│  CRMs receive JWT and enforce internal permissions.          │
└─────────────────────────────────────────────────────────────┘
```

### Department × Role model

Users are assigned to **many departments**, each with **one role** in that department. Roles in increasing access: `viewer`, `staff`, `manager`, `director`. Sebestian alone is `super_admin` and bypasses all checks.

**Starting six departments** (extensible — add new ones as the org grows):

| Department | Display name | Scope |
|---|---|---|
| `hr` | Human Resources | Personnel · onboarding · benefits · leave |
| `admin` | Administration | Office · facilities · contracts · vendors |
| `accounting` | Accounting | Bookkeeping · A/R · A/P · reporting (read via AutoCount tile) |
| `operations` | Operations | Project delivery · construction · site mgmt |
| `sales` | Sales | Termsheet · engagement · client onboarding |
| `legal` | Legal | Contracts · compliance · disputes |

**Role semantics within a department:**

| Role | Authority |
|---|---|
| `director` | Sets policy, approves, grants/revokes roles within department |
| `manager` | Writes & edits across department scope |
| `staff` | Writes within own work, cannot manage others |
| `viewer` | Read-only access to department's data |

A new department adds is a single SQL insert; no schema migration, no JWT format change, no CRM code changes.

### Schema

```sql
-- One Universal Super Admin flag
alter table user_profiles add column is_super_admin boolean default false;

-- Departments catalog
create table departments (
  department_id text primary key,
  display_name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now()
);

insert into departments values
  ('hr',         'Human Resources', 'Personnel · onboarding · benefits · leave', true, now()),
  ('admin',      'Administration',  'Office · facilities · contracts · vendors', true, now()),
  ('accounting', 'Accounting',      'Bookkeeping · A/R · A/P · reporting',       true, now()),
  ('operations', 'Operations',      'Project delivery · construction · sites',   true, now()),
  ('sales',      'Sales',           'Termsheet · engagement · onboarding',       true, now()),
  ('legal',      'Legal',           'Contracts · compliance · disputes',         true, now());

-- Many-to-many user-to-department with role
create table user_departments (
  user_id uuid references auth.users(id) on delete cascade,
  department_id text references departments(department_id),
  role text not null check (role in ('director', 'manager', 'staff', 'viewer')),
  granted_at timestamptz default now(),
  granted_by uuid references auth.users(id),
  primary key (user_id, department_id)
);

-- Indexes
create index on user_departments(user_id);
create index on user_departments(department_id);
```

### JWT format

```json
{
  "sub": "user-uuid",
  "email": "alice@meirhomes.com",
  "super_admin": false,
  "departments": [
    {"department": "hr", "role": "director"},
    {"department": "admin", "role": "director"}
  ],
  "scopes": ["hr-crm", "admin-systems"],
  "aud": "hr-crm",
  "iss": "dashboard.meirverse.app",
  "exp": 1700000000
}
```

Note: `email` carries the full authenticated email exactly as Google returned it. Users from multiple domains are first-class identities — `alice@meirhomes.com`, `ben@cubo.io`, `sebestian@meirverse.app` coexist.

---

## 5. Local vs hosted patterns

### MUST be hosted
- OAuth callbacks (Google Login)
- WhatsApp webhooks
- CRM SSO bridge (JWT issuance is server-side)
- Calendar / Drive / Tasks API tokens
- Shared team data, department assignments

### CAN stay local (IndexedDB via Dexie.js)
- Personal notes & scratchpad
- Draft tasks before submit
- UI preferences (theme, layout, sidebar state)
- Cached views of remote data
- Personal quick links

### SHOULD be encrypted client-side before storage
Sensitive data living server-side (CRM contact notes, deal notes, client info) gets **field-level AES-GCM encryption** — encrypted client-side before storage, decrypted in the browser. Server stores ciphertext only.

---

## 6. Tech stack rationale

### Why Next.js + Vercel
Most heavily represented framework in Claude Code's training. App Router gives server components for free. Vercel deployment is `git push` and done.

### Why Supabase
Singapore region, real Postgres, auth + DB + storage in one bill, generous free tier, real-time subscriptions built in, common in Claude Code training. Alternatives considered: Firebase (no SG region for all services), PlanetScale (no auth), self-hosted Postgres (too much ops).

### Why Cloudflare Access (not custom allowlist)
Free for up to 50 users, integrates natively with Google as IdP, supports WebAuthn/passkey enforcement at network layer, audit logs every decision. The 30 minutes of setup at go-live is worth it. No app code needed for the allowlist policy itself.

### Why signed-JWT bridge (not OIDC or shared cookies)
- Shared cookies: simplest, but requires all CRMs to use the same auth backend. Doesn't fit the mixed CRM landscape.
- Full OIDC: most flexible but adds weeks of IdP setup. Overkill when you own all parties.
- Signed-JWT bridge: dashboard signs short-lived JWT, each CRM verifies with shared public key, each CRM stays independent. ~20–40 lines per CRM.

---

## 7. Build sequence — phased launch

```
═════ PHASE A · Foundation (Weeks 1–7) ═════════════════════════
Week 1     │ Foundation       Next.js skeleton, Vercel deploy, DNS, Supabase
Week 2     │ Auth gate        Google OAuth + WebAuthn + Cloudflare Access
Week 3-4   │ Persistent       Supabase schema + IndexedDB hybrid + departments
Week 5     │ Google Tasks     Wire Google Tasks API
Week 5-6   │ SSO bridge       JWT issuance + verifier library + JWKS endpoint
Week 6-7   │ CRMs slot 1+2    Construction ERP rebuild + HR greenfield build

           ╔════════════════════════════════════════════════════╗
           ║  ◆ MILESTONE 1 · Week 7 · Go Live                   ║
           ║    Dashboard + 2 CRMs in production                 ║
           ║    All universal modules working                    ║
           ║    Staff begin daily use                            ║
           ╚════════════════════════════════════════════════════╝

═════ BUFFER · Settle & Learn (Weeks 7–8) ═════════════════════
                    Gather feedback, fix issues, begin Meta verification

═════ PHASE B · Cluster 2 rebuild (Weeks 8–14) ════════════════
Week 8-9   │ Design           Cluster 2 shared `deals` schema + state machine
Week 9-10  │ Termsheet        Migrate to shared DB, rebuild UI
Week 10-11 │ Engagement       Migrate to shared DB, rebuild UI
Week 11-12 │ Prospect DB      Greenfield build (Pattern B / bridge-only auth)
Week 13-14 │ Spec Sheet       Greenfield build (Pattern B)

═════ PHASE D · Cluster 3 finish (Weeks 13–16) ════════════════
Week 13-16 │ Property Mgmt    Greenfield build (Collective-only scope)
                    (Overlaps Phase B end)

═════ PHASE E · WhatsApp (Weeks 8–17 parallel) ════════════════
Week 8     │ Verification     Submit Meta Business verification (1-2w wait)
Week 15-17 │ Cloud API build  Webhook handlers, multi-number toggle, inbox UI

           ╔════════════════════════════════════════════════════╗
           ║  ◆ MILESTONE 2 · Week 17 · Full System              ║
           ║    All 7 CRMs + WhatsApp integrated                 ║
           ║    Ventures tracker populated                        ║
           ║    System ready for daily operations                 ║
           ╚════════════════════════════════════════════════════╝

═════ PHASE F · Deferred (Week 18+) ═══════════════════════════
                    WeChat · Line · m.lifestyle suite
```

The 2-week buffer between Milestone 1 and Phase B is **non-optional**. It absorbs three realities: (a) staff surface bugs only through live use, (b) Meta verification takes 1–2 weeks of waiting, (c) lessons from retrofit improve greenfield CRM designs.

---

## 8. Phase A · Foundation (Weeks 1–7)

### Phase 2.1 · Project setup (Week 1)

1. Confirm DNS control of `meirverse.app`
2. Create Next.js 14 + TypeScript + Tailwind app
3. Push to private GitHub repo
4. Connect to Vercel; add `dashboard.meirverse.app`
5. Add DNS: `dashboard CNAME cname.vercel-dns.com`
6. Create Supabase project in Singapore region
7. Verify HSTS preload status (auto-enabled on `.app` TLD)
8. **NEW · Sign up for Cloudflare Free plan** and connect `meirverse.app` (or migrate DNS to Cloudflare). Cloudflare Access setup itself happens at go-live; the account just needs to exist.

#### Claude Code prompt
```
I'm building a Next.js 14 dashboard with TypeScript and Tailwind.
Target: dashboard.meirverse.app on Vercel. Backend: Supabase Singapore region.

Set up the project skeleton:
- App Router structure
- Tailwind v3 configured
- Protected route group at app/(dashboard), public group at app/(public)
- Supabase client at lib/supabase.ts using @supabase/ssr
- Empty page at app/(dashboard)/page.tsx
- .env.local.example with all required vars
- Strict TypeScript config
- Fraunces + Manrope from Google Fonts via next/font

Use design tokens from reference/phase1-dashboard.jsx (the T object).
Don't add auth yet — that's Phase 2.2.
```

### Phase 2.2 · Auth gate (Week 2)

#### Locked decisions
- Provider: Google OAuth (multi-domain — no restriction)
- Initial scopes: `openid email profile`
- Later scopes: `calendar.events.readonly`, `tasks`, `drive.readonly`
- Passkeys: WebAuthn via `@simplewebauthn/browser` + `@simplewebauthn/server`
- Session: 7-day sliding window
- Cookie: `domain=.meirverse.app`, `SameSite=Lax`, `Secure`, `HttpOnly`

#### Steps
1. Configure Google OAuth in Google Cloud Console
   - Redirect URI: `https://dashboard.meirverse.app/auth/callback`
   - JS origin: `dashboard.meirverse.app`
   - Pass `hd=<primary-shared-workspace-domain>` on the auth request URL to bind
     primary-tenant logins to Google's IdP-enforced gate (Layer 2). Do **NOT**
     set the OAuth *client*'s single-hosted-domain restriction — that locks the
     client to one Workspace and would block users from independent venture
     tenants (Cubo, Caerus, MADE). Independent tenants are validated by the
     server-side `ALLOWED_EMAIL_DOMAINS` check in `/auth/callback` (Layer 3).
2. Configure Supabase Auth → Google provider
3. Build `/login` page with Google + passkey buttons
4. Add middleware protecting `(dashboard)` group
5. Add logout handler
6. **Cookie domain MUST be `.meirverse.app`** for cross-subdomain SSO

#### Claude Code prompt
```
Next.js 14 + Supabase Auth at dashboard.meirverse.app.
Add Google Login + WebAuthn passkey login.

CRITICAL constraints:
- Domain allowlist enforced at THREE layers (defense in depth):
  (1) Cloudflare Access policy at the network edge — configured in Cloudflare;
  (2) Google OAuth `hd` parameter on the auth request for the primary shared
      Workspace tenant — set when building the OAuth URL, not in client config;
  (3) Server-side check in /auth/callback: reject if decoded.email's domain is
      not in process.env.ALLOWED_EMAIL_DOMAINS (comma-separated allowlist).
      On rejection: sign out + redirect to /login?error=domain_not_allowed.
- Cookie domain MUST be .meirverse.app so subdomains share session.

Build:
1. /login page (app/(public)/login/page.tsx) with two buttons, meirverse theme.
2. Server middleware redirecting unauthenticated users to /login.
3. /auth/callback route handler completing OAuth, setting cookie domain=.meirverse.app
4. Passkey registration at app/(dashboard)/settings/security/page.tsx
5. Logout button in top-right user menu.

Use @supabase/ssr server-side. @simplewebauthn/browser + /server for passkeys.
```

### Phase 2.3 · Persistent backend (Weeks 3–4)

#### Schema

```sql
-- User profile (one row per user) — includes super_admin
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_super_admin boolean default false,
  ui_preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Departments catalog (per section 4)
create table departments (...);  -- see §4 above
create table user_departments (...);  -- see §4 above

-- Tasks (local or Google Tasks mirror)
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  done boolean default false,
  due_date date,
  google_task_id text,
  google_task_list text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Notes (client-encrypted)
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_content text not null,
  iv text not null,
  updated_at timestamptz default now()
);

-- Quick Launch tiles
create table quick_launch (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  color text,
  department_id text references departments(department_id),  -- optional scoping
  shared_with_team boolean default false,
  position int default 0
);

-- Entity catalog — replaces hardcoded brand enums everywhere
create table entities (
  entity_id text primary key,
  display_name text not null,
  segment text not null check (segment in (
    'commercial', 'residential', 'support', 'venture-builds'
  )),
  is_active boolean default true,
  created_at timestamptz default now()
);

insert into entities values
  -- Commercial
  ('meir-collective',     'Meir Collective',     'commercial',     true, now()),
  ('made-commercial',     'MADE (Commercial)',   'commercial',     true, now()),
  -- Residential
  ('meir-homes',          'Meir Homes',          'residential',    true, now()),
  ('meir-edition',        'Meir Edition',        'residential',    true, now()),
  -- Support
  ('good-class-builders', 'Good Class Builders', 'support',        true, now()),
  ('m-atelier',           'm.Atelier',           'support',        true, now()),
  ('m-lifestyle',         'm.Lifestyle',         'support',        true, now()),
  ('property-mgmt',       'Property Management', 'support',        true, now()),
  ('property-maint',      'Property Maintenance','support',        true, now()),
  -- Venture Builds (administrative-only at launch; no operational subdomains yet)
  ('cubo',                'Cubo',                'venture-builds', true, now()),
  ('caerus',              'Caerus',              'venture-builds', true, now()),
  ('made-venture',        'MADE (Venture)',      'venture-builds', true, now());

-- Cluster-to-entity pluggability — declares which entities participate in each cluster
create table cluster_entities (
  cluster_id text not null check (cluster_id in ('cluster-1', 'cluster-2', 'cluster-3')),
  entity_id text not null references entities(entity_id),
  primary key (cluster_id, entity_id)
);

-- Cluster 1 (HR) — all entities plug in
insert into cluster_entities
  select 'cluster-1', entity_id from entities where is_active = true;

-- Cluster 2 (Deal pipeline) — property advisory baseline
insert into cluster_entities values
  ('cluster-2', 'meir-homes'),
  ('cluster-2', 'meir-edition'),
  ('cluster-2', 'meir-collective'),
  ('cluster-2', 'm-atelier');

-- Cluster 3 (Asset lifecycle) — Construction ERP H/E/C/A; Property Mgmt Collective only
insert into cluster_entities values
  ('cluster-3', 'meir-homes'),
  ('cluster-3', 'meir-edition'),
  ('cluster-3', 'meir-collective'),
  ('cluster-3', 'm-atelier');

-- Venture Builds entities can be added to any cluster via additional inserts:
-- insert into cluster_entities values ('cluster-2', 'cubo');

-- SSO audit trail
create table sso_issuances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  target_crm text not null,
  issued_at timestamptz default now(),
  jwt_jti text unique,
  user_agent text,
  ip text
);

-- Announcements (org-wide broadcast, posted by Director+)
create table announcements (
  id uuid primary key default gen_random_uuid(),
  posted_by uuid references auth.users(id),
  title text not null,
  body text,
  pinned boolean default false,
  created_at timestamptz default now()
);

-- Feedback (open-ended suggestions on work function)
create table feedback (
  id uuid primary key default gen_random_uuid(),
  submitter_user_id uuid references auth.users(id), -- always populated (audit integrity)
  anonymous boolean default false,                   -- controls UI display only
  submitter_token text unique not null,              -- opaque ID for response routing

  category text check (category in (
    'process', 'culture', 'tooling', 'compensation',
    'client-handling', 'other'
  )),
  department_id text references departments(department_id), -- routing tag

  title text not null,
  body text not null,

  status text default 'received' check (status in (
    'received', 'under-review', 'actioned', 'wont-action', 'archived'
  )),
  response_body text,
  responded_by uuid references auth.users(id),
  responded_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on feedback(department_id);
create index on feedback(status);
create index on feedback(submitter_user_id);
create index on feedback(submitter_token);
```

#### Row-Level Security — non-optional

```sql
-- user_profiles: own profile only (Super Admin sees all via service role)
alter table user_profiles enable row level security;
create policy "own profile" on user_profiles for all using (auth.uid() = user_id);

-- user_departments: own assignments visible; Directors see their dept's assignments
alter table user_departments enable row level security;
create policy "own department assignments" on user_departments for select
  using (auth.uid() = user_id);
create policy "directors see dept assignments" on user_departments for select
  using (exists (
    select 1 from user_departments ud
    where ud.user_id = auth.uid()
      and ud.department_id = user_departments.department_id
      and ud.role = 'director'
  ));

-- tasks, notes: own only
alter table tasks enable row level security;
create policy "own tasks" on tasks for all using (auth.uid() = user_id);

alter table notes enable row level security;
create policy "own notes" on notes for all using (auth.uid() = user_id);

-- quick_launch: own or shared
alter table quick_launch enable row level security;
create policy "own or shared launch" on quick_launch for select
  using (owner_user_id = auth.uid() or shared_with_team = true);
create policy "own launch insert" on quick_launch for insert
  with check (owner_user_id = auth.uid());
create policy "own launch update" on quick_launch for update
  using (owner_user_id = auth.uid());
create policy "own launch delete" on quick_launch for delete
  using (owner_user_id = auth.uid());

-- entities: read by all authenticated; Super Admin modifies
alter table entities enable row level security;
create policy "all read entities" on entities for select using (true);
create policy "super admin modifies entities" on entities for all
  using (exists (select 1 from user_profiles where user_id = auth.uid() and is_super_admin = true));

-- cluster_entities: read by all authenticated; Super Admin modifies
alter table cluster_entities enable row level security;
create policy "all read cluster_entities" on cluster_entities for select using (true);
create policy "super admin modifies cluster_entities" on cluster_entities for all
  using (exists (select 1 from user_profiles where user_id = auth.uid() and is_super_admin = true));

-- sso_issuances: own only
alter table sso_issuances enable row level security;
create policy "own sso records" on sso_issuances for select
  using (auth.uid() = user_id);

-- announcements: read by all; write by directors+
alter table announcements enable row level security;
create policy "all read announcements" on announcements for select using (true);
create policy "directors post announcements" on announcements for insert
  with check (exists (
    select 1 from user_departments
    where user_id = auth.uid() and role = 'director'
  ) or exists (
    select 1 from user_profiles where user_id = auth.uid() and is_super_admin = true
  ));

-- feedback: submitters see own; Directors see their dept's; Super Admin sees all
alter table feedback enable row level security;

create policy "own feedback" on feedback for select
  using (submitter_user_id = auth.uid());

create policy "submit feedback" on feedback for insert
  with check (submitter_user_id = auth.uid());

create policy "directors see dept feedback" on feedback for select
  using (exists (
    select 1 from user_departments
    where user_id = auth.uid()
      and department_id = feedback.department_id
      and role = 'director'
  ));

create policy "super admin sees all feedback" on feedback for all
  using (exists (
    select 1 from user_profiles where user_id = auth.uid() and is_super_admin = true
  ));

create policy "directors respond to dept feedback" on feedback for update
  using (exists (
    select 1 from user_departments
    where user_id = auth.uid()
      and department_id = feedback.department_id
      and role = 'director'
  ));
```

**Anonymous display convention.** The `anonymous` flag controls UI display only — the database row is still readable by Director and Super Admin (so they can respond), but their UI is responsible for rendering "Anonymous" instead of the submitter's name when the flag is set. This is a policy-not-security model appropriate to small-team trust. Revisit when external auditors are involved.

#### Claude Code prompt
```
Migrate the Phase 1 artifact's window.storage persistence to Supabase + IndexedDB hybrid.

Migrate to Supabase per ARCHITECTURE.md §8 Phase 2.3 schema:
- user_profiles, departments, user_departments, entities, cluster_entities,
  tasks, notes, quick_launch, sso_issuances, announcements, feedback

Apply ALL RLS policies as written. Test that a non-Super-Admin user
cannot read other users' tasks or notes.

Keep in IndexedDB (use Dexie.js):
- live data caches (calendar, drive, markets)
- draft text in unsaved forms

For notes: implement client-side AES-GCM encryption. Derive a key from
session; encrypt before sending; decrypt after fetching. Server never
sees plaintext notes.

Build SQL migration files in supabase/migrations/. Apply via Supabase CLI.

Replace all window.storage.get/set calls with useSupabaseSync hook handling
loading, saving, optimistic updates, and Super Admin bypass.
```

### Phase 2.4 · Google Tasks sync (Week 5)

- API: Google Tasks API v1
- Add scope: `https://www.googleapis.com/auth/tasks`
- Strategy: poll every 60s while tab visible (no webhooks supported)
- Conflict: last-write-wins on `updated` timestamp
- Refresh tokens: stored encrypted in Supabase, server-side refresh

### Phase 2.5 · CRM SSO bridge (Weeks 5–6)

> **Scope note (2026-05-24).** The retrofit pattern below applies to **Termsheet** and **Engagement Letter** only. **Construction ERP** pivoted from retrofit to greenfield rebuild on 2026-05-24 — see CRM-INVENTORY.md §"Construction ERP / Projects ERP" for the new build plan. The rebuild still slots into the same Week 6–7 slot, but follows the *greenfield* path (Next.js 14 + Supabase + Vercel + bridge-only auth from day one) rather than the retrofit template here.

#### The flow

1. User clicks CRM tile
2. Dashboard verifies user has scope for target CRM
3. Dashboard signs 5-min JWT (RS256): `sub`, `email`, `super_admin`, `departments[]`, `aud`, `iss`, `exp`, `jti`
4. Redirect to `https://<crm>.meirverse.app/auth/sso?token=<jwt>`
5. CRM fetches dashboard public key from `/.well-known/jwks.json` (cached 24h)
6. CRM verifies signature + `aud` + `exp`
7. CRM looks up user by full email (multi-domain aware), creates local session

#### Retrofit template per existing CRM

```typescript
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: 'https://dashboard.meirverse.app/.well-known/jwks.json',
  cache: true,
  cacheMaxAge: 86400000
});

async function getKey(header) {
  const key = await client.getSigningKey(header.kid);
  return key.getPublicKey();
}

export async function handler(req) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return redirect('/login?error=missing_token');

  try {
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, getKey, {
        algorithms: ['RS256'],
        issuer: 'dashboard.meirverse.app',
        audience: 'construction-erp'   // CRM-specific
      }, (err, decoded) => err ? reject(err) : resolve(decoded));
    });

    // Look up user by FULL email (multi-domain support)
    let user = await db.users.findOne({ email: decoded.email });
    if (!user) user = await db.users.create({
      email: decoded.email,
      display_name: decoded.email.split('@')[0],
      sso_provider: 'meirverse-dashboard',
      is_super_admin: decoded.super_admin || false,
      departments: decoded.departments || []
    });

    await createSession(req, user);
    return redirect('/');
  } catch {
    return redirect('/login?error=sso_failed');
  }
}
```

#### Retrofit checklist per CRM
- [ ] Complete 6-question reconnaissance (see CRM-INVENTORY.md)
- [ ] Add `/auth/sso` endpoint matching framework
- [ ] Install JWKS client for runtime
- [ ] Cache dashboard JWKS, refresh daily
- [ ] Email-match user lookup (full email, multi-domain)
- [ ] Set unique audience identifier
- [ ] Honour `super_admin: true` claim (bypass internal checks)
- [ ] Map `departments[]` to CRM-internal role
- [ ] Add audit log entry on SSO arrival
- [ ] Test all 4 roles end-to-end
- [ ] Deploy to production
- [ ] (Optional) Deprecate password login after 30-day grace

#### JWKS key rotation
Generate new RSA keypair every 90 days. Publish both keys during 24-hour overlap. `kid` header tells CRMs which key to use.

---

## 9. Phase B/C/D · CRM build-out (Weeks 8–16)

### Phase B · Cluster 2 shared-DB pipeline (Weeks 8–14)

Cluster 2 is **one shared database with four UIs** (Termsheet, Engagement Letter, Prospect DB, Spec Sheet). The `deals` table is the single source of truth; each UI is a stage-specific view over the same records.

```sql
-- Single shared table across all four Cluster 2 surfaces
create table deals (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null references entities(entity_id),
  stage text not null check (stage in (
    'termsheet', 'engagement', 'prospect', 'specsheet', 'closed', 'lost'
  )),
  prospect_name text,
  -- ... termsheet fields
  -- ... engagement fields
  -- ... prospect fields
  -- ... spec sheet fields
  -- (each stage adds its columns; nullable until that stage is reached)
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  owner_user_id uuid references auth.users(id),
  encrypted_notes text  -- AES-GCM encrypted
);

create index on deals(entity_id);
create index on deals(stage);
```

The `entity_id` foreign key references the central entities catalog. Adding a Venture Build entity to Cluster 2 later (e.g. Cubo pitching supply chain services) requires only an insert into `cluster_entities`; no schema migration.

Termsheet and Engagement Letter are existing CRMs whose data must migrate to this shared table. Budget: **1.5–2 weeks per UI** after schema lock. Prospect DB and Spec Sheet are greenfield Pattern B builds — bridge-only auth, ~1 week each.

### Phase D · Property Management (Weeks 13–16)

Greenfield Pattern B build. Collective-only scope. Separate Supabase project for data isolation from Cluster 2 deal pipeline.

---

## 10. Phase E · WhatsApp Business (Weeks 8–17)

### Reality
- WhatsApp Web (personal) cannot be embedded
- Each number = separate Meta Cloud API account
- Multi-account = multiple integrations in one UI
- Business verification: 1–2 weeks waiting (starts week 8)

### Schema
```sql
create table whatsapp_numbers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  phone_number_id text not null,
  business_account_id text not null,
  access_token_encrypted text not null,
  active boolean default true,
  created_at timestamptz default now()
);

create table whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  whatsapp_number_id uuid not null references whatsapp_numbers(id),
  conversation_with text not null,
  direction text check (direction in ('inbound', 'outbound')),
  content jsonb not null,
  whatsapp_message_id text unique,
  sent_at timestamptz default now()
);
```

### Non-negotiable
- Verify Meta's webhook signature every request
- Idempotency by `whatsapp_message_id` (unique constraint)
- Rate-limit outbound (1,000 conversations/day for new accounts)

---

## 11. Phase F · Deferred (Week 18+)

- **WeChat** — Overseas Official Account (SG entity limit). No WeChat Pay/Mini Programs.
- **Line** — ~1 week approval. Free first 500 msg/month then JPY 5,000/mo.
- **m.lifestyle suite** — Different business model (physical goods). Needs its own inventory, orders, fulfillment schemas. Separate scoping conversation.

---

## 12. Cost estimate

| Item | Monthly cost (SGD) | Notes |
|---|---|---|
| Vercel | $0 | Hobby tier for 2–3 staff |
| Supabase (dashboard) | $0 | Free tier sufficient |
| Supabase (per new CRM) | $0 each | Separate project per CRM, Free tier |
| Cloudflare Access | $0 | Up to 50 users free |
| Domain `meirverse.app` | ~$15–20/yr | Already owned |
| Google APIs | $0 | Within free quotas |
| AutoCount | (existing) | Unchanged — accessed via tile |
| WhatsApp Cloud API | $0 + per-conv | First 1,000 service convs/mo free |
| **Steady state base** | **~$0–35/mo** | ~$35 if Supabase Pro needed |

WhatsApp usage at 500 convs/month: ~SGD $20–40.

When to upgrade Supabase Pro ($35/mo): when you need (a) daily auto backups, (b) >500MB database, (c) point-in-time recovery, or (d) >50k monthly auth users. None apply at 2–3 staff.

---

## 13. Security checklist

### Non-optional
- [ ] Every Supabase table has RLS enabled with policies
- [ ] All `.env` files in `.gitignore`
- [ ] Session cookies: `domain=.meirverse.app`, `SameSite=Lax`, `Secure`, `HttpOnly`
- [ ] Notes encrypted client-side before storage
- [ ] WhatsApp webhook verifies Meta's signature
- [ ] Access tokens encrypted in Supabase (not plaintext)
- [ ] HTTPS only (Vercel + `.app` HSTS preload)
- [ ] CSP headers in `next.config.js`
- [ ] JWT signing keys rotated every 90 days
- [ ] JWT `aud` claim verified by every CRM
- [ ] JWT TTL ≤ 5 minutes for SSO
- [ ] Super Admin bypass logged in `sso_issuances`
- [ ] Department × role enforcement: dashboard refuses to issue JWT for CRM outside user's scopes
- [ ] Cloudflare Access enabled before public go-live
- [ ] Audit log: `sso_issuances` + general `security_events` table
- [ ] Backup: weekly export to R2/S3 (manual on Free tier)

### Same-root-domain risks
- Vulnerability in any `*.meirverse.app` subdomain can read cookies scoped to `.meirverse.app`. Mitigation: keep CRM session cookies scoped to their own subdomain. Only dashboard identity cookie is shared.
- CSRF risk increases. Mitigation: `SameSite=Lax` everywhere, anti-CSRF tokens on state-changing endpoints.

### Multi-domain auth risks
- A compromised personal Gmail of a staff member with a passkey grants dashboard access. Mitigation: Cloudflare Access policy should require WebAuthn for sensitive roles; require fresh re-auth for Super Admin actions.

---

## 14. How to use this document with Claude Code

1. Save as `ARCHITECTURE.md` in dashboard repo root
2. Save `CRM-INVENTORY.md` alongside — keep current
3. Save Phase 1 dashboard as `reference/phase1-dashboard.jsx`
4. Start every Claude Code session with: *"Read ARCHITECTURE.md and CRM-INVENTORY.md. We're on Phase X.Y."*
5. Update Status field as phases complete
6. When Claude Code suggests deviations, update the doc

### First prompt
```
Read ARCHITECTURE.md. Starting Phase 2.1 (Foundation).

Set up the project skeleton per section 8. Use TypeScript strict mode.
Stop after Vercel deployment is wired so I can verify dashboard.meirverse.app
is live before adding auth.

Don't add features beyond what section 8 lists.
```

The last line matters. Claude Code (like all of us) gets enthusiastic. Bounding scope per phase keeps you shipping.

---

## 15. Open questions

| Item | When needed | Status |
|---|---|---|
| Reconnaissance: Construction ERP (6 questions) | Before Week 5 | ✅ Resolved 2026-05-24 — pivot from retrofit to greenfield rebuild, see CRM-INVENTORY.md v4.2 |
| Reconnaissance: Termsheet (6 questions) | Before Week 9 | Pending |
| Reconnaissance: Engagement Letter (6 questions) | Before Week 10 | Pending |
| Cluster 2 shared `deals` schema design (field-level per stage) | Before Week 9 | Pending |
| MADE one-entity-or-two — keep as `made-commercial` + `made-venture` until clarified | Before Phase E | Default split applied |
| Sub-brands under Residential — names? | Anytime | Pending |
| Venture Build entities — do any need Cluster 2 or Cluster 3 participation at launch? | Before Week 8 | Default: Cluster 1 only |
| WhatsApp business entity (which Meir entity holds Meta accounts?) | Before Week 8 | Pending |
| Canonical Workspace domain allowlist (Cloudflare Access · Google `hd` · server callback) | Before Phase 2.2 (Week 2) | Sebestian to define |
| Real names for the 7 CRM subdomains | Before Week 5 | Pending |
| Approval policies (who approves what) | Before approvals module | Pending |
| Notification policies (who gets notified when) | Before notifications module | Pending |
| Next.js framework: stay on 14 vs. upgrade to 15/16 | Before any feature relying on middleware, CSP nonces, Image API, or i18n | Pending — Next 14.2.35 carries 9 advisories (Image-API DoS, CSP-nonce XSS, middleware/proxy bypass, RSC cache poisoning, SSRF via WebSocket upgrades, et al.); fix requires breaking-change upgrade to Next 16. Real exposure for the placeholder/internal tool is low (no images, no middleware yet, no nonces, no i18n) and Cloudflare Access gates the network edge. Revisit before Phase 2.2 ships middleware. |
| **Central-API tier (Vercel → Fly.io → Supabase)** | Revisit at Milestone 2 review (post-Week 17) | **Deferred · do not adopt now.** Full trade-off analysis in §16. Trigger conditions for adopting: 3+ CRMs live AND copy-pasted department-permission logic across them AND a cross-CRM aggregation use case AND/OR a multi-provider webhook surface. None apply at Phase A. |

---

## 16. Considered-and-deferred: central-API tier (Vercel → Fly.io → Supabase)

A real pattern, widely used (Resend, PostHog, many SaaS), but not right
for the Meirverse Dashboard at Phase A scale. Documenting here so the
trade-off doesn't have to be re-derived when the question resurfaces.

### The proposed shape

```
underwriting.meirverse.app  (Vercel) ─┐
budgeting.meirverse.app     (Vercel) ─┤──► api.meirverse.app (Fly.io)  ──►  Supabase
some-erp.meirverse.app      (Vercel) ─┘
```

Three tiers instead of two: every CRM frontend talks to a shared API
on Fly.io, which talks to Supabase. The dashboard becomes the auth +
identity issuer; the central API becomes the business-logic + data
broker.

### What changes vs the locked v4 architecture

| Concern                          | Locked (v4)                                 | Proposed                                              |
|----------------------------------|---------------------------------------------|-------------------------------------------------------|
| Where business logic lives       | Inside each Next.js app                     | Centralised in the Fly.io API                         |
| Where authz/permission lives     | Supabase RLS (per-table policies)           | Re-implemented in the API server                      |
| How CRMs read data               | Direct from Supabase with user JWT (RLS)    | Through the central API                               |
| Real-time updates                | Native Supabase subscriptions per CRM       | Re-broker via API (more code, more state)             |
| Webhook handlers                 | Next.js route handlers or per-CRM workers   | Fly.io API (natural fit)                              |
| Cron / background jobs           | Vercel Cron + Supabase Edge Functions       | Fly.io (cleaner)                                      |
| Cost steady-state                | ~$0–35/mo (free tiers)                      | +Fly.io paid (~$30–60/mo more, scales with traffic)   |
| Deployment surfaces              | One Vercel project per CRM + dashboard      | + Fly.io API as a third surface                       |
| Independence of CRMs             | High — each fully self-contained            | Low — all share the API contract                      |

### The case for adopting it eventually

1. **Cross-CRM data flows.** "Show me, for this client, every Termsheet,
   every Engagement Letter, every WIP claim, every project status
   across Construction ERP, ranked by activity." N+1 calls today, one
   call via central API.
2. **Shared business logic that's painfully duplicated.** Department ×
   Role permission checks, audit log writes, JWT rotation, WhatsApp
   send-and-log. If the same 200 lines copy-paste into every CRM, that's
   a signal.
3. **Logical home for webhooks + cron + queues.** WhatsApp webhooks,
   scheduled report generation, AutoCount CSV ingestion, daily backups
   — easier on Fly.io than scattered across Vercel project crons.

### Why not now

- **§4 explicitly chose 3-layer enforcement with RLS as Layer 3.**
  Centralising means re-implementing what Supabase already gives for
  free, and the audit story changes: you trust the API server, not
  the database.
- **§6 explicitly chose "signed-JWT bridge" to keep CRMs independent.**
  A central API undoes that deliberately.
- **You don't yet have the cross-CRM use cases.** Until 3+ CRMs are
  in production, you can't see which logic is genuinely shared. Premature
  factoring locks in the wrong API contract.
- **Supabase RLS works best when the client talks to Supabase
  directly with a user-scoped JWT.** Once an API sits in front, the
  pattern becomes "service role can do anything; API enforces
  permissions" — same auth/authz code, just rewritten.
- **Cost + operational burden** at 2–3 staff scale: another deploy
  pipeline, another runtime to monitor, another bill, another failure
  mode.
- **It blocks Milestone 1.** Adopting means designing the central API
  contract before any CRM ships. 3–4 weeks of pre-work for value that
  doesn't accrue until CRM #3+.

### Trigger conditions to revisit

ALL of these holding at once justifies the central API:

1. ≥3 CRMs live, AND
2. >200 lines of department-permission logic copy-pasted across them, AND
3. A concrete cross-CRM aggregation feature that supabase-js can't serve
   cleanly in one round-trip, AND
4. ≥2 webhook providers in production whose handlers are cramped inside
   Vercel route handlers.

If only 1–2 conditions hold, simpler patterns suffice (shared NPM package
for the duplicated logic; Supabase Edge Functions for the cross-CRM
aggregation; one dedicated Vercel project for webhook handlers).

### What a migration would look like (if it ever happens)

Not a rewrite — a strangler-fig:

1. Stand up `api.meirverse.app` on Fly.io with one endpoint (e.g.
   `GET /v1/client/:id/timeline`) that no CRM uses yet.
2. Migrate ONE specific feature (e.g. the announcement broadcast that
   currently writes from the dashboard) to flow through the API.
3. Each subsequent CRM points its few cross-cutting reads at the API;
   per-resource reads stay direct-to-Supabase with RLS.
4. Six months later, evaluate whether the API tier is paying for itself.

Decision logged here so the next person asking "should we add Fly.io?"
sees the analysis without re-deriving it.

---

*Document version 4.5 · 25 May 2026 · §15 new row for central-API tier (Vercel → Fly.io → Supabase) deferred to Milestone 2 review · §16 added with full trade-off analysis, trigger conditions, and strangler-fig migration sketch — none of which apply at Phase A · Phase 2.3 SQL migrations landed in supabase/migrations/ (schema + RLS + seed) — no schema text changes in this doc, but rows live now*

*Document version 4.4 · 24 May 2026 · Construction ERP pivot from retrofit to greenfield rebuild reflected (§7 wk 6-7 retrofit→rebuild · §8 Phase 2.5 scope note added · §15 recon row marked ✅ resolved with cross-reference to CRM-INVENTORY.md v4.2) · Next.js 14 vs 15/16 upgrade decision tracked as new §15 row*

*Document version 4.3 · 23 May 2026 · Multi-domain whitelist clarified to three-layer enforcement (Cloudflare Access · Google OAuth `hd` · server callback) · hybrid Workspace topology captured · §1 TL;DR + lock 5, §4 Layer 2 box, §8 Phase 2.2 step 1 + Claude Code prompt, §15 open questions all updated accordingly*
