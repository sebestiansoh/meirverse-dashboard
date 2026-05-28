/**
 * Next.js instrumentation hook.
 *
 * Sentry SDK v8+ / Next 14 guidance: server + edge `Sentry.init` must run
 * inside `register()` rather than via the legacy top-level
 * `sentry.server.config.ts` / `sentry.edge.config.ts` auto-load. Those
 * files are retained and imported here (per-runtime) so their init logic
 * — DSN gating, beforeSend cookie filtering — stays in one place.
 *
 * `withSentryConfig` (next.config.mjs) auto-enables the instrumentation
 * hook for Next < 15, so this file is picked up automatically.
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in React Server Components, route handlers, and
// server actions, forwarding them to Sentry. Available in @sentry/nextjs v10.
export const onRequestError = Sentry.captureRequestError;
