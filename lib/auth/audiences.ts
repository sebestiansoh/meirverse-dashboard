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
 *
 * Source of truth: CRM-INVENTORY.md. Update both files together when a
 * new CRM is registered.
 */

import type { DepartmentClaim } from "./jwt-sign";

export interface CrmAudience {
  aud: string;
  subdomain: string;
  displayName: string;
  cluster: "cluster-1" | "cluster-2" | "cluster-3" | "dashboard";
  requiredDepartments: string[];
  /** Set true while the CRM is actively being built — hides the tile. */
  hidden?: boolean;
}

export const CRM_AUDIENCES: readonly CrmAudience[] = [
  // Cluster 1 — group-wide
  {
    aud: "hr",
    subdomain: "hr.meirverse.app",
    displayName: "Human Resources",
    cluster: "cluster-1",
    requiredDepartments: ["hr"],
    hidden: true, // greenfield, not built
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
    subdomain: "gcb-erp.meirverse.app",
    displayName: "Construction ERP",
    cluster: "cluster-3",
    requiredDepartments: ["operations", "accounting"],
    hidden: true, // rebuild scheduled for Phase A weeks 5-7
  },
  {
    aud: "property-mgmt",
    subdomain: "propertymgmt.meirverse.app",
    displayName: "Property Management",
    cluster: "cluster-3",
    requiredDepartments: ["operations"],
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
 * permission-denied entries.
 */
export function visibleAudiencesFor(
  userDepartments: DepartmentClaim[],
  isSuperAdmin: boolean,
): CrmAudience[] {
  return CRM_AUDIENCES.filter((a) => {
    if (a.hidden && !isSuperAdmin) return false;
    return userHasAudienceAccess(a, userDepartments, isSuperAdmin);
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
