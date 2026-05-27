import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailDomainAllowed } from "@/lib/auth/domain-check";
import { storeGoogleTokens } from "@/lib/google/store-tokens";
import { GOOGLE_OAUTH_SCOPES } from "@/lib/google/scopes";
import { storeMicrosoftTokens } from "@/lib/microsoft/store-tokens";
import { MICROSOFT_OAUTH_SCOPES } from "@/lib/microsoft/scopes";

/**
 * OAuth callback. Supabase redirects the browser here with `?code=…`
 * after the Google round-trip. We exchange the code for a session, then
 * enforce **Layer 3** of the Workspace whitelist (ARCHITECTURE.md §1
 * lock 5 · v4.4) before granting access.
 *
 * Layers 1 (Cloudflare Access) and 2 (Google `hd`) gate above this;
 * Layer 3 is load-bearing for independent venture-tenant Workspaces.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");

  if (providerError) {
    const tag =
      providerError === "access_denied" ? "oauth_cancelled" : "oauth_failed";
    return NextResponse.redirect(new URL(`/login?error=${tag}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", request.url),
    );
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(
      new URL("/login?error=session_failed", request.url),
    );
  }

  // Layer 3 — server-side domain check. Conservative: rejects when the
  // ALLOWED_EMAIL_DOMAINS env var is empty or missing.
  if (!isEmailDomainAllowed(data.session.user.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/login?error=domain_not_allowed", request.url),
    );
  }

  // Capture the OAuth refresh token if the provider issued one. Only
  // fires on consent-granting sign-ins (access_type=offline +
  // prompt=consent for Google, offline_access scope + prompt=consent
  // for Microsoft). Subsequent sign-ins reuse the stored refresh token
  // unless the user revoked.
  //
  // Per-provider routing: data.session.user.app_metadata.provider tells
  // us which OAuth provider just signed the user in, so we know which
  // token table to write to. session.provider_refresh_token is the
  // refresh token from whichever provider just completed — there's only
  // ever one active provider context per session.
  //
  // Failure is non-blocking — the user is signed in either way; widgets
  // just show "Connect …" if no token is on file.
  const providerRefresh = data.session.provider_refresh_token;
  const provider = data.session.user.app_metadata?.provider;

  if (providerRefresh) {
    try {
      if (provider === "azure") {
        // Microsoft tenant id lives in the id_token `tid` claim; we don't
        // re-parse the id_token here, so this stays null on first capture.
        // refresh-access-token.ts falls back to the `common` endpoint when
        // tenant_id is null — works for both single-tenant and multi-tenant
        // app registrations.
        await storeMicrosoftTokens({
          userId: data.session.user.id,
          refreshToken: providerRefresh,
          accessToken: data.session.provider_token,
          accessTokenExpiresIn: data.session.expires_in ?? 3600,
          scopes: MICROSOFT_OAUTH_SCOPES,
        });
      } else {
        // Default branch — Google (or any future provider we add to the
        // dashboard's Google-scoped token table).
        await storeGoogleTokens({
          userId: data.session.user.id,
          refreshToken: providerRefresh,
          accessToken: data.session.provider_token,
          accessTokenExpiresIn: data.session.expires_in ?? 3600,
          scopes: GOOGLE_OAUTH_SCOPES,
        });
      }
    } catch (err) {
      console.error(
        `[auth/callback] ${provider ?? "oauth"} token capture failed:`,
        err,
      );
    }
  }

  // Success. Cookies are set by the @supabase/ssr server client; the
  // middleware keeps the session fresh on subsequent requests.
  return NextResponse.redirect(new URL("/", request.url));
}
