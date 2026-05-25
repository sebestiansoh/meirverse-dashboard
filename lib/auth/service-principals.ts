/**
 * Service-principal registry — every CRM that can request a service-token
 * JWT from the dashboard.
 *
 * Each entry binds:
 *   • emitter       — the audience-style identifier (matches CRM_AUDIENCES.aud)
 *   • secretEnv     — env var name holding the HMAC bearer secret. The
 *                     dashboard's /api/sso/mint-service-token compares the
 *                     request's Authorization header against this.
 *   • allowedScopes — scopes this principal may request. Defaults to
 *                     ["sync:inbound"]. Extend if a CRM ever needs
 *                     additional service capabilities.
 *
 * Spec: ~/Projects/meir-dashboard/docs/2-way-sync.md § Authentication.
 */

import { timingSafeEqual } from "node:crypto";

export interface ServicePrincipal {
  emitter: string;
  secretEnv: string;
  allowedScopes: readonly string[];
}

export const SERVICE_PRINCIPALS: readonly ServicePrincipal[] = [
  {
    emitter: "hr",
    secretEnv: "SVC_PRINCIPAL_SECRET_HR",
    allowedScopes: ["sync:inbound"],
  },
  {
    emitter: "construction-erp",
    secretEnv: "SVC_PRINCIPAL_SECRET_CONSTRUCTION_ERP",
    allowedScopes: ["sync:inbound"],
  },
  {
    emitter: "underwriting",
    secretEnv: "SVC_PRINCIPAL_SECRET_UNDERWRITING",
    allowedScopes: ["sync:inbound"],
  },
];

export function findServicePrincipal(emitter: string): ServicePrincipal | null {
  return SERVICE_PRINCIPALS.find((p) => p.emitter === emitter) ?? null;
}

/**
 * Constant-time string comparison. `timingSafeEqual` requires equal-length
 * buffers and throws otherwise — wrap with a length check so different-
 * length inputs return false without leaking timing on the branch.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Run a dummy compare to even out timing for the length-mismatch path.
    try {
      timingSafeEqual(aBuf, Buffer.alloc(aBuf.length));
    } catch {
      // ignore — defensive
    }
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
