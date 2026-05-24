import { createServerClient } from "@supabase/ssr";
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
