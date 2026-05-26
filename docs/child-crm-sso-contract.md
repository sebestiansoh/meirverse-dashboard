# Child-CRM SSO Contract

> The canonical "how to plug into the Meirverse Dashboard" reference.
> Every Internal Child (HR, ERP, CRM, Finance, Inventory, Underwriting,
> any future ones) implements this contract. Read this first when
> scaffolding a new child or retrofitting an existing one.
>
> Source of truth for the dashboard side: this repo's
> `app/api/sso/issue/route.ts`, `app/.well-known/jwks.json/route.ts`,
> `lib/auth/jwt-sign.ts`, `lib/auth/jwt-keys.ts`,
> `lib/auth/audiences.ts`.

---

## 1 · The flow at a glance

```
 ┌───────────────────────────────┐
 │  User on dashboard.meirverse  │
 │  Quick Launch → clicks tile   │
 └──────────────┬────────────────┘
                │ POST /api/sso/issue {audience}
                ▼
 ┌──────────────────────────────────────────────────────┐
 │  Dashboard — app/api/sso/issue/route.ts              │
 │   1. Auth: getCurrentUserContext() (no session→401)  │
 │   2. Layer 3 domain re-check (allowlist)             │
 │   3. Audience lookup (audiences.ts CRM_AUDIENCES)    │
 │   4. Permission gate (userHasAudienceAccess)         │
 │   5. mintBridgeToken — RS256 JWT, 5-min TTL          │
 │   6. Insert audit row into sso_issuances             │
 │   7. Return { ok, redirect, expiresAt, audience, jti}│
 └──────────────┬───────────────────────────────────────┘
                │ Browser navigates to redirect URL
                ▼
 ┌──────────────────────────────────────────────────────┐
 │  Child CRM — GET <child>.meirverse.app/auth/sso?     │
 │              token=<jwt>                              │
 │   1. Verify JWT against dashboard JWKS               │
 │   2. Find-or-create local user keyed on JWT `sub`    │
 │   3. Optionally write a local audit row              │
 │   4. Set the child's own session cookie              │
 │   5. Redirect to / (or whatever post-login landing)  │
 └──────────────────────────────────────────────────────┘
```

The dashboard issues identity; the child establishes its own session.
The JWT is **single-use, audience-bound, 5-min TTL** — it gets the user
*through the door* of one specific child. Long-lived session lives at
the child.

---

## 2 · The JWT envelope (what the dashboard signs)

```json
{
  "alg": "RS256",       // header
  "kid": "734541…",     // header — points at one of the keys in JWKS
  "typ": "JWT",

  "sub":         "<uuid from auth.users>",
  "email":       "alice@meir.sg",
  "super_admin": false,
  "departments": [                                // legacy compat shape
    { "department": "hr", "role": "director" }
  ],
  "scopes": ["hr:admin"],                         // computed per audience
  "iss":  "https://dashboard.meirverse.app",
  "aud":  "hr",                                   // CRM-specific
  "iat":  1779804000,
  "exp":  1779804300,                             // iat + 300
  "jti":  "<random uuid>"                         // unique per issuance
}
```

**Hard contract for verifiers (`aud` rejection means do NOT issue
session):**

- `iss === "https://dashboard.meirverse.app"`
- `aud === "<your CRM's audience identifier>"` (e.g. `"hr"`, `"erp"`)
- `exp` is in the future (no leeway beyond ~30s clock skew)
- `kid` matches one of the keys in the JWKS at issuance time
- Signature verifies against that key

**Soft contract (use, don't reject on):**

- `super_admin: true` → child should grant admin-equivalent privileges
- `departments[]` → legacy compat; new code reads `scopes[]` instead
- `scopes[]` → array of `"<aud>:<level>"` strings; level ∈ `admin · write · write-own · read`

---

## 3 · JWKS — fetch, cache, key rotation

The dashboard publishes its current public keys at:

```
GET https://dashboard.meirverse.app/.well-known/jwks.json
```

Standard JWK Set format (RFC 7517):

```json
{
  "keys": [
    {
      "kty":"RSA","use":"sig","alg":"RS256",
      "kid":"734541881406b026",
      "n":"…base64url…","e":"AQAB"
    },
    {
      // During a 24h key-rotation overlap, the PREVIOUS key sits here too.
      "kty":"RSA","use":"sig","alg":"RS256",
      "kid":"<previous kid>",
      "n":"…","e":"AQAB"
    }
  ]
}
```

**Caching rules every child must follow:**

- Cache the JWKS response for **24 hours** (matches the response's
  `Cache-Control: public, max-age=300, stale-while-revalidate=86400`).
- On `kid` not found in cache, **re-fetch the JWKS** before rejecting.
  This handles key rotation gracefully — old JWTs (issued before
  rotation) still verify because both keys are published during the
  overlap window.
- Never cache forever. Never skip the signature verification.

Reference implementation in any Node/TS child:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(
  new URL("https://dashboard.meirverse.app/.well-known/jwks.json"),
  { cacheMaxAge: 24 * 60 * 60 * 1000 },  // 24h
);

export async function verifyDashboardJwt(token: string, expectedAud: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer:   "https://dashboard.meirverse.app",
    audience: expectedAud,
    algorithms: ["RS256"],
  });
  return payload;  // typed as JWTPayload — narrow to our shape per §2
}
```

---

## 4 · The child's `/auth/sso` endpoint — required behaviour

Every child CRM exposes exactly one route:

```
GET <child>.meirverse.app/auth/sso?token=<jwt>
```

Reference handler (Next.js App Router):

```ts
// app/auth/sso/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { verifyDashboardJwt } from "@/lib/dashboard-sso";
import { findOrCreateUser, createSession } from "@/lib/auth";

const AUDIENCE = "hr";  // change per child: erp, crm, finance, …

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/?sso_error=missing_token", req.url));
  }

  let payload;
  try {
    payload = await verifyDashboardJwt(token, AUDIENCE);
  } catch (err) {
    console.error("[auth/sso] verify failed:", err);
    return NextResponse.redirect(new URL("/?sso_error=invalid_token", req.url));
  }

  // Find-or-create on JWT `sub` (which IS the auth.users.id from the
  // Internal DB — all Internal CRMs share that table). No mirror.
  const user = await findOrCreateUser({
    id:           payload.sub as string,
    email:        payload.email as string,
    isSuperAdmin: payload.super_admin === true,
  });

  // Set the child's own session (cookie/JWT/whatever — its choice).
  const res = NextResponse.redirect(new URL("/", req.url));
  await createSession(res, user);
  return res;
}
```

**Things the child MUST do:**

1. Verify signature + `iss` + `aud` + `exp` (see §3).
2. Key user lookups on **`sub`** (`auth.users.id`), not email. Email
   can change; `sub` is stable.
3. Honour `super_admin: true` — grant the same in-CRM admin
   privileges that the child's own admin role would grant.
4. Create the local user if not seen before (no separate enrolment
   step — first SSO arrival auto-provisions).
5. Establish the child's own session cookie/token; do **not** re-use
   the dashboard's JWT as a session.

**Things the child MUST NOT do:**

1. Mint its own session before verifying the JWT.
2. Trust any claim other than `sub`, `email`, `super_admin`, `scopes`,
   `departments`. Anything else may be added but should be ignored if
   unrecognised.
3. Accept a JWT outside its own `aud`. A token for `aud: "hr"` must
   not work at the ERP.
4. Cache the JWKS forever (re-fetch on unknown `kid`).
5. Accept `exp` in the past (no "grace period" beyond ~30s skew).

---

## 5 · User auto-provisioning — DB-level details

Because every Internal CRM shares the Internal DB's `auth.users` table
(per Conflict #3 closure / D-C consolidation), the child does **not**
maintain a mirror user table. It maintains a join table or a
profile-extension table keyed on `auth.users.id`.

Example HR profile extension:

```sql
create table hr.employee_profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  company          text not null references public.company(company_id),
  employment_start date,
  job_title        text,
  reporting_to     uuid references auth.users(id),
  created_at       timestamptz not null default now()
);
```

The auto-provisioning step in `/auth/sso` just inserts a row here if
one doesn't exist. The `auth.users` row is already there (created by
Supabase when the user first authenticated on the dashboard).

---

## 6 · Audit on the child side (optional but encouraged)

Each child should log SSO arrivals in its own table so debugging a
"who landed here when" question doesn't require cross-DB joins:

```sql
create table <schema>.sso_arrivals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  jti         text not null,  -- the JWT's jti — pair with dashboard's sso_issuances
  arrived_at  timestamptz not null default now(),
  user_agent  text,
  ip          text
);
```

The dashboard's `public.sso_issuances` records the mint side; the
child's `sso_arrivals` records the landing side. Same `jti` is the
join key.

---

## 7 · Logout — dashboard vs child sessions

Today's behaviour: signing out at the dashboard does **not** propagate
to active child sessions. Each child has its own session cookie that
expires independently.

If you want unified logout in a later phase, the dashboard would
broadcast a logout event (websocket / SSE / polling) and each child
would tear down its session in response. Not in scope for Phase 1.

---

## 8 · Error UX — what users see when SSO fails

| Failure | Dashboard tile UX | Child's URL response |
|---|---|---|
| Dashboard env JWT key unset | Tile shows red "The SSO signing key is unavailable." | n/a — JWT never minted |
| User not in `ALLOWED_EMAIL_DOMAINS` | Tile click → 403 + tile error | n/a |
| User has no access to audience | Tile is hidden in Quick Launch grid (filter happens server-side in `visibleAudiencesFor`) | n/a |
| Token expired / signature bad | Tile minted OK; redirect lands at child | Child redirects to `/?sso_error=invalid_token` |
| `aud` mismatch | Tile minted OK | Child redirects to `/?sso_error=invalid_token` |
| Child internal error during user create | Tile minted OK | Child shows its own 500 (out of dashboard's scope) |

---

## 9 · Key rotation operational note

Every 90 days, the dashboard rotates its RS256 keypair. The rotation
sequence:

1. Generate new keypair + new `kid`.
2. Set `JWT_PRIVATE_KEY_PEM_PREVIOUS`, `JWT_PUBLIC_KEY_PEM_PREVIOUS`,
   `JWT_KEY_ID_PREVIOUS` to the **current** values.
3. Set `JWT_PRIVATE_KEY_PEM`, `JWT_PUBLIC_KEY_PEM`, `JWT_KEY_ID` to
   the **new** values.
4. Redeploy. Both keys now appear in `/.well-known/jwks.json`.
5. Wait 24h — any JWTs still in flight (5-min TTL means they're
   long-dead, but 24h covers paranoia + caching drift).
6. Delete the `*_PREVIOUS` env vars; redeploy. Only the new key in
   JWKS.

Children that follow §3's caching rules need no manual intervention.

---

## 10 · Checklist for plugging in a new child

- [ ] Audience entry added to `lib/auth/audiences.ts` (this repo)
- [ ] Audience matches `CRM-INVENTORY.md` row
- [ ] Subdomain DNS configured (Cloudflare CNAME → Vercel)
- [ ] Child repo deploys to that subdomain
- [ ] Child implements `/auth/sso` per §4
- [ ] Child uses `jose` (or equivalent) JWKS verifier with 24h cache
- [ ] Child finds-or-creates user keyed on `sub`
- [ ] Child has its own session mechanism
- [ ] Child surfaces `sso_error` URL params to the user gracefully
- [ ] Child written audit (`sso_arrivals` or equivalent) is optional
      but recommended
- [ ] Test plan: sign in as Super Admin, click tile, land at child;
      sign in as non-Super-Admin without that department, confirm
      tile is hidden in Quick Launch

---

*Document version 1.0 · 26 May 2026 · Living document — update
when the JWT envelope or the child contract changes.*
