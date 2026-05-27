/**
 * Microsoft access-token refresh + cache.
 *
 * Mirror of lib/google/refresh-access-token.ts but pointed at
 * login.microsoftonline.com. The /auth/callback handler captured the
 * long-lived refresh token at sign-in (provider 'azure'). Access tokens
 * are short-lived (~1h) — we cache them in user_microsoft_tokens and
 * refresh on demand when the cached one is within 60s of expiry.
 *
 * Requires:
 *   - MICROSOFT_CLIENT_ID
 *   - MICROSOFT_CLIENT_SECRET
 *   - MICROSOFT_TOKEN_ENC_KEY  (AES-256 key, base64 of 32 bytes)
 *
 * Same client id/secret that's pasted into Supabase Auth → Providers →
 * Azure. App-registered in Azure Portal under the Meirverse tenant
 * (typically "common" multi-tenant or your specific Workspace tenant id).
 *
 * Returns the access-token string on success, `null` when:
 *   - the user has no refresh token on file (hasn't signed in with
 *     Microsoft yet, or revoked offline access)
 *   - the refresh-token grant fails (invalid_grant typically means
 *     revocation in account.microsoft.com)
 *   - the token-encryption key is missing
 *
 * Callers should treat `null` as "show Connect Microsoft" UX.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "@/lib/crypto/aes-gcm";

const MS_KEY_ENV = "MICROSOFT_TOKEN_ENC_KEY";

// Refresh proactively if cached access token expires within this many seconds.
const SAFETY_BUFFER_SECONDS = 60;

/**
 * Microsoft's token endpoint. `common` accepts both personal and
 * Workspace accounts. If we ever want to constrain to a specific tenant
 * we'd swap `common` for the tenant id (also stored in
 * user_microsoft_tokens.tenant_id from the id_token).
 */
function tokenUrlFor(tenantId: string | null): string {
  const tenant = tenantId && tenantId.length > 0 ? tenantId : "common";
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
}

export async function getMicrosoftAccessToken(
  userId: string,
): Promise<string | null> {
  const supabase = createSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from("user_microsoft_tokens")
    .select(
      "refresh_token_encrypted, access_token_encrypted, access_token_expires_at, tenant_id",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(
      "[microsoft/refresh] token row fetch failed:",
      error.message,
    );
    return null;
  }
  if (!row) {
    // No tokens on file — user hasn't completed the offline-access OAuth
    // flow with Microsoft. Caller surfaces a "Connect Microsoft" CTA.
    return null;
  }

  // Cached access token still valid? Use it.
  if (row.access_token_encrypted && row.access_token_expires_at) {
    const expiresAt = new Date(row.access_token_expires_at).getTime();
    if (expiresAt > Date.now() + SAFETY_BUFFER_SECONDS * 1000) {
      try {
        return decryptToken(row.access_token_encrypted, MS_KEY_ENV);
      } catch (err) {
        console.error(
          "[microsoft/refresh] cached access token decrypt failed; will refresh:",
          err,
        );
        // Fall through to refresh.
      }
    }
  }

  // Need to refresh.
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "[microsoft/refresh] MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET unset — cannot refresh",
    );
    return null;
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(row.refresh_token_encrypted, MS_KEY_ENV);
  } catch (err) {
    console.error("[microsoft/refresh] refresh token decrypt failed:", err);
    return null;
  }

  const tokenRes = await fetch(tokenUrlFor(row.tenant_id), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "<unreadable>");
    console.error(
      `[microsoft/refresh] token endpoint ${tokenRes.status}: ${text.slice(0, 300)}`,
    );
    // 400 invalid_grant typically means the user revoked the app from
    // their Microsoft account. We could delete the row here to force a
    // fresh OAuth flow, but that's a UX call — defer to the widget.
    return null;
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string; // Microsoft sometimes rotates the refresh token
    expires_in: number;
    scope?: string;
  };

  // Microsoft sometimes issues a new refresh token on refresh — capture
  // it if present, otherwise keep the existing one. Skipping this means
  // we'd silently degrade after the next rotation.
  const updatePayload: Record<string, string | null> = {
    access_token_encrypted: encryptToken(tokenData.access_token, MS_KEY_ENV),
    access_token_expires_at: new Date(
      Date.now() + tokenData.expires_in * 1000,
    ).toISOString(),
    last_refreshed_at: new Date().toISOString(),
  };
  if (tokenData.scope) updatePayload.scopes = tokenData.scope;
  if (tokenData.refresh_token) {
    updatePayload.refresh_token_encrypted = encryptToken(
      tokenData.refresh_token,
      MS_KEY_ENV,
    );
  }

  const { error: updateErr } = await supabase
    .from("user_microsoft_tokens")
    .update(updatePayload)
    .eq("user_id", userId);

  if (updateErr) {
    console.error(
      "[microsoft/refresh] cache update failed (non-fatal):",
      updateErr.message,
    );
  }

  return tokenData.access_token;
}
