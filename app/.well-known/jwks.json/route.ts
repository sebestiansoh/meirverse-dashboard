/**
 * GET /.well-known/jwks.json
 *
 * The public face of the SSO bridge. Every federated CRM fetches this
 * (cached 24h by convention) and uses it to verify dashboard-signed JWTs.
 *
 * Standard JWK Set shape per RFC 7517 section 5:
 *   {
 *     "keys": [
 *       { "kty":"RSA", "use":"sig", "alg":"RS256", "kid":"…", "n":"…", "e":"AQAB" },
 *       …
 *     ]
 *   }
 *
 * Cache-Control: public, max-age=300, stale-while-revalidate=86400 lets
 * Cloudflare / Vercel edge cache for 5 min, and CRMs may keep using a
 * stale-but-still-valid key for 24h while they refresh in the background.
 * Tight enough that a rotated key propagates quickly; loose enough that
 * a momentary outage of the dashboard doesn't cause cascading SSO failures.
 *
 * If the keys cannot be loaded (misconfigured env), we return `{keys: []}`
 * with a 200 instead of a 500 — verifiers will simply reject every JWT
 * (better than turning a config bug into a hard outage of the JWKS URL).
 */

import { NextResponse } from "next/server";
import { loadPublishedKeys } from "@/lib/auth/jwt-keys";

// Public endpoint — no auth required. Force dynamic so we always read fresh
// env (especially helpful during local development with hot env reloads).
export const dynamic = "force-dynamic";

export async function GET() {
  const published = await loadPublishedKeys();

  return NextResponse.json(
    { keys: published.map((p) => p.jwk) },
    {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
        "Content-Type": "application/jwk-set+json",
        // CRMs are cross-origin to the dashboard. Allow them to read the JWKS.
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
