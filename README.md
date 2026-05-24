# Meirverse Dashboard

Orchestration layer for the Meirverse group of companies, deployed at
`dashboard.meirverse.app`. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the
locked v4.2 architecture and [CRM-INVENTORY.md](./CRM-INVENTORY.md) for the
SSO target inventory.

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind 3 · Supabase
(Singapore) · Vercel · Cloudflare Access · Signed-JWT (RS256) bridge to CRMs.

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in Supabase credentials
npm run dev                         # http://localhost:3000
```

## Current phase

**Phase 2.1 · Foundation** — Local scaffold complete. Awaiting Supabase
project creation, Vercel deploy, and DNS for `dashboard.meirverse.app`.
Auth (Phase 2.2) lands in Week 2.

## Deferred cleanup

One item carried into Phase 2.2:

- **Dashboard route group.** `app/page.tsx` currently serves the
  placeholder home directly. Phase 2.2 will move it into
  `app/(dashboard)/page.tsx` once `middleware.ts` enforces auth on that
  group. The `(public)/login` group is already in place.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — locked architecture decisions (v4.2)
- [CRM-INVENTORY.md](./CRM-INVENTORY.md) — SSO targets, recon checklists,
  migration patterns
