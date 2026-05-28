/**
 * CRM audience catalog — the registry of every system the SSO bridge can
 * issue tokens for.
 *
 * Each entry maps:
 *   - `aud`         — the value that goes into the JWT's `aud` claim (and
 *                     that the CRM verifies)
 *   - `subdomain`   — where the user is redirected to land on the CRM
 *   - `displayName` — what the dashboard's Quick Launch tile shows
 *   - `cluster`     — for grouping in the UI (per CRM-INVENTORY.md)
 *   - `requiredDepartments` — which departments grant ANY access to this
 *                             CRM. Super Admin always passes regardless.
 *                             Empty array = open to every signed-in user.
 *   - `hidden`      — set true while the CRM is actively being built.
 *                     Hidden tiles don't appear in Quick Launch for
 *                     regular users. Super Admin sees all hidden tiles
 *                     too (operational visibility).
 *   - `featured`    — set true for the small set of CRMs that staff
 *                     access most often (currently HR). Featured tiles
 *                     render larger and sort first in the Quick Launch
 *                     grid. Decision logged 2026-05-25: dashboard stays
 *                     the daily homepage; HR is the primary tile.
 *
 * Source of truth: CRM-INVENTORY.md. Update both files together when a
 * new CRM is registered.
 */

import type { DepartmentClaim } from "./jwt-sign";

export interface CrmAudience {
  aud: string;
  subdomain: string;
  displayName: string;
  cluster: "cluster-1" | "cluster-2" | "cluster-3" | "cluster-4" | "dashboard";
  requiredDepartments: string[];
  /** Hide the tile while the CRM is being built. Super Admin still sees it. */
  hidden?: boolean;
  /** Promote to the larger / sort-first slot in Quick Launch. */
  featured?: boolean;
}

export const CRM_AUDIENCES: readonly CrmAudience[] = [
  // Cluster 1 — group-wide
  {
    aud: "hr",
    subdomain: "hr.meirverse.app",
    displayName: "Human Resources",
    cluster: "cluster-1",
    requiredDepartments: ["hr"],
    // Scaffolded 2026-05-25 (sebestiansoh/meirverse-hr). Phase 0 SSO landing
    // verifies; module work pending. Visible to Super Admin in dev.
    hidden: true,
    // Primary tile — staff access this most often (their own leave, docs,
    // employee profile). Renders larger + sorts first in Quick Launch.
    featured: true,
  },

  // Cluster 2 — deal pipeline
  {
    aud: "termsheet",
    subdomain: "termsheet.meirverse.app",
    displayName: "Termsheet",
    cluster: "cluster-2",
    requiredDepartments: ["sales"],
    hidden: true, // existing build, pre-retrofit
  },
  {
    aud: "engagement",
    subdomain: "engagement.meirverse.app",
    displayName: "Engagement Letter",
    cluster: "cluster-2",
    requiredDepartments: ["sales", "legal"],
    hidden: true,
  },
  {
    aud: "prospect-db",
    subdomain: "prospect.meirverse.app",
    displayName: "Prospect DB",
    cluster: "cluster-2",
    requiredDepartments: ["sales"],
    hidden: true,
  },
  {
    aud: "spec-sheet",
    subdomain: "specsheet.meirverse.app",
    displayName: "Spec Sheet",
    cluster: "cluster-2",
    requiredDepartments: ["sales", "operations"],
    hidden: true,
  },

  // Cluster 3 — asset lifecycle
  {
    aud: "construction-erp",
    // Subdomain renamed gcb-erp./erp. → projects.meirverse.app per Principal
    // decision 2026-05-28 (supersedes D-B's erp. target). aud claim unchanged
    // (deliberately decoupled from the URL, so the ERP verifier needs no change).
    subdomain: "projects.meirverse.app",
    displayName: "Construction ERP",
    cluster: "cluster-3",
    requiredDepartments: ["operations", "accounting"],
    // Scaffolded 2026-05-25 (sebestiansoh/meirverse-gcb-erp). Phase 0 SSO
    // landing verifies; module work begins Phase 1 (Items module first).
    // Per D-E + D-F: Property Management + Property Maintenance live as
    // MODULES inside this ERP — no separate `propertymgmt.` subdomain.
    hidden: true,
  },
  // Property Management tile removed 2026-05-26 per CLAUDE-ALIGNMENT.md
  // decision D-F: it's not a separate Child — it's a Meir-Collective-scoped
  // module inside the ERP (Internal), cross-linked to the Leads Child on
  // the External Dashboard (`leads.meirverse.world`, Phase 2).

  // Cluster 4 — financial / underwriting
  {
    aud: "underwriting",
    subdomain: "underwriting.meirverse.app",
    displayName: "Underwriting",
    cluster: "cluster-4",
    requiredDepartments: ["accounting", "legal"],
    // Phase 0 being scaffolded in a concurrent session 2026-05-25. Hidden
    // for regular users until that lands; Super Admin sees it.
    // 2-way sync with HR per docs/2-way-sync.md.
    hidden: true,
  },
] as const;

/**
 * Look up an audience by its `aud` value. Returns null if not registered —
 * /api/sso/issue uses this to reject requests for unknown audiences before
 * even checking the user's permissions.
 */
export function findAudience(aud: string): CrmAudience | null {
  return CRM_AUDIENCES.find((a) => a.aud === aud) ?? null;
}

/**
 * Does the user have ANY scope on the CRM identified by `audience`?
 * Returns true if Super Admin, or if any of the user's departments matches
 * the CRM's requiredDepartments (or the CRM is open to all).
 */
export function userHasAudienceAccess(
  audience: CrmAudience,
  userDepartments: DepartmentClaim[],
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  if (audience.requiredDepartments.length === 0) return true;
  const userDeptIds = new Set(userDepartments.map((d) => d.department));
  return audience.requiredDepartments.some((d) => userDeptIds.has(d));
}

/**
 * Tiles the user should see in the Quick Launch grid. Excludes hidden and
 * permission-denied entries. Sorts featured tiles to the top (the small set
 * of CRMs staff access most often), then by cluster for groupable rendering.
 */
export function visibleAudiencesFor(
  userDepartments: DepartmentClaim[],
  isSuperAdmin: boolean,
): CrmAudience[] {
  const visible = CRM_AUDIENCES.filter((a) => {
    if (a.hidden && !isSuperAdmin) return false;
    return userHasAudienceAccess(a, userDepartments, isSuperAdmin);
  });

  return [...visible].sort((a, b) => {
    // Featured first.
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    // Then cluster order — 1 → 2 → 3 → dashboard.
    return a.cluster.localeCompare(b.cluster);
  });
}

/**
 * The URL a CRM should redirect the user to after verifying their JWT.
 * Conservative scheme — always HTTPS in production; localhost-aware in dev
 * is the CRM's own responsibility.
 */
export function ssoLandingUrl(audience: CrmAudience, token: string): string {
  const base = `https://${audience.subdomain}/auth/sso`;
  // URL constructor handles the encoding for us.
  const url = new URL(base);
  url.searchParams.set("token", token);
  return url.toString();
}
