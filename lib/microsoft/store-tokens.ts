/**
 * Persist a user's Microsoft OAuth refresh + access tokens.
 *
 * Called from /auth/callback after a successful Supabase OAuth exchange
 * where the provider was `azure`. Uses the service-role Supabase client
 * because the row is being written before the user's session cookie has
 * fully propagated into RLS context; service-role bypasses RLS cleanly.
 * (The own-row RLS policy still protects subsequent reads.)
 *
 * Refresh token is mandatory — if Microsoft did not issue one, we don't
 * have an offline relationship and the Microsoft widgets can't work.
 * Caller should skip calling this function when the refresh token is
 * absent (e.g. a subsequent sign-in where offline_access was previously
 * granted and Microsoft didn't re-issue).
 *
 * Access token is optional — sometimes omitted on subsequent sign-ins.
 * lib/microsoft/refresh-access-token.ts will mint a fresh one on demand
 * using the refresh token.
 *
 * Key separation note: Microsoft tokens use MICROSOFT_TOKEN_ENC_KEY (a
 * separate env from the Google key) so the two providers have
 * independent blast radii on key compromise.
 */

import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { encryptToken } from "@/lib/crypto/aes-gcm";

const MS_KEY_ENV = "MICROSOFT_TOKEN_ENC_KEY";

interface StoreTokensArgs {
  userId: string;
  refreshToken: string;
  accessToken?: string | null;
  /** Seconds until access token expires (Microsoft's `expires_in`). Defaults to 3600. */
  accessTokenExpiresIn?: number;
  /** Space-separated list, exactly as Microsoft returned in the token response. */
  scopes?: string;
  /** Microsoft tenant id from the id_token `tid` claim. Optional but useful. */
  tenantId?: string | null;
}

export async function storeMicrosoftTokens(
  args: StoreTokensArgs,
): Promise<void> {
  const {
    userId,
    refreshToken,
    accessToken,
    accessTokenExpiresIn = 3600,
    scopes,
    tenantId,
  } = args;

  const supabase = createSupabaseServiceClient();

  const refreshEncrypted = encryptToken(refreshToken, MS_KEY_ENV);
  const accessEncrypted = accessToken
    ? encryptToken(accessToken, MS_KEY_ENV)
    : null;
  const accessExpiresAt = accessToken
    ? new Date(Date.now() + accessTokenExpiresIn * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from("user_microsoft_tokens")
    .upsert(
      {
        user_id: userId,
        refresh_token_encrypted: refreshEncrypted,
        access_token_encrypted: accessEncrypted,
        access_token_expires_at: accessExpiresAt,
        scopes: scopes ?? null,
        tenant_id: tenantId ?? null,
        last_refreshed_at: accessToken ? new Date().toISOString() : null,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error(
      `[microsoft/store-tokens] upsert failed for ${userId}: ${error.message}`,
    );
  }
}
