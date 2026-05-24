import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailDomainAllowed } from "@/lib/auth/domain-check";

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

  // Success. Cookies are set by the @supabase/ssr server client; the
  // middleware keeps the session fresh on subsequent requests.
  return NextResponse.redirect(new URL("/", request.url));
}
