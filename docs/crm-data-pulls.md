# Cross-CRM data pulls (server-to-server)

Decision logged 2026-05-25 (per access-logic clarification): some HR pages
should render data that lives in other CRMs (e.g. an employee profile shows
their current project assignments from the GCB ERP). Rather than embed via
iframe or copy/replicate data, we use **server-to-server calls between
sibling CRMs, acting on behalf of the signed-in user.**

This is NOT the centralised-API-tier pattern from §16 of `ARCHITECTURE.md`
(that's still deferred). Each CRM remains self-contained and owns its own
data; cross-CRM reads happen at request time via the same SSO bridge that
already issues user-bound JWTs.

The rest of this doc is the design + a code sketch. **No code in this repo
implements it yet** — it's Phase 4 of the HR rebuild and depends on the ERP
shipping HTTP API endpoints first.


## The mental model

```
┌─────────────────┐  user clicks "View profile" in HR
│ Browser         │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ hr.meirverse.app/profile/<employee>     │
│  1. read HR session (iron-session)      │
│  2. for cross-CRM data needs, call      │
│     internal /api/erp-proxy route       │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ hr.meirverse.app/api/erp-proxy/...      │
│  3. ensure user has scope               │
│  4. fetch fresh ERP-audience JWT for    │
│     this user from dashboard            │
│  5. call ERP endpoint with that JWT     │
│  6. return response to HR client        │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│ gcb-erp.meirverse.app/api/...           │
│  7. verify JWT (same code path as the   │
│     /auth/sso landing)                  │
│  8. enforce ERP's own authz             │
│  9. return JSON                         │
└─────────────────────────────────────────┘
```


## Why each piece is the way it is

### Why HR's server (not the browser) makes the cross-CRM call

- Hides the ERP's existence from the browser — the user sees only HR.
- Lets HR cache responses (e.g. 30s TTL on project assignments).
- Keeps the ERP's API endpoints scoped to first-party callers (CORS denies
  arbitrary origins; only HR's server-side fetch passes).
- Lets HR redact / shape the response before returning to the browser.

### Why a fresh dashboard-issued JWT (not a stored token)

The HR session cookie carries a *snapshot* of departments + scopes from
when SSO landed. We don't want to give the ERP a stale snapshot. Mintinga fresh JWT on each cross-CRM call lets the dashboard re-check current
permission state (departments may have changed) and binds the token to a
short TTL (5 min) — limiting blast radius if anything leaks.

### Why act on behalf of the user (not service-to-service)

- The ERP's authz already understands user-scoped permissions (RLS using
  the user_id from the verified JWT). Reusing it keeps logic in one place.
- Audit trail is per-user (`sso_issuances` shows who triggered each
  cross-CRM read).
- Avoids growing a parallel service-token system.


## Required dashboard change (minor)

The current `POST /api/sso/issue` issues a JWT and returns a *redirect URL*
suitable for full-page navigation. For server-to-server use, we want the
*raw token* (HR will set it as an Authorization header, not redirect to it).

Add an opt-in `mode` field:

```ts
// In app/api/sso/issue/route.ts
interface IssueRequestBody {
  audience?: unknown;
  mode?: "redirect" | "token";  // default "redirect" preserves today's behaviour
}

// In the success branch:
const responsePayload =
  body.mode === "token"
    ? { ok: true, token: minted.token, expiresAt: …, audience: …, jti: … }
    : { ok: true, redirect: ssoLandingUrl(audience, minted.token), … };
```

The auth check, audience validation, permission gate, audit log — all stay
the same. Token mode just omits the `ssoLandingUrl()` wrap.


## Required ERP change (larger)

The ERP currently exposes:
- `GET /auth/sso?token=…` — bridge landing (UI flow)
- `GET /sso-failed` — error page
- `POST /auth/signout` — local + dashboard signout

For HR to pull data, ERP needs `/api/…` JSON endpoints that:

1. Read `Authorization: Bearer <jwt>` header (not the iron-session cookie).
2. Verify the JWT with the same `verifyBridgeToken` from `lib/sso/verifier.ts`.
3. Enforce internal authz based on the verified `departments` + `scopes`.
4. Return JSON.

Sketch:

```ts
// In gcb-erp's app/api/employees/[userId]/projects/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { verifyBridgeToken } from "@/lib/sso/verifier";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer (.+)$/i);
  if (!match || !match[1]) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 401 });
  }

  let claims;
  try {
    claims = await verifyBridgeToken(match[1]);
  } catch (err) {
    return NextResponse.json({ ok: false, error: "verify_failed" }, { status: 401 });
  }

  // Authz: only the user themselves, their reports_to chain, HR Directors,
  // Operations Directors, and Super Admin should be able to read someone
  // else's project assignments.
  const { userId } = await params;
  const callerCanRead =
    claims.super_admin ||
    claims.sub === userId ||
    claims.departments.some(
      (d) =>
        (d.department === "hr" || d.department === "operations") &&
        d.role === "director",
    );
  if (!callerCanRead) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // Pull from ERP's own DB.
  // (Service-role client for now; Phase 1's custom-JWT RLS would let us
  //  use the anon client here too.)
  const rows = await fetchProjectsForUser(userId);

  return NextResponse.json({
    ok: true,
    user_id: userId,
    projects: rows,
  });
}
```

CORS on ERP's `/api/...` should be **server-only** — no `Access-Control-Allow-Origin`
header at all, so browsers refuse cross-origin calls. Only direct server-to-
server fetches (no CORS preflight) can reach these endpoints.


## HR's proxy route

HR's server keeps the dashboard JWT brief (one per request — or per page
load with in-memory caching of 30s) and forwards to the ERP.

```ts
// In hr's app/api/erp/employees/[userId]/projects/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/sso/session";

const DASHBOARD_URL =
  process.env["DASHBOARD_ISSUER_URL"] ?? "https://dashboard.meirverse.app";
const ERP_API_BASE =
  process.env["ERP_API_BASE"] ?? "https://gcb-erp.meirverse.app";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  // 1. Auth — HR session must be present.
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }

  // 2. Fetch a fresh ERP-audience JWT from the dashboard, acting on this
  //    user's behalf. The dashboard re-checks the user's permission for
  //    the construction-erp audience as part of the mint.
  //    Note: this requires propagating the user's dashboard session cookie
  //    — see below for the "session bridge" approach.
  const mintRes = await fetch(`${DASHBOARD_URL}/api/sso/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Forward the user's dashboard session cookie. This works because
      // the dashboard cookie is scoped to `.meirverse.app` (per
      // lib/supabase/middleware.ts), so it's already present in HR's
      // request and we can pass it through.
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ audience: "construction-erp", mode: "token" }),
  });

  if (!mintRes.ok) {
    return NextResponse.json(
      { ok: false, error: "mint_failed", upstream: await mintRes.json() },
      { status: 502 },
    );
  }

  const { token } = (await mintRes.json()) as { token: string };

  // 3. Call the ERP endpoint with the minted JWT.
  const { userId } = await params;
  const erpRes = await fetch(
    `${ERP_API_BASE}/api/employees/${encodeURIComponent(userId)}/projects`,
    {
      headers: { authorization: `Bearer ${token}` },
      // Server-side fetch — no browser CORS involved.
      cache: "no-store",
    },
  );

  // 4. Forward the upstream response transparently.
  const body = await erpRes.text();
  return new NextResponse(body, {
    status: erpRes.status,
    headers: { "Content-Type": erpRes.headers.get("content-type") ?? "application/json" },
  });
}
```


## The "session bridge" caveat

The above relies on HR's request including the user's dashboard session
cookie so the cross-CRM mint succeeds. This works because the dashboard
cookie is scoped to `.meirverse.app` — it travels with requests to any
subdomain. The browser sends the cookie to HR; HR's server reads it from
`request.headers.get("cookie")` and forwards it to the dashboard.

Two failure modes to handle:

1. **User signed out of dashboard but still has HR cookie.** HR's session
   cookie outlives the dashboard's session by some amount in some
   sequences. When that happens, the mint call returns 401 from the
   dashboard and HR should gracefully fall back to "ERP data unavailable
   — re-launch from dashboard to refresh."

2. **HR's server is in a different network zone than the user.** Not
   currently an issue (Vercel runs HR's server-side; user's browser is
   the only client). If we ever move HR's server-side to a different
   network (e.g. an internal worker), it can't forward the user's cookie
   and we'd need to switch to a service-token model for that path.


## Caching guidance

- **Don't cache responses across users.** Every cross-CRM call is
  user-scoped.
- **Do cache responses per (user, endpoint) for 30s.** Most use cases
  (employee profile page) make multiple ERP reads in one render — caching
  collapses them. Use `unstable_cache` with tags `[user_id, endpoint]` so
  invalidations stay user-bounded.
- **Don't cache JWTs.** Mint a fresh one per request. They're 5-min TTL
  anyway — cache provides no real benefit, and a leaked cache reveals
  every active user's permission set.


## When to revisit this pattern

If we end up with 3+ pairs of CRMs that need cross-pulls (e.g. HR↔ERP,
HR↔Termsheet, ERP↔PropertyMgmt, …), the duplication of proxy routes
becomes the cost ARCHITECTURE §16's central-API tier was designed to
amortise. At that point reread §16 and consider promoting one or two of
the most-pulled endpoints to a shared API server.

Below that count, the per-pair proxy pattern is cleaner and avoids
locking in API contract assumptions before we have the use cases.
