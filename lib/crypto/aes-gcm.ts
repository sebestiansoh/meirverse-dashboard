/**
 * AES-256-GCM symmetric encryption / decryption for at-rest token storage.
 *
 * Used by:
 *   - lib/google/refresh-access-token.ts (Google OAuth refresh + access tokens)
 *   - future: notes module (per ARCHITECTURE §5)
 *
 * Format on the wire (and at rest in Supabase):
 *
 *     base64(  IV (12 bytes)  ||  ciphertext  ||  auth tag (16 bytes)  )
 *
 * 12-byte IV is the GCM-recommended length. Random per-encrypt (never
 * reuse). 16-byte tag is the standard. Concatenating means one column
 * (not three).
 *
 * Key comes from env: GOOGLE_TASKS_REFRESH_TOKEN_ENC_KEY. Must be a
 * base64-encoded 32-byte (256-bit) random value. Generate with:
 *
 *     openssl rand -base64 32
 *
 * Key rotation: future work. When needed, decrypt-with-old + encrypt-with-new
 * during a migration window, keep old key as PREVIOUS env var for fallback
 * (same pattern as JWT key rotation in lib/auth/jwt-keys.ts).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 12; // GCM-recommended
const TAG_LEN = 16; // GCM standard
const KEY_LEN = 32; // AES-256

/**
 * Lazy key loader — throws on first call if the env var is missing or
 * malformed. Lazy so the module can import in environments where the key
 * isn't configured (e.g. local dev for unrelated features) without
 * crashing on import.
 */
function loadKey(): Buffer {
  const raw = process.env.GOOGLE_TASKS_REFRESH_TOKEN_ENC_KEY;
  if (!raw || raw.trim().length === 0) {
    throw new Error(
      "[crypto/aes-gcm] GOOGLE_TASKS_REFRESH_TOKEN_ENC_KEY is unset. " +
        "Generate one with `openssl rand -base64 32` and add to Vercel env.",
    );
  }
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== KEY_LEN) {
    throw new Error(
      `[crypto/aes-gcm] GOOGLE_TASKS_REFRESH_TOKEN_ENC_KEY decoded to ${key.length} bytes, expected ${KEY_LEN} (AES-256). Did you base64-encode a 32-byte value?`,
    );
  }
  return key;
}

/**
 * Encrypt a plaintext string. Returns base64(iv || ciphertext || tag).
 *
 * Throws if the key env is missing or malformed (let the route catch and
 * 500 — silently storing unencrypted tokens would be worse).
 */
export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64");
}

/**
 * Decrypt a base64(iv || ciphertext || tag) blob back to plaintext.
 *
 * Throws if:
 *   - the env key is missing/malformed (same as encryptToken)
 *   - the blob is too short to contain iv + tag
 *   - the auth tag fails (tampering or wrong key)
 */
export function decryptToken(blob: string): string {
  const key = loadKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error(
      `[crypto/aes-gcm] ciphertext blob is ${buf.length} bytes, too short to contain IV + tag (need >= ${IV_LEN + TAG_LEN}).`,
    );
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ciphertext = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
