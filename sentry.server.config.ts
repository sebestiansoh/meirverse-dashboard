/**
 * Sentry · Node server initialisation (route handlers, server components,
 * server actions, middleware running in node runtime).
 *
 * Auto-loaded by `withSentryConfig`. Gracefully no-ops when SENTRY_DSN
 * is empty.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Don't leak the raw NEXT_PUBLIC_SUPABASE_ANON_KEY etc. on errors.
    // Sentry already strips most env-style keys; explicit override here.
    beforeSend(event) {
      if (event.request?.cookies) {
        // Cookie names are okay; values shouldn't ship.
        event.request.cookies = Object.fromEntries(
          Object.entries(event.request.cookies).map(([k]) => [k, "[Filtered]"]),
        );
      }
      return event;
    },
  });
}
