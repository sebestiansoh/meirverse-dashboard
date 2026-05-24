/**
 * RS256 keypair loading + JWKS export for the SSO bridge.
 *
 * Per ARCHITECTURE §8.2.5: dashboard signs short-lived (5-min) audience-bound
 * JWTs with an RS256 keypair; the public key is served at
 * `/.well-known/jwks.json` for CRMs to verify. Keys rotate every 90 days
 * with a 24-hour overlap window where BOTH the current and previous public
 * keys are published — the `kid` header tells CRMs which key to use.
 *
 * Keys are stored in env as base64-encoded PEMs (`BASE64(<PEM bytes>)`).
 * Base64 sidesteps the multi-line escaping pain of putting raw PEMs in
 * `.env` files or Vercel env vars.
 *
 * Env vars:
 *   JWT_PRIVATE_KEY_PEM           — base64 PEM, REQUIRED for /api/sso/issue
 *   JWT_PUBLIC_KEY_PEM            — base64 PEM, REQUIRED for /.well-known/jwks.json
 *   JWT_KEY_ID                    — short hex id (e.g. `openssl rand -hex 8`)
 *   JWT_PRIVATE_KEY_PEM_PREVIOUS  — optional; the key being rotated OUT
 *   JWT_PUBLIC_KEY_PEM_PREVIOUS   — optional; published in JWKS during overlap
 *   JWT_KEY_ID_PREVIOUS           — optional; kid of the previous key
 *
 * The PREVIOUS_* vars exist ONLY during a key rotation. Set them for 24h
 * after rotation, then delete to retire the old key from the JWKS.
 */

import { importPKCS8, importSPKI, exportJWK, type JWK } from "jose";

const ALG = "RS256";

/**
 * In jose v6 the imported key is a WebCrypto `CryptoKey`. (Earlier versions
 * exported a `KeyLike` alias that bridged Node KeyObject + CryptoKey; that's
 * gone now since jose is WebCrypto-native.)
 */
type SignerKey = Awaited<ReturnType<typeof importPKCS8>>;

export interface SigningKey {
  /** The private key for signing. */
  privateKey: SignerKey;
  /** Header `kid` value — tells verifiers which JWK in the JWKS to use. */
  kid: string;
}

export interface PublishedKey {
  /** Public JWK with `kid`, `alg`, `use: "sig"` set. */
  jwk: JWK;
  /** Convenience copy of the `kid` from the jwk for filtering. */
  kid: string;
}

/**
 * Decode a base64 PEM env value back to a PEM string suitable for jose.
 * Throws if the env var is missing or empty — callers must handle.
 */
function decodePem(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      `[jwt-keys] ${name} is empty. SSO bridge cannot function — set it per .env.local.example.`,
    );
  }
  // Tolerate both raw PEM (starts with -----BEGIN) and base64-wrapped PEM.
  const trimmed = value.trim();
  if (trimmed.startsWith("-----BEGIN")) {
    return trimmed;
  }
  try {
    const pem = Buffer.from(trimmed, "base64").toString("utf8");
    if (!pem.startsWith("-----BEGIN")) {
      throw new Error("decoded value is not a PEM");
    }
    return pem;
  } catch (err) {
    throw new Error(
      `[jwt-keys] ${name} is not a valid base64-encoded PEM. ${
        err instanceof Error ? err.message : ""
      }`,
    );
  }
}

/**
 * Load the CURRENT signing key. Use this in `/api/sso/issue`.
 *
 * Throws (rather than returning a placeholder) so a misconfigured production
 * deploy fails loudly instead of silently minting JWTs that nobody can verify.
 */
export async function loadSigningKey(): Promise<SigningKey> {
  const pem = decodePem("JWT_PRIVATE_KEY_PEM", process.env["JWT_PRIVATE_KEY_PEM"]);
  const kid = process.env["JWT_KEY_ID"];
  if (!kid) {
    throw new Error(
      "[jwt-keys] JWT_KEY_ID is required. Generate one with `openssl rand -hex 8`.",
    );
  }
  const privateKey = await importPKCS8(pem, ALG);
  return { privateKey, kid };
}

/**
 * Load every PUBLIC key that should appear in the JWKS — current + (during
 * rotation) the previous one. Use this in `/.well-known/jwks.json`.
 *
 * Returns an empty array if no public key is configured, so the JWKS endpoint
 * can return `{ keys: [] }` rather than 500-ing during the brief window before
 * the env is set.
 */
export async function loadPublishedKeys(): Promise<PublishedKey[]> {
  const out: PublishedKey[] = [];

  const currentPemEnv = process.env["JWT_PUBLIC_KEY_PEM"];
  const currentKid = process.env["JWT_KEY_ID"];
  if (currentPemEnv && currentKid) {
    try {
      const pem = decodePem("JWT_PUBLIC_KEY_PEM", currentPemEnv);
      const key = await importSPKI(pem, ALG, { extractable: true });
      const jwk = await exportJWK(key);
      out.push({
        jwk: { ...jwk, alg: ALG, use: "sig", kid: currentKid },
        kid: currentKid,
      });
    } catch (err) {
      // Don't bring down the JWKS endpoint over a single malformed key.
      console.error("[jwt-keys] failed to load current public key:", err);
    }
  }

  const previousPemEnv = process.env["JWT_PUBLIC_KEY_PEM_PREVIOUS"];
  const previousKid = process.env["JWT_KEY_ID_PREVIOUS"];
  if (previousPemEnv && previousKid && previousKid !== currentKid) {
    try {
      const pem = decodePem("JWT_PUBLIC_KEY_PEM_PREVIOUS", previousPemEnv);
      const key = await importSPKI(pem, ALG, { extractable: true });
      const jwk = await exportJWK(key);
      out.push({
        jwk: { ...jwk, alg: ALG, use: "sig", kid: previousKid },
        kid: previousKid,
      });
    } catch (err) {
      console.error("[jwt-keys] failed to load previous public key:", err);
    }
  }

  return out;
}

export const SIGNING_ALGORITHM = ALG;
