/**
 * POST /api/sso/mint-service-token
 *
 * Mints a SERVICE-PRINCIPAL JWT for inter-CRM sync calls (per
 * docs/2-way-sync.md). Distinct from /api/sso/issue which mints
 * user-bound bridge tokens.
 *
 * Request:
 *   POST /api/sso/mint-service-token
 *   Authorization: Bearer <SVC_PRINCIPAL_SECRET_<EMITTER>>
 *   { "emitter": "hr", "audience": "underwriting", "scope": "sync:inbound" }
 *
 * Response (200):
 *   { ok: true, token: "<jwt>", expiresAt: "...", audience: "...", emitter: "...", jti: "..." }
 *
 * Errors:
 *   401 missing/invalid bearer
 *   400 bad request / unknown emitter / scope not allowed
 *   500 mint_failed
 *
 * Why a separate endpoint from /api/sso/issue:
 *   • Different auth mechanism (HMAC bearer per principal vs Supabase session)
 *   • Different JWT shape (sub is `svc:<emitter>`, no `email`/`departments`)
 *   • Different observability needs (sync mint rate vs user login rate)
 *
 * Audit: every mint logs to console; later, a `service_token_issuances`
 * table can mirror the existing `sso_issuances` pattern if needed.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  SERVICE_PRINCIPALS,
  constantTimeEqual,
  findServicePrincipal,
} from "@/lib/auth/service-principals";
import { mintServiceToken } from "@/lib/auth/jwt-sign-service";

interface MintRequestBody {
  emitter?: unknown;
  audience?: unknown;
  scope?: unknown;
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: code, message }, { status });
}

export async function POST(request: NextRequest) {
  // 1. Parse body — need `emitter` before we can validate the bearer.
  let body: MintRequestBody;
  try {
    body = (await request.json()) as MintRequestBody;
  } catch {
    return fail(400, "bad_json", "Body must be JSON.");
  }
  if (typeof body.emitter !== "string" || body.emitter.trim().length === 0) {
    return fail(400, "missing_emitter", "Field `emitter` is required.");
  }
  if (typeof body.audience !== "string" || body.audience.trim().length === 0) {
    return fail(400, "missing_audience", "Field `audience` is required.");
  }
  if (typeof body.scope !== "string" || body.scope.trim().length === 0) {
    return fail(400, "missing_scope", "Field `scope` is required.");
  }
  const emitter = body.emitter.trim();
  const audience = body.audience.trim();
  const scope = body.scope.trim();

  // 2. Look up the principal + verify the bearer secret.
  const principal = findServicePrincipal(emitter);
  if (!principal) {
    return fail(400, "unknown_emitter", `'${emitter}' is not a registered service principal.`);
  }

  const expected = process.env[principal.secretEnv];
  if (!expected) {
    // Server-side misconfiguration — log loudly. Don't reveal env-var
    // name to the caller.
    console.error(`[mint-service-token] ${principal.secretEnv} is unset; cannot mint for ${emitter}`);
    return fail(500, "principal_not_provisioned", "Service principal not provisioned.");
  }

  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer (.+)$/i);
  if (!match || !match[1]) {
    return fail(401, "missing_bearer", "Bearer secret required.");
  }
  if (!constantTimeEqual(match[1], expected)) {
    return fail(401, "invalid_bearer", "Bearer secret rejected.");
  }

  // 3. Validate the requested scope is allowed for this principal.
  if (!principal.allowedScopes.includes(scope)) {
    return fail(
      400,
      "scope_not_allowed",
      `Principal '${emitter}' may not request scope '${scope}'. Allowed: ${principal.allowedScopes.join(", ")}.`,
    );
  }

  // 4. Refuse to mint a token whose audience is the same as the emitter
  //    (would let a CRM call itself with a service token — pointless and
  //    confusing in audit logs).
  if (audience === emitter) {
    return fail(400, "self_audience", "Service tokens cannot target their own emitter.");
  }

  // 5. Mint.
  const issuer = process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://dashboard.meirverse.app";
  let minted;
  try {
    minted = await mintServiceToken({ emitter, scopes: [scope] }, audience, issuer);
  } catch (err) {
    console.error("[mint-service-token] mint failed:", err);
    return fail(500, "mint_failed", "Signing key unavailable.");
  }

  console.log(
    `[mint-service-token] minted: emitter=${emitter} aud=${audience} scope=${scope} jti=${minted.jti}`,
  );

  return NextResponse.json({
    ok: true,
    token: minted.token,
    expiresAt: minted.expiresAt.toISOString(),
    audience: minted.audience,
    emitter: minted.emitter,
    jti: minted.jti,
  });
}

// Static introspection — useful for ops + the integration session to see
// what principals are configured without grepping source.
export async function GET() {
  return NextResponse.json({
    principals: SERVICE_PRINCIPALS.map((p) => ({
      emitter: p.emitter,
      allowedScopes: p.allowedScopes,
      provisioned: typeof process.env[p.secretEnv] === "string" && process.env[p.secretEnv]!.length > 0,
    })),
  });
}
