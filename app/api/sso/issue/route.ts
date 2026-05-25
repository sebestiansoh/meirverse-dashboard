/**
 * POST /api/sso/issue
 *
 * The mint endpoint. The dashboard's Quick Launch tiles POST here with the
 * audience they want a token for. On success returns:
 *
 *   {
 *     "ok": true,
 *     "redirect": "https://gcb-erp.meirverse.app/auth/sso?token=…",
 *     "expiresAt": "2026-…",
 *     "audience": "construction-erp",
 *     "jti": "…"
 *   }
 *
 * The browser then redirects itself to `redirect`. Returning the URL rather
 * than 302ing here keeps this endpoint a pure JSON API — easier to test,
 * easier to call from a client component, easier to wrap in a fetch.
 *
 * Errors return `{ ok: false, error: "<machine code>", message: "<human>" }`
 * with appropriate 4xx/5xx codes:
 *
 *   401 unauthenticated     — no Supabase session
 *   403 domain_not_allowed  — email passed initial sign-in but tightened
 *                             allowlist now rejects (defence in depth)
 *   400 unknown_audience    — aud not registered in CRM_AUDIENCES
 *   403 no_audience_access  — user has no department granting this CRM
 *   500 mint_failed         — signing key load failed or JWT mint failed
 *   500 audit_failed        — JWT minted but audit log write failed
 */

import { NextResponse, type NextRequest } from "next/server";
import { findAudience, ssoLandingUrl, userHasAudienceAccess } from "@/lib/auth/audiences";
import { isEmailDomainAllowed } from "@/lib/auth/domain-check";
import { mintBridgeToken } from "@/lib/auth/jwt-sign";
import { scopesForAudience } from "@/lib/auth/scopes";
import { getCurrentUserContext } from "@/lib/auth/user-context";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

interface IssueRequestBody {
  audience?: unknown;
}

function fail(status: number, error: string, message: string) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

export async function POST(request: NextRequest) {
  // 1. Authenticate.
  const ctx = await getCurrentUserContext();
  if (!ctx) {
    return fail(401, "unauthenticated", "Sign in to issue a bridge token.");
  }

  // 2. Defence in depth — re-check the Layer 3 domain allowlist. A user
  //    whose Workspace was removed from the allowlist after sign-in should
  //    not be able to mint new CRM tokens with their existing session.
  if (!isEmailDomainAllowed(ctx.email)) {
    return fail(
      403,
      "domain_not_allowed",
      "Your email domain is no longer on the Meirverse allowlist.",
    );
  }

  // 3. Parse + validate the requested audience.
  let body: IssueRequestBody;
  try {
    body = (await request.json()) as IssueRequestBody;
  } catch {
    return fail(400, "bad_request", "Request body must be JSON.");
  }
  if (typeof body.audience !== "string" || body.audience.trim().length === 0) {
    return fail(400, "bad_request", "Field `audience` is required.");
  }
  const audience = findAudience(body.audience);
  if (!audience) {
    return fail(
      400,
      "unknown_audience",
      `'${body.audience}' is not a registered CRM. See lib/auth/audiences.ts.`,
    );
  }

  // 4. Permission gate.
  if (!userHasAudienceAccess(audience, ctx.departments, ctx.isSuperAdmin)) {
    return fail(
      403,
      "no_audience_access",
      `Your department assignments do not grant access to ${audience.displayName}.`,
    );
  }

  // 5. Compute scopes + mint.
  const scopes = scopesForAudience(audience, ctx.departments, ctx.isSuperAdmin);
  const issuer = process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://dashboard.meirverse.app";

  let minted;
  try {
    minted = await mintBridgeToken(
      {
        sub: ctx.userId,
        email: ctx.email,
        super_admin: ctx.isSuperAdmin,
        departments: ctx.departments,
        scopes,
      },
      audience.aud,
      issuer,
    );
  } catch (err) {
    console.error("[api/sso/issue] mint failed:", err);
    return fail(
      500,
      "mint_failed",
      "The SSO signing key is unavailable. Contact the admin.",
    );
  }

  // 6. Audit log. Use the service-role client because the sso_issuances
  //    RLS policy denies client INSERT — the audit row must be written
  //    even if the requester is mid-rotation away from access.
  //    If SUPABASE_SERVICE_ROLE_KEY is unset, this throws + the catch
  //    below logs to console; the JWT mint itself still succeeds so the
  //    user is not blocked by a missing audit-side env var.
  try {
    const supabase = createSupabaseServiceClient();
    const userAgent = request.headers.get("user-agent");
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ip = forwardedFor?.split(",")[0]?.trim() ?? null;
    const { error: auditErr } = await supabase.from("sso_issuances").insert({
      user_id: ctx.userId,
      target_crm: audience.aud,
      jwt_jti: minted.jti,
      user_agent: userAgent,
      ip,
    });
    if (auditErr) {
      // The token is already minted and the user will redirect successfully.
      // Log loudly but don't 500 — losing one audit row is worse than
      // breaking the user's flow.
      console.error("[api/sso/issue] audit log write failed:", auditErr);
    }
  } catch (err) {
    console.error("[api/sso/issue] audit log threw:", err);
  }

  return NextResponse.json({
    ok: true,
    redirect: ssoLandingUrl(audience, minted.token),
    expiresAt: minted.expiresAt.toISOString(),
    audience: audience.aud,
    jti: minted.jti,
  });
}
