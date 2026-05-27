import { withSentryConfig } from "@sentry/nextjs";

/**
 * Meirverse Dashboard · Next.js config.
 *
 * Security headers per ARCHITECTURE.md §13 + Platform Mandate §Observability.
 * Strict-Transport-Security is already set by Vercel at the edge — not
 * duplicated here.
 *
 * CSP balances strict by default with the practical reality that Next.js
 * App Router still injects inline scripts (hydration markers, RSC payload
 * cues). `'unsafe-inline'` + `'unsafe-eval'` on script-src are the
 * pragmatic concession; nonce-based CSP is a later hardening pass once
 * the surface area stabilises.
 *
 * Wrapped with `withSentryConfig` so the Sentry SDK ships in client +
 * server bundles. SDK gracefully no-ops when `NEXT_PUBLIC_SENTRY_DSN` is
 * unset.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Inline scripts/styles are unavoidable in Next.js App Router today.
              // 'unsafe-eval' is required by some webpack runtime paths.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              // Supabase (HTTPS + WebSocket for realtime), Google OAuth,
              // Microsoft OAuth + Graph, Sentry ingest endpoints.
              // Server-side API fetches (Node) bypass CSP entirely; the
              // entries below cover OAuth redirects and any client-side
              // proxy paths we might add later.
              "connect-src 'self' " +
                "https://xwrthxehkrwmikhzqhma.supabase.co " +
                "wss://xwrthxehkrwmikhzqhma.supabase.co " +
                "https://accounts.google.com " +
                "https://oauth2.googleapis.com " +
                "https://*.googleapis.com " +
                "https://login.microsoftonline.com " +
                "https://graph.microsoft.com " +
                "https://*.ingest.sentry.io " +
                "https://*.ingest.us.sentry.io",
              // Modern equivalent of X-Frame-Options: DENY (kept for legacy).
              "frame-ancestors 'none'",
              // Forms can only post to self + Google/Microsoft OAuth + Supabase callback.
              "form-action 'self' " +
                "https://accounts.google.com " +
                "https://login.microsoftonline.com " +
                "https://xwrthxehkrwmikhzqhma.supabase.co",
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Silence the Sentry webpack plugin's build-time logging.
  silent: true,
  // Source map upload requires SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT.
  // If unset, the plugin skips the upload silently and the build still succeeds.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
