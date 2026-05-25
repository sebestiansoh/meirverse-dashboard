import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Server-context Supabase client. Reads + writes Next.js cookies via
 * `next/headers`. Use in:
 *   • Server Components (read-only — RSCs cannot mutate cookies)
 *   • Server Actions     (can mutate cookies)
 *   • Route Handlers     (can mutate cookies)
 *
 * Honours RLS — the user's anon-key session is what the policies see.
 *
 * Middleware (`lib/supabase/middleware.ts`) refreshes the session token
 * on every request so this client always sees a fresh user.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // RSCs can't set cookies; middleware refreshes instead.
        }
      },
    },
  });
}

/**
 * Service-role Supabase client. **Bypasses RLS entirely** — use ONLY for
 * admin operations that legitimate users should not be able to perform
 * themselves. Example: writing audit rows to `sso_issuances`, where the
 * v4.5 RLS policy denies client INSERT by design (audit integrity).
 *
 * Reads `SUPABASE_SERVICE_ROLE_KEY` at call time, not at module load —
 * lets the rest of the app boot in environments where the service key
 * isn't configured (e.g. local dev without secret-key access). Throws on
 * call so the caller can catch + degrade gracefully (e.g. audit-best-
 * effort) rather than 500 the user-facing route.
 *
 * Never expose anything created by this function to the browser.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "[supabase/server] SUPABASE_SERVICE_ROLE_KEY is unset — service-role operations cannot run.",
    );
  }
  return createSupabaseAdminClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
