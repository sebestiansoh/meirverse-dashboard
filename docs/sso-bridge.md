# SSO bridge (Phase 2.5)

The dashboard at `dashboard.meirverse.app` is the **sole identity issuer**
for the Meirverse CRM ecosystem. Operational CRMs (Construction ERP, HR,
Termsheet, etc.) do not run their own login — instead they accept
short-lived (5-minute) RS256-signed JWTs that the dashboard mints and
verify them against the dashboard's public JWKS.

This doc covers what every party does. Read top-to-bottom if you're
retrofitting a CRM; skim the relevant section if you're debugging.


## The flow

```
┌─────────┐   1. click tile     ┌────────────────────────┐
│ Browser │  ─────────────────► │ dashboard.meirverse.app │
└─────────┘                     │  POST /api/sso/issue    │
     │                          │  { audience: "construction-erp" }
     │                          └────────────────────────┘
     │                                      │
     │                                      ▼
     │                          2. dashboard verifies session,
     │                             permission, mints JWT, logs
     │                             to sso_issuances
     │                                      │
     │   3. { ok, redirect: "https://gcb-erp.meirverse.app/auth/sso?token=…" }
     │  ◄───────────────────────────────────┘
     │
     │   4. window.location.href = redirect
     │
     ▼
┌─────────────────────────┐
│ gcb-erp.meirverse.app   │
│  GET /auth/sso?token=…   │
│                          │
│  5. fetch dashboard JWKS │
│     (cached 24h)         │
│  6. verify alg/iss/aud/  │
│     exp/jti              │
│  7. email-match or       │
│     auto-create local    │
│     user                 │
│  8. create local session │
│  9. redirect to /        │
└─────────────────────────┘
```


## The JWT payload

```json
{
  "iss": "https://dashboard.meirverse.app",
  "aud": "construction-erp",
  "sub": "auth-uuid-here",
  "email": "sebestian@meirverse.app",
  "super_admin": false,
  "departments": [
    { "department": "operations", "role": "director" },
    { "department": "admin",      "role": "manager"  }
  ],
  "scopes": ["construction-erp:admin"],
  "iat": 1700000000,
  "exp": 1700000300,
  "jti": "01HK…"
}
```

Header: `{ "alg": "RS256", "typ": "JWT", "kid": "<short-hex>" }`.

**Rules verifiers must enforce:**

1. `alg === "RS256"` — reject `none`, `HS256`, anything else.
2. Signature verified against the `kid`-matched key from `/.well-known/jwks.json`.
3. `iss === "https://dashboard.meirverse.app"` — exact match.
4. `aud === "<your CRM's audience>"` — exact match. Reject if your audience isn't in the claim.
5. `exp` is in the future (with ≤30s clock skew allowance).
6. `iat` is in the past (with ≤30s clock skew allowance).
7. `jti` is unique within the verifier's recent-tokens cache (replay protection).


## Dashboard side · what's already implemented

In this repo:

- `lib/auth/jwt-keys.ts` — loads RS256 keypair from base64-encoded env PEMs; supports key rotation overlap via `_PREVIOUS` env vars.
- `lib/auth/jwt-sign.ts` — mints the JWT with `jose`.
- `lib/auth/audiences.ts` — registry of every CRM the bridge will issue tokens for (`CRM_AUDIENCES`), plus permission helpers.
- `lib/auth/scopes.ts` — department × role → scope mapping.
- `lib/auth/user-context.ts` — pulls `user_profiles` + `user_departments` from Supabase.
- `app/.well-known/jwks.json/route.ts` — public JWKS endpoint (cached 5 min + 24h SWR).
- `app/api/sso/issue/route.ts` — POST endpoint that mints + audit-logs.
- `app/(dashboard)/page.tsx` + `quick-launch-tile.tsx` — UI: tiles for every audience the user has access to.

Adding a new CRM is **one TypeScript change**: append to `CRM_AUDIENCES`. The tile auto-renders, the issuance endpoint accepts the new `audience` parameter, and the seed file's audience list in `.env.local.example` (`ALLOWED_SSO_AUDIENCES`) should be updated for documentation.


## CRM side · reference implementation

Every CRM under `*.meirverse.app` needs:

1. A `/auth/sso` route handler that takes the JWT and creates a local session.
2. A JWKS client that fetches + caches the dashboard's public keys.
3. A user lookup that matches by **full email** (multi-domain — `alice@meirhomes.com` and `ben@cubo.io` are first-class).
4. A role mapper that translates the `departments` claim into the CRM's internal permissions.

A stand-alone, copy-pasteable TypeScript implementation lives at
[`docs/sso-bridge.verifier.ts`](./sso-bridge.verifier.ts) in this repo.
It uses `jose` (~30 KB) and has zero other dependencies beyond a function
the host app provides for "create or update local user."

For non-TypeScript CRMs (e.g. Rails, Django, Bubble), the same pattern
applies — the spec is RS256 + standard JWKS. Any reasonable JWT library
that supports JWKS URLs will work. Document the implementation in the
CRM's own README so the next person retrofitting another CRM can crib.


## Key rotation (every 90 days)

1. Generate a new keypair:

   ```bash
   openssl genrsa -out jwt-private-new.pem 2048
   openssl rsa -in jwt-private-new.pem -pubout -out jwt-public-new.pem
   NEW_KID=$(openssl rand -hex 8)
   echo "kid: $NEW_KID"
   ```

2. Move the CURRENT keys to the `_PREVIOUS` env slots and set the NEW keys
   as current. The JWKS endpoint will now publish BOTH public keys. CRMs
   that cached the old key 23h ago will still verify successfully.

3. Wait 24 hours — long enough for every CRM's cached JWKS to refresh past
   the rotation.

4. Delete the `_PREVIOUS` env vars. The JWKS endpoint now publishes only
   the new key. Any JWT signed by the old key (TTL was 5 min) is long
   expired anyway.

Calendar reminder: every 90 days. Set this up the first time you rotate.


## Operational concerns

- **Audit trail.** Every successful mint writes a row to `sso_issuances` (user_id, target_crm, jti, user_agent, ip). RLS denies all client INSERT — only the route handler with the service-role client can write. Super Admin can read the whole table; regular users see only their own.
- **Revocation.** Sessions can be revoked instantly via Supabase Auth ("Sign out all sessions" on a user). JWTs already minted live up to 5 min — accept this short window or escalate.
- **Rate limiting.** Not yet enforced. A compromised session can mint one token per CRM per ~second. At scale this would matter; at 2-3 staff it doesn't. Revisit at Milestone 2.
- **CRM trust.** A CRM that misuses the JWT (e.g. uses it to call other APIs) is a downstream concern. CRMs are first-party, but if a CRM gets owned, the JWT carries a `sub` + `email` that the attacker can use to impersonate the user inside that CRM only — they cannot mint new JWTs without dashboard access.


## Debugging

Useful one-liners:

```bash
# Inspect a JWT (does not verify) — use jose's CLI or jwt.io
echo "<paste token>" | base64 -D     # just the header (first segment)

# Fetch the current JWKS
curl https://dashboard.meirverse.app/.well-known/jwks.json | jq

# Mint a token end-to-end (requires you to be signed in as a Super Admin
# in the same browser session, so easier to do from devtools):
fetch("/api/sso/issue", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ audience: "construction-erp" }),
}).then(r => r.json()).then(console.log)

# View recent issuances (Super Admin only):
select * from public.sso_issuances order by issued_at desc limit 20;
```
