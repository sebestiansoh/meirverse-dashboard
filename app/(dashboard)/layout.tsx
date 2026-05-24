import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailDomainAllowed } from "@/lib/auth/domain-check";

/**
 * Dashboard route-group layout. Server-side gate — every request to a
 * `(dashboard)` route runs through this before the page renders.
 *
 *   1. No session       → redirect to /login
 *   2. Session but
 *      domain not on
 *      ALLOWED_EMAIL_DOMAINS → redirect to /login?error=domain_not_allowed
 *                              (defence in depth: catches stale sessions
 *                               after an allowlist tightening)
 *   3. Otherwise        → render the dashboard chrome + page
 *
 * Cookie domain scoping happens in `lib/supabase/middleware.ts`.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!isEmailDomainAllowed(user.email)) {
    redirect("/login?error=domain_not_allowed");
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-surface px-6 py-4">
        <p className="font-sans text-xs uppercase tracking-[0.2em] text-muted">
          Meirverse Dashboard
        </p>
        <div className="flex items-center gap-4">
          <p className="font-sans text-sm text-muted">{user.email}</p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="font-sans text-xs uppercase tracking-[0.15em] text-muted hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
