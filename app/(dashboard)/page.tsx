import { redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/user-context";
import { visibleAudiencesFor } from "@/lib/auth/audiences";
import { QuickLaunchTile } from "./quick-launch-tile";

/**
 * Dashboard home. The route-group layout already enforced auth; we use
 * `getCurrentUserContext` here to compute which Quick Launch tiles to
 * render based on the user's department × role assignments.
 *
 * Phase 2.5 ships only the Quick Launch grid. Universal modules
 * (calendar, tasks, inbox, markets, …) arrive in subsequent phases per
 * ARCHITECTURE §7.
 */
export default async function Home() {
  const ctx = await getCurrentUserContext();
  if (!ctx) {
    // Defensive — the layout already redirected, but a race during
    // session refresh could land us here without context.
    redirect("/login");
  }

  const audiences = visibleAudiencesFor(ctx.departments, ctx.isSuperAdmin);

  return (
    <main className="mx-auto max-w-5xl px-8 py-12 space-y-10">
      <header className="space-y-2">
        <p className="font-sans text-xs uppercase tracking-[0.2em] text-muted">
          {ctx.isSuperAdmin
            ? "Universal Super Admin"
            : ctx.departments.length === 0
              ? "No departments assigned"
              : `${ctx.departments.length} department${ctx.departments.length === 1 ? "" : "s"}`}
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl leading-tight">
          {ctx.displayName
            ? `Welcome, ${ctx.displayName}.`
            : "Welcome to the Meirverse Dashboard."}
        </h1>
        <p className="font-sans text-sm text-muted">
          Phase 2.5 · SSO bridge live. Universal modules — calendar, tasks,
          inbox, markets, directory — arrive across Phase 2.6+ per the build
          sequence in <code className="font-sans text-xs">ARCHITECTURE.md §7</code>.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="font-serif text-xl">Quick Launch</h2>
        {audiences.length === 0 ? (
          <p className="font-sans text-sm text-muted">
            You don&apos;t yet have access to any operational CRMs. Contact the
            relevant Department Director (or Sebestian) to grant your
            department × role assignments.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {audiences.map((a) => (
              <QuickLaunchTile
                key={a.aud}
                audience={a.aud}
                displayName={a.displayName}
                cluster={a.cluster}
              />
            ))}
          </div>
        )}
        <p className="font-sans text-xs text-muted/70">
          Quick Launch issues a short-lived (5-min) signed JWT, redirects you
          to the CRM, and the CRM verifies the token against the dashboard&apos;s
          public JWKS. Audit trail is recorded in
          <code className="font-sans text-xs"> sso_issuances</code> per
          ARCHITECTURE §13.
        </p>
      </section>

      <footer className="pt-8 border-t border-surface">
        <p className="font-sans text-xs text-muted/60">
          dashboard.meirverse.app
        </p>
      </footer>
    </main>
  );
}
