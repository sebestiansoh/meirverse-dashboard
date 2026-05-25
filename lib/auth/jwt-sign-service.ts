/**
 * Mint a SERVICE-PRINCIPAL JWT for inter-CRM sync calls.
 *
 * Distinct from `jwt-sign.ts`'s `mintBridgeToken` (which mints
 * user-bound bridge tokens for SSO landings). Service tokens have:
 *   • `sub = "svc:<emitter>"`  — not a user UUID
 *   • `scopes`                 — granular per intended action
 *                                 (e.g. ["sync:inbound"])
 *   • `aud`                    — the TARGET CRM (so a token minted
 *                                 for ERP can't be used to call HR)
 *
 * Same RS256 keypair, same JWKS endpoint — receivers reuse the same
 * verifier machinery, just with a check that `sub.startsWith("svc:")`.
 *
 * Spec: ~/Projects/meir-dashboard/docs/2-way-sync.md § Authentication.
 */

import { SignJWT } from "jose";
import { loadSigningKey, SIGNING_ALGORITHM } from "./jwt-keys";

/** Service-token TTL in seconds. Same as bridge tokens — small blast radius. */
export const SERVICE_TOKEN_TTL_SECONDS = 300;

export interface ServiceTokenClaims {
  emitter: string;                       // e.g. 'hr' — goes into sub as 'svc:hr'
  scopes: string[];                      // e.g. ['sync:inbound']
}

export interface MintedServiceToken {
  token: string;
  jti: string;
  expiresAt: Date;
  audience: string;
  emitter: string;
  issuer: string;
}

export async function mintServiceToken(
  claims: ServiceTokenClaims,
  audience: string,
  issuer: string,
): Promise<MintedServiceToken> {
  const { privateKey, kid } = await loadSigningKey();
  const jti = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SERVICE_TOKEN_TTL_SECONDS;

  const token = await new SignJWT({
    scopes: claims.scopes,
  })
    .setProtectedHeader({ alg: SIGNING_ALGORITHM, kid, typ: "JWT" })
    .setSubject(`svc:${claims.emitter}`)
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
    emitter: claims.emitter,
    issuer,
  };
}
