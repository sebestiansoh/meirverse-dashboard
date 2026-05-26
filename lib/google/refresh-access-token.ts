/**
 * Google access-token refresh + cache for Phase 2.4.
 *
 * The /auth/callback handler captured the long-lived refresh token at
 * sign-in. Access tokens are short-lived (1h) — we cache them in the
 * user_google_tokens table and refresh on demand when the cached one is
 * within 60s of expiry.
 *
 * Requires:
 *   - GOOGLE_CLIENT_ID
 *   - GOOGLE_CLIENT_SECRET
 * in env. These are the SAME values pasted into Supabase Auth →
 * Providers → Google (Supabase uses them for the OAuth dance; the app
 * uses them here for the refresh-token grant). Add to Vercel env.
 *
 * Returns the access-token string on success, `null` when there's no
 * refresh token on file (user hasn't granted offline access yet, or
 * revoked it). Callers should handle `null` by surfacing a "connect
 * Google" UX in the widget.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "@/lib/crypto/aes-gcm";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
// Refresh proactively if cached access token expires within this many seconds.
const SAFETY_BUFFER_SECONDS = 60;

export async function getGoogleAccessToken(
  userId: string,
): Promise<string | null> {
  const supabase = createSupabaseServiceClient();

  const { data: row, error } = await supabase
    .from("user_google_tokens")
    .select(
      "refresh_token_encrypted, access_token_encrypted, access_token_expires_at",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[google/refresh] token row fetch failed:", error.message);
    return null;
  }
  if (!row) {
    // No tokens on file — user hasn't completed the offline-access OAuth
    // flow. Caller should prompt them to sign in again to grant scopes.
    return null;
  }

  // Cached access token still valid? Use it.
  if (row.access_token_encrypted && row.access_token_expires_at) {
    const expiresAt = new Date(row.access_token_expires_at).getTime();
    if (expiresAt > Date.now() + SAFETY_BUFFER_SECONDS * 1000) {
      try {
        return decryptToken(row.access_token_encrypted);
      } catch (err) {
        console.error(
          "[google/refresh] cached access token decrypt failed; will refresh:",
          err,
        );
        // Fall through to refresh.
      }
    }
  }

  // Need to refresh.
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      "[google/refresh] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET unset — cannot refresh",
    );
    return null;
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(row.refresh_token_encrypted);
  } catch (err) {
    console.error("[google/refresh] refresh token decrypt failed:", err);
    return null;
  }

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
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
      `[google/refresh] token endpoint ${tokenRes.status}: ${text.slice(0, 300)}`,
    );
    // 400 invalid_grant typically means the user revoked offline access in
    // their Google account. We could delete the row here to force a fresh
    // OAuth flow, but that's a UX call — defer to the widget.
    return null;
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
  };

  // Cache it for next call.
  const newExpiry = new Date(
    Date.now() + tokenData.expires_in * 1000,
  ).toISOString();
  const { error: updateErr } = await supabase
    .from("user_google_tokens")
    .update({
      access_token_encrypted: encryptToken(tokenData.access_token),
      access_token_expires_at: newExpiry,
      last_refreshed_at: new Date().toISOString(),
      scopes: tokenData.scope,
    })
    .eq("user_id", userId);

  if (updateErr) {
    console.error(
      "[google/refresh] cache update failed (non-fatal):",
      updateErr.message,
    );
  }

  return tokenData.access_token;
}
