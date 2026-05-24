/**
 * Meirverse Dashboard · Next.js config
 *
 * Security headers per ARCHITECTURE.md §13. Strict-Transport-Security is
 * already set by Vercel at the edge — not duplicating here. CSP is deferred
 * until Phase 2.2 lands the OAuth callback (when we know the third-party
 * origins we need to allow).
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
        ],
      },
    ];
  },
};

export default nextConfig;
