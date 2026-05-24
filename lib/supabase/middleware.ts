import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Refresh the Supabase session token on every request, propagating any
 * rotated cookies back to the browser. Returns the possibly-mutated
 * `NextResponse` — the caller in `middleware.ts` must `return` it so
 * Set-Cookie headers reach the browser.
 *
 * In production the session cookie is scoped to `.meirverse.app` so the
 * same session survives subdomain hops into the CRMs/ERPs (per
 * ARCHITECTURE.md §1 lock — `Session cookie scope`).
 *
 * Defensive guard: if env vars are unset (e.g. during a misconfigured
 * preview deploy), this becomes a no-op rather than 500-ing every
 * request.
 */
export async function updateSupabaseSession(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            // Share session across *.meirverse.app subdomains in
            // production. Skip in dev — leading-dot domains don't apply
            // to `localhost`.
            ...(process.env.NODE_ENV === "production" && {
              domain: ".meirverse.app",
            }),
          });
        });
      },
    },
  });

  // Touch the session so the access token is rotated if near expiry.
  // Errors here are non-fatal — bad sessions are caught downstream by
  // the (dashboard) layout's getUser() check.
  await supabase.auth.getUser();

  return response;
}
