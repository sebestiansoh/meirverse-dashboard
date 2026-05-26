/**
 * Sentry · Edge runtime initialisation (middleware.ts + any route handlers
 * declared `export const runtime = "edge"`).
 *
 * Auto-loaded by `withSentryConfig`. No-ops when DSN is empty.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}
