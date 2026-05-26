/**
 * Persist a user's Google OAuth refresh + access tokens.
 *
 * Called from /auth/callback after a successful Supabase OAuth exchange.
 * Uses the service-role Supabase client because the row is being written
 * before the user's session cookie has fully propagated into RLS context;
 * service-role bypasses RLS cleanly. (The own-row RLS policy still
 * protects subsequent reads.)
 *
 * Refresh token is mandatory — if Google didn't issue one, we don't have
 * an offline relationship and Phase 2.4 features can't work. Caller should
 * skip calling this function when the refresh token is absent (e.g. a
 * subsequent sign-in where Google didn't re-issue offline access).
 *
 * Access token is optional — sometimes Google omits it on subsequent
 * sign-ins. lib/google/refresh-access-token.ts will mint a fresh one on
 * demand using the refresh token.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/crypto/aes-gcm";

interface StoreTokensArgs {
  userId: string;
  refreshToken: string;
  accessToken?: string | null;
  /** Seconds until access token expires (Google's `expires_in`). Defaults to 3600. */
  accessTokenExpiresIn?: number;
  /** Space-separated list, exactly as Google returned in the token response. */
  scopes?: string;
}

export async function storeGoogleTokens(args: StoreTokensArgs): Promise<void> {
  const {
    userId,
    refreshToken,
    accessToken,
    accessTokenExpiresIn = 3600,
    scopes,
  } = args;

  const supabase = createSupabaseServiceClient();

  const refreshEncrypted = encryptToken(refreshToken);
  const accessEncrypted = accessToken ? encryptToken(accessToken) : null;
  const accessExpiresAt = accessToken
    ? new Date(Date.now() + accessTokenExpiresIn * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from("user_google_tokens")
    .upsert(
      {
        user_id: userId,
        refresh_token_encrypted: refreshEncrypted,
        access_token_encrypted: accessEncrypted,
        access_token_expires_at: accessExpiresAt,
        scopes: scopes ?? null,
        last_refreshed_at: accessToken ? new Date().toISOString() : null,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error(
      `[google/store-tokens] upsert failed for ${userId}: ${error.message}`,
    );
  }
}
