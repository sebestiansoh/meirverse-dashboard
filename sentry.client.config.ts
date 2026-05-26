/**
 * Sentry · browser-side initialisation.
 *
 * Auto-loaded by `withSentryConfig` in next.config.mjs. Picked up on every
 * client render. Gracefully no-ops when NEXT_PUBLIC_SENTRY_DSN is empty
 * (local dev, preview deploys before the DSN is wired).
 *
 * Per Platform Mandate §Observability & CI — error tracking is required
 * on every Child. This is the dashboard's hook.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    // Performance — 10% sampling is plenty for an internal tool.
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Replay — sample 1% of normal sessions, 100% of error sessions.
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    // Suppress noisy Next.js framework "abort" errors.
    ignoreErrors: [
      "AbortError",
      "NEXT_REDIRECT",
      "NEXT_NOT_FOUND",
    ],
  });
}
