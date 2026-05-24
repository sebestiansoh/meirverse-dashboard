/* eslint-disable */
// ============================================================================
// docs/sso-bridge.verifier.ts
// ============================================================================
// REFERENCE IMPLEMENTATION — copy this file into any Meirverse CRM that
// federates auth via the dashboard's SSO bridge. NOT executed inside the
// dashboard repo itself; lives here as the canonical source.
//
// Tested against: jose ^5.x, Node 22, both Next.js and standalone.
// Dependency: `npm install jose` (~30 KB).
//
// Usage in a Next.js CRM:
//
//   // app/auth/sso/route.ts
//   import { NextResponse, type NextRequest } from "next/server";
//   import { verifyBridgeToken, type VerifiedClaims } from "@/lib/sso/verifier";
//   import { findOrCreateUserByEmail, createLocalSession } from "@/lib/users";
//
//   const AUDIENCE = "construction-erp"; // <— change per CRM
//
//   export async function GET(req: NextRequest) {
//     const token = new URL(req.url).searchParams.get("token");
//     if (!token) {
//       return NextResponse.redirect(new URL("/login?error=missing_token", req.url));
//     }
//     let claims: VerifiedClaims;
//     try {
//       claims = await verifyBridgeToken(token, AUDIENCE);
//     } catch (err) {
//       console.error("[sso] verify failed:", err);
//       return NextResponse.redirect(new URL("/login?error=sso_failed", req.url));
//     }
//     const user = await findOrCreateUserByEmail(claims.email, {
//       super_admin: claims.super_admin,
//       departments: claims.departments,
//     });
//     await createLocalSession(req, user);
//     return NextResponse.redirect(new URL("/", req.url));
//   }
//
// ============================================================================

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// ─── Configuration ──────────────────────────────────────────────────────────
//
// The dashboard issuer URL. Used for both the `iss` claim check AND to build
// the JWKS URL (`<ISSUER>/.well-known/jwks.json`).
const ISSUER = "https://dashboard.meirverse.app";

// Cache the JWKS for 24h and refresh in background. createRemoteJWKSet
// handles this for us — one instance, reused across requests.
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`), {
  cacheMaxAge: 24 * 60 * 60 * 1000, // 24h
  cooldownDuration: 30 * 1000, // 30s between forced refreshes on key miss
  timeoutDuration: 5 * 1000, // 5s fetch timeout
});

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DepartmentClaim {
  department: string;
  role: "director" | "manager" | "staff" | "viewer";
}

export interface VerifiedClaims {
  sub: string;
  email: string;
  super_admin: boolean;
  departments: DepartmentClaim[];
  scopes: string[];
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  jti: string;
}

// ─── Replay protection ──────────────────────────────────────────────────────
//
// Minimal in-process jti cache. Good enough for a single-instance CRM; if
// the CRM horizontally scales, swap for a Redis SET with the same TTL.
//
// Entries auto-evict after their TTL elapses. The cache only needs to outlive
// the JWT's lifetime (~5 min) since exp-checking catches anything older.

const REPLAY_TTL_MS = 6 * 60 * 1000; // 6 min — slightly longer than JWT TTL
const seenJtis = new Map<string, number>();

function rememberJti(jti: string): boolean {
  const now = Date.now();
  // Sweep expired entries opportunistically. Using Array.from instead of
  // `for…of` on the Map for portability — works on any TS target without
  // requiring downlevelIteration.
  Array.from(seenJtis.entries()).forEach(([k, t]) => {
    if (now - t > REPLAY_TTL_MS) seenJtis.delete(k);
  });
  if (seenJtis.has(jti)) return false; // already seen → replay
  seenJtis.set(jti, now);
  return true;
}

// ─── The verifier ───────────────────────────────────────────────────────────

/**
 * Verify a dashboard-issued JWT for the given audience. Throws on any
 * failure (bad sig, wrong iss/aud, expired, replayed). The host app should
 * catch and redirect to its login screen with an error code.
 */
export async function verifyBridgeToken(
  token: string,
  expectedAudience: string,
): Promise<VerifiedClaims> {
  const { payload, protectedHeader } = await jwtVerify(token, JWKS, {
    algorithms: ["RS256"],
    issuer: ISSUER,
    audience: expectedAudience,
    clockTolerance: 30, // seconds
  });

  // Header sanity.
  if (protectedHeader.alg !== "RS256") {
    throw new Error(`unexpected alg: ${protectedHeader.alg}`);
  }

  // Required-claim shape checks. jwtVerify already enforced iss/aud/exp/iat.
  const p = payload as JWTPayload & Partial<VerifiedClaims>;
  if (typeof p.sub !== "string") throw new Error("missing sub");
  if (typeof p.email !== "string") throw new Error("missing email");
  if (typeof p.jti !== "string") throw new Error("missing jti");
  if (typeof p.iat !== "number") throw new Error("missing iat");
  if (typeof p.exp !== "number") throw new Error("missing exp");
  if (typeof p.super_admin !== "boolean") throw new Error("missing super_admin");
  if (!Array.isArray(p.departments)) throw new Error("missing departments");
  if (!Array.isArray(p.scopes)) throw new Error("missing scopes");

  // Replay protection.
  if (!rememberJti(p.jti)) {
    throw new Error(`jti replayed: ${p.jti}`);
  }

  return {
    sub: p.sub,
    email: p.email,
    super_admin: p.super_admin,
    departments: p.departments as DepartmentClaim[],
    scopes: p.scopes as string[],
    aud: typeof p.aud === "string" ? p.aud : expectedAudience,
    iss: typeof p.iss === "string" ? p.iss : ISSUER,
    iat: p.iat,
    exp: p.exp,
    jti: p.jti,
  };
}

/**
 * Convenience: does the verified user hold the given scope?
 *
 *   if (hasScope(claims, "construction-erp", "write")) { … }
 */
export function hasScope(
  claims: VerifiedClaims,
  audience: string,
  minLevel: "admin" | "write" | "write-own" | "read",
): boolean {
  if (claims.super_admin) return true;
  const ranks: Record<string, number> = {
    admin: 4,
    write: 3,
    "write-own": 2,
    read: 1,
  };
  const required = ranks[minLevel];
  for (const s of claims.scopes) {
    if (!s.startsWith(`${audience}:`)) continue;
    const level = s.slice(audience.length + 1);
    const got = ranks[level];
    if (got !== undefined && got >= required) return true;
  }
  return false;
}
