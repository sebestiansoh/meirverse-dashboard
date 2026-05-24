/**
 * Mint a CRM-bound JWT.
 *
 * Per ARCHITECTURE §4 (JWT format) and §8.2.5 (the SSO bridge):
 *
 *   {
 *     "sub":         "<user uuid>",
 *     "email":       "alice@meirhomes.com",     // FULL email, multi-domain
 *     "super_admin": false,
 *     "departments": [
 *       { "department": "hr",    "role": "director" },
 *       { "department": "admin", "role": "director" }
 *     ],
 *     "scopes":      ["hr-crm", "admin-systems"],
 *     "aud":         "hr-crm",                   // single, CRM-specific
 *     "iss":         "https://dashboard.meirverse.app",
 *     "exp":         <now + 300>,
 *     "iat":         <now>,
 *     "jti":         "<random>"                  // unique per issuance
 *   }
 *
 * TTL is 5 minutes — long enough for the browser to redirect through the CRM
 * and have the CRM verify + establish its own session; short enough that a
 * stolen JWT is basically useless after coffee.
 */

import { SignJWT } from "jose";
import { loadSigningKey, SIGNING_ALGORITHM } from "./jwt-keys";

/** Polyfill for crypto.randomUUID (available in Node 20+ and modern browsers). */
function randomUUID(): string {
  return crypto.randomUUID();
}

/** Token TTL in seconds. */
export const JWT_TTL_SECONDS = 300;

export interface DepartmentClaim {
  department: string;
  role: "director" | "manager" | "staff" | "viewer";
}

export interface BridgeClaims {
  sub: string;
  email: string;
  super_admin: boolean;
  departments: DepartmentClaim[];
  scopes: string[];
}

export interface MintedToken {
  token: string;
  jti: string;
  expiresAt: Date;
  audience: string;
  issuer: string;
}

/**
 * Mint an audience-bound JWT for the given user. The caller has already
 * verified the user has scope for `audience` — this function does not
 * re-check. Pair with `assertUserHasAudienceAccess` in `lib/auth/scopes.ts`.
 *
 * Throws if the signing key cannot be loaded (misconfigured env). Callers
 * should let the error propagate to a 500 — silently issuing an unsigned
 * token would be worse.
 */
export async function mintBridgeToken(
  claims: BridgeClaims,
  audience: string,
  issuer: string,
): Promise<MintedToken> {
  const { privateKey, kid } = await loadSigningKey();
  const jti = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_TTL_SECONDS;

  const token = await new SignJWT({
    email: claims.email,
    super_admin: claims.super_admin,
    departments: claims.departments,
    scopes: claims.scopes,
  })
    .setProtectedHeader({ alg: SIGNING_ALGORITHM, kid, typ: "JWT" })
    .setSubject(claims.sub)
    .setAudience(audience)
    .setIssuer(issuer)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(jti)
    .sign(privateKey);

  return {
    token,
    jti,
    expiresAt: new Date(exp * 1000),
    audience,
    issuer,
  };
}
