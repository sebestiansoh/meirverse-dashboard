"use client";

import { useState } from "react";

interface IssueResponse {
  ok: boolean;
  redirect?: string;
  error?: string;
  message?: string;
}

interface QuickLaunchTileProps {
  audience: string;
  displayName: string;
  cluster: string;
  /** Featured tiles render larger (col-span-2 on sm+) and use a bolder style. */
  featured?: boolean;
}

/**
 * One Quick Launch tile. Clicking POSTs to /api/sso/issue, then redirects
 * the browser to the returned URL.
 *
 * Errors render inline under the tile rather than navigating to /login —
 * gives the user a chance to copy the machine code if they need to report it.
 */
export function QuickLaunchTile({
  audience,
  displayName,
  cluster,
  featured = false,
}: QuickLaunchTileProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function launch() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/sso/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience }),
      });
      const data = (await res.json()) as IssueResponse;
      if (!res.ok || !data.ok || !data.redirect) {
        setError(data.message ?? data.error ?? `HTTP ${res.status}`);
        setPending(false);
        return;
      }
      // Full navigation — the CRM lives on a different origin.
      window.location.href = data.redirect;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setPending(false);
    }
  }

  // Featured tiles span two columns on sm+, render with a darker bg, bigger
  // type, and a more emphatic call-to-action. Regular tiles keep the
  // restrained card aesthetic.
  const containerClass = featured ? "flex flex-col sm:col-span-2" : "flex flex-col";

  const buttonClass = featured
    ? "group relative flex flex-col items-start gap-2 rounded-md border border-accent/40 bg-accent/5 px-5 py-6 text-left transition-colors hover:bg-accent/10 hover:border-accent disabled:opacity-50 disabled:cursor-wait"
    : "group relative flex flex-col items-start gap-1 rounded-md border border-surface bg-paper px-4 py-4 text-left transition-colors hover:border-accent disabled:opacity-50 disabled:cursor-wait";

  const headingClass = featured
    ? "font-serif text-2xl leading-tight text-ink"
    : "font-serif text-lg leading-tight text-ink";

  return (
    <div className={containerClass}>
      <button
        type="button"
        onClick={launch}
        disabled={pending}
        className={buttonClass}
      >
        <span className="font-sans text-xs uppercase tracking-[0.15em] text-muted">
          {featured ? "Primary" : cluster.replace("cluster-", "Cluster ")}
        </span>
        <span className={headingClass}>{displayName}</span>
        <span className="mt-2 font-sans text-xs text-muted/80">
          {pending ? "Issuing token…" : `Launch ${featured ? displayName : ""} →`.replace("  ", " ")}
        </span>
      </button>
      {error && (
        <p role="alert" className="mt-2 font-sans text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
