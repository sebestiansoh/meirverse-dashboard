import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/middleware";

/**
 * Root middleware. Runs on every non-static request and refreshes the
 * Supabase session cookie. Route-level protection lives in
 * `app/(dashboard)/layout.tsx` (server component → `getUser()` →
 * redirect), keeping the middleware itself simple and safe to ship
 * before auth is fully configured.
 */
export async function middleware(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     *   - _next/static (build assets)
     *   - _next/image  (next/image optimisation)
     *   - favicon, robots.txt, sitemap.xml
     *   - any path with a common image extension
     */
    "/((?!_next/static|_next/image|favicon\\.(?:ico|svg)|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
