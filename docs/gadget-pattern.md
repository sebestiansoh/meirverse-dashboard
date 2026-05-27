# Gadget Pattern — adding API plug-ins to the dashboard

> **v1.0 · 2026-05-27 · Meirverse Internal Dashboard**
>
> A **Gadget** is a self-contained dashboard tile that surfaces data from
> one OAuth-gated third-party API. Calendar, Drive, Keep, Microsoft To
> Do, Outlook Calendar — all the small "viewer" widgets — are gadget
> instances. The Tasks widget is **not** a gadget (it has mutations +
> cross-source orchestration); see `_widgets/tasks-widget.tsx` for the
> bespoke pattern.
>
> Per Mandate §"Dashboard plug-ins" and §"Channels", every API plug-in
> routes through the same trust boundary. Gadgets formalise that pattern
> so adding a new provider/endpoint is **config, not scaffolding**.

---

## Why this exists

Before this pattern, adding a new API tile required writing ~8 files of
near-identical scaffolding (token table, refresh helper, `authedFetch`,
server actions, widget shell, polling hook, connect-prompt, render
component). With the Gadget pattern, adding a tile is:

1. Add the OAuth scope to the provider's scope list (one line).
2. Write the API wrapper (one function in `lib/<provider>/api.ts`).
3. Write the server action (one function in `_actions/<provider>.ts`).
4. Write the gadget instance (one file in `lib/gadgets/instances/`).
5. Mount it on the dashboard home (one import).

No new token storage, no new refresh logic, no new polling code, no new
shell/skeleton/connect UI. The framework provides everything else.

---

## Anatomy of a Gadget

```ts
interface Gadget<TData, TVariant extends string = string> {
  id: string;                         // "google.calendar", "google.keep", "microsoft.todo"
  provider: GadgetProvider;           // "google" | "microsoft" (extend in lib/gadgets/types.ts)
  title: string;                      // serif heading — "Upcoming"
  subtitle: string;                   // uppercase tagline — "Google Calendar"
  footerLink?: { href; label };       // optional "Open … →" link
  variants?: ReadonlyArray<{key, label}>;  // tab strip; undefined = no tabs
  defaultVariant?: TVariant;          // initial tab
  fetcher: (variant) => Promise<TData | null>;
  render: ({data, variant}) => ReactNode;
  emptyMessage: (variant) => string;
  isEmpty?: (data) => boolean;        // defaults to Array.isArray && length === 0
  pollIntervalMs?: number;            // default 60_000
}
```

The contract is fully declarative: the framework's `<Gadget>` component
reads the config and handles every lifecycle state.

### Provider

The `provider` field gates the gadget on an OAuth connection:

- `"google"` — uses `lib/google/refresh-access-token.ts`. Token lives in
  `user_google_tokens`. `null` from the fetcher → "Connect Google" CTA.
- `"microsoft"` — uses `lib/microsoft/refresh-access-token.ts`. Token in
  `user_microsoft_tokens`. (When that wiring lands.)

To add a third provider (e.g. GitHub for a PR-review widget):

1. Create `lib/<provider>/{api,refresh-access-token,scopes,store-tokens}.ts`
   mirroring the Google ones.
2. Create `supabase/migrations/…_user_<provider>_tokens.sql`.
3. Extend `GadgetProvider` in `lib/gadgets/types.ts`.
4. Extend `<ConnectPrompt>` in `lib/gadgets/connect-prompts.tsx` with the
   new provider's CTA.
5. Wire the OAuth callback to capture the new provider's refresh token.

That's the only time you'll touch the framework. After that, every
gadget on the new provider is config-only.

### States

The framework renders four states automatically:

| Fetcher return        | UI |
|---|---|
| `undefined` (loading) | `<WidgetSkeleton />` shimmer |
| `null`                | `<ConnectPrompt provider=... />` — provider-specific CTA |
| `T` but empty         | `<WidgetEmpty message={emptyMessage(variant)} />` |
| `T` with data         | `render({data, variant})` |

"Empty" means `Array.isArray(data) && data.length === 0` unless the
gadget supplies its own `isEmpty(data)`. The polling hook resets to
`undefined` whenever the variant changes — so a tab switch always shows
the skeleton, never stale data.

### Polling

The framework uses `usePollingData` (60 s default, configurable via
`pollIntervalMs`). Polling pauses when `document.visibilityState !==
"visible"` and fires immediately on tab focus. There's no live channel
(SSE / websocket) by design — gadgets are eventually-consistent and
read-only.

---

## Writing a new gadget — checklist

1. **OAuth scope.** Append to the provider's scope file
   (`lib/google/scopes.ts` for Google). Add the same scope in the
   provider's console (Google Cloud → Data Access; Azure → API
   permissions). Users will be re-prompted on next sign-in.

2. **API library enabled.** For Google APIs, enable the API in Google
   Cloud → API Library. **OAuth scope alone is not enough** — the API
   must also be enabled. (Tasks API, Calendar API, Drive API, Keep API
   are all separate library entries.)

3. **API wrapper.** Add a typed function in `lib/<provider>/api.ts`
   that calls the endpoint via the provider's `authedFetch` and returns
   typed data. Return `null` on auth failure (no token, refresh failed,
   API not enabled, scope not granted). Log errors via `console.error`.

4. **Server action.** Add a `"use server"` function in
   `app/(dashboard)/_actions/<provider>.ts` that reads
   `getCurrentUserContext()` and calls the API wrapper. This becomes
   the gadget's `fetcher`.

5. **Gadget instance.** Add `lib/gadgets/instances/<provider>-<thing>.tsx`:
   ```tsx
   "use client";
   import { Gadget, type GadgetConfig } from "@/lib/gadgets/gadget";
   import { fetchMyKeepNotes } from "@/app/(dashboard)/_actions/google";
   import type { KeepNote } from "@/lib/google/api";

   const config: GadgetConfig<KeepNote[]> = {
     id: "google.keep",
     provider: "google",
     title: "Notes",
     subtitle: "Google Keep",
     footerLink: { href: "https://keep.google.com", label: "Open Google Keep →" },
     fetcher: () => fetchMyKeepNotes(),
     render: ({ data }) => ( /* JSX */ ),
     emptyMessage: () => "No notes yet.",
   };

   export function KeepGadget() {
     return <Gadget config={config} />;
   }
   ```

6. **Mount it.** Import in `app/(dashboard)/page.tsx` and drop into the
   grid alongside the others.

That's the whole loop. No new shell. No new skeleton. No new connect
prompt. No new token logic.

---

## When NOT to use the Gadget pattern

The pattern is intentionally narrow — **read-only, single-source data
viewer with optional tab switching**. Use a bespoke widget instead if:

- The widget has **mutations** that must propagate back to the
  source (mark-done, create-note-from-form). Gadgets are pure
  viewers. (Counter-example: `_widgets/tasks-widget.tsx` has Google
  PATCH + Supabase UPDATE + an inline assign form. Bespoke.)
- The widget **merges multiple data sources** (e.g. Google Tasks list
  + Supabase assigned tasks in the same UI). Gadgets are 1:1 with one
  fetcher.
- The widget needs **per-row interactive state beyond rendering**
  (drag-to-reorder, inline-edit). Gadgets re-fetch and re-render
  wholesale.
- The widget triggers **back-end side-effects** (notifications,
  audit-log writes). Those belong in server actions invoked from a
  bespoke widget, not from a gadget config.

If two of those apply, the answer is bespoke. If one applies and it's
narrow, you can sometimes wrap a gadget with a thin custom shell —
but the default answer is "write a bespoke widget."

---

## File layout

```
lib/gadgets/
  types.ts                    # GadgetProvider, GadgetConfig, Gadget<T,V>
  gadget.tsx                  # the generic <Gadget> component
  connect-prompts.tsx         # provider-aware "Connect …" CTA
  instances/
    google-calendar.tsx       # CalendarGadget — wraps <Gadget config={...}/>
    google-drive.tsx          # DocumentsGadget
    google-keep.tsx           # KeepGadget
    microsoft-todo.tsx        # (future)
    outlook-calendar.tsx      # (future)
    onedrive.tsx              # (future)
```

The shared infrastructure (`use-polling-data.ts`, `widget-shell.tsx`)
stays under `app/(dashboard)/_widgets/` because it's also used by
bespoke widgets like Tasks. The Gadget framework imports from there.

---

## APIs considered but not gadget-able

The Gadget pattern assumes the API supports **end-user OAuth** with a
standard scope grant on the consent screen. Not every Google API does.
Vet auth model before promising a gadget.

| API | Auth model | Gadget-able? |
|---|---|---|
| Google Tasks | End-user OAuth, scope `auth/tasks` | ✅ Yes — shipped (bespoke widget, has mutations) |
| Google Calendar | End-user OAuth, scope `auth/calendar.events.readonly` | ✅ Yes — shipped |
| Google Drive | End-user OAuth, scope `auth/drive.readonly` | ✅ Yes — shipped |
| Google Gmail | End-user OAuth, scope `auth/gmail.readonly` | ✅ Yes (when wired) |
| Google Photos | End-user OAuth (Library API), scope `auth/photoslibrary.readonly` | ✅ Yes (when wired) |
| **Google Keep** | **Service-account domain-wide delegation only** | ❌ **No** — see below |
| Google Chat | Mostly bot-only (service account); user OAuth limited | ⚠️ Partial — needs case-by-case |
| Google Admin SDK | Admin-only (admin scope on admin account) | ❌ Different pattern (admin tooling) |

### Why Keep specifically isn't a gadget

The Google Keep API (released March 2023) is intentionally designed for
**enterprise admin-mediated access only**. It does NOT accept the
`auth/keep.readonly` or `auth/keep` scopes via the standard end-user
OAuth consent flow — the consent screen rejects them as "invalid",
which is the same error you'd see for any non-existent scope string.

To use Keep API you need:
1. A service account in your Cloud project
2. Workspace admin to grant that service account the Keep scope at
   admin.google.com (Security → API Controls → Domain-wide Delegation)
3. Server-side JWT assertion using the service-account key with
   per-user `sub` impersonation

That's a different code path (`google-auth-library` + service-account
JSON key + JWT mint per request), distinct from the
`getGoogleAccessToken(userId)` refresh-token flow that powers every
other Google gadget. It's a ~2-hour build, not a config change. If
Keep ever becomes a high-value surface, build it as a bespoke
service-account-backed widget — not as a gadget. The Gadget pattern
deliberately stays narrow: **end-user OAuth, read-mostly, one source**.

This was attempted on 2026-05-27 and reverted. See the stub at
`lib/gadgets/instances/google-keep.tsx` and the comment in
`lib/google/scopes.ts`.

---

## Open extension points

Two things this v1.0 spec deliberately defers:

- **Per-user gadget visibility / ordering.** Today every signed-in
  user sees every gadget mounted on the dashboard home. A future
  iteration will likely route gadget visibility through the per-user
  access matrix (`user_access` table) and let users drag-reorder
  tiles. The gadget `id` field is the future foreign key.
- **Cross-DB gadgets.** Once the Fly.io API gateway is up (Mandate
  §"API gateway — mandatory routing"), gadgets that need cross-DB
  reads will route through the gateway instead of calling Supabase
  directly. The gadget `fetcher` is the right seam — swap its
  implementation, the rest stays.

Both are intentionally out of scope until a Child actually needs them.

---

*Authored 2026-05-27 alongside the Google Keep gadget. Refactor of the
existing Google Calendar + Drive widgets onto this pattern shipped in
the same commit.*
