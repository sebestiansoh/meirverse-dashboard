/**
 * Layer 3 of the three-layer Workspace whitelist (per ARCHITECTURE.md
 * §1 lock 5 · v4.4).
 *
 *   Layer 1 · Cloudflare Access — network edge (set up at go-live, wk 7)
 *   Layer 2 · Google OAuth `hd` — Google's IdP gate for the primary
 *             shared Workspace tenant
 *   Layer 3 · server-side domain check — this file. Load-bearing for
 *             independent venture-tenant Workspaces (Cubo, Caerus, MADE)
 *             since `hd` accepts only one value.
 *
 * Domains are compared case-insensitively against the comma-separated
 * `ALLOWED_EMAIL_DOMAINS` env var. Conservative defaults: missing email,
 * malformed email, or empty/missing allowlist all return `false` — we'd
 * rather lock everyone out than silently let everyone in if misconfigured.
 */
export function isEmailDomainAllowed(
  email: string | null | undefined,
): boolean {
  if (!email) return false;

  const allowlist = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) return false;

  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;

  const domain = email.slice(at + 1).toLowerCase();
  return allowlist.includes(domain);
}
