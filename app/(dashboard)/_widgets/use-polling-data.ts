"use client";

import { useEffect, useState } from "react";

/**
 * Polls a server action every `intervalMs` while the tab is visible.
 * Cleans up on unmount. Resets to `undefined` (loading) when `deps`
 * change so a tab-switch surfaces the skeleton state.
 *
 * State convention:
 *   undefined → loading (initial or post-deps-change)
 *   null      → loaded, no data available (e.g. user hasn't connected Google)
 *   T[]       → data loaded
 *
 * Errors are caught + logged; state stays as the previous successful value
 * to avoid UI flicker on transient network issues.
 */
export function usePollingData<T>(
  fetcher: () => Promise<T | null>,
  intervalMs = 60_000,
  deps: ReadonlyArray<unknown> = [],
): { data: T | null | undefined; error: string | null } {
  const [data, setData] = useState<T | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Reset to loading state when deps (e.g. selected tab) change.
    setData(undefined);
    setError(null);

    async function load() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      )
        return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);

  return { data, error };
}
