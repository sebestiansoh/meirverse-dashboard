/**
 * Department × Role → CRM scope mapping.
 *
 * Per ARCHITECTURE §4: scopes are the per-CRM permission strings the JWT
 * carries. CRMs use them to grant or deny actions internally.
 *
 * Conventions:
 *   - Scope strings are `<short-crm-id>:<level>` (e.g. `hr:admin`, `hr:read`).
 *   - Director → admin scope (sets policy, approves, manages others)
 *   - Manager  → write scope (edits across dept; cannot manage)
 *   - Staff    → write-own scope (edits own work only)
 *   - Viewer   → read scope (read-only)
 *
 * Super Admin always gets `*:admin` for every CRM it has scope on (which
 * is everything) — `super_admin: true` in the JWT is the primary signal,
 * but we also include explicit scopes so naïve CRM code can use just
 * `scopes.includes("…")` without remembering to check the super_admin flag.
 *
 * Department-to-CRM mapping mirrors `requiredDepartments` in audiences.ts.
 * Update both files together when a new department is granted access to a
 * CRM.
 */

import type { DepartmentClaim } from "./jwt-sign";
import type { CrmAudience } from "./audiences";

type RoleLevel = "admin" | "write" | "write-own" | "read";

function levelForRole(role: DepartmentClaim["role"]): RoleLevel {
  switch (role) {
    case "director":
      return "admin";
    case "manager":
      return "write";
    case "staff":
      return "write-own";
    case "viewer":
      return "read";
  }
}

/**
 * Compute the scopes a user should receive for the given audience based on
 * their department roles. Super Admin gets `admin` regardless.
 *
 * If the user has multiple roles in the same department (impossible per the
 * user_departments PK, but defensively), the most permissive wins.
 */
export function scopesForAudience(
  audience: CrmAudience,
  userDepartments: DepartmentClaim[],
  isSuperAdmin: boolean,
): string[] {
  if (isSuperAdmin) {
    return [`${audience.aud}:admin`];
  }

  // Walk the user's relevant departments and find the highest role they
  // hold across them. (Same user holding "director" in one dept and "staff"
  // in another still gets the director-level access on this CRM.)
  const relevantDepts = audience.requiredDepartments.length === 0
    ? userDepartments
    : userDepartments.filter((d) => audience.requiredDepartments.includes(d.department));

  if (relevantDepts.length === 0) return [];

  const rank: Record<RoleLevel, number> = {
    admin: 4,
    write: 3,
    "write-own": 2,
    read: 1,
  };

  const bestLevel = relevantDepts
    .map((d) => levelForRole(d.role))
    .reduce<RoleLevel>(
      (best, current) => (rank[current] > rank[best] ? current : best),
      "read",
    );

  return [`${audience.aud}:${bestLevel}`];
}
