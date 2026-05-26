"use client";

import { useEffect, useState } from "react";

/**
 * Polls a server action every `intervalMs` while the tab is visible.
 * Cleans up on unmount.
 *
 * State convention:
 *   undefined → loading (initial)
 *   null      → loaded, no data available (e.g. user hasn't connected Google)
 *   T[]       → data loaded
 *
 * Errors are caught + logged; state stays as the previous successful value
 * to avoid UI flicker on transient network issues.
 */
export function usePollingData<T>(
  fetcher: () => Promise<T | null>,
  intervalMs = 60_000,
): { data: T | null | undefined; error: string | null } {
  const [data, setData] = useState<T | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const next = await fetcher();
        if (cancelled) return;
        setData(next);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[widget poll] fetcher threw:", msg);
        setError(msg);
        // Keep previous data on error — UX-friendlier than blanking.
      }
    }

    load();
    const id = setInterval(load, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // We intentionally don't include `fetcher` in deps — server-action
    // refs are stable across renders, and including would re-trigger
    // the poll setup unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);

  return { data, error };
}
