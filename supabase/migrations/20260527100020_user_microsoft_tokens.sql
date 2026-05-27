-- ============================================================================
-- 20260527100020_user_microsoft_tokens.sql
-- ============================================================================
-- Per-user Microsoft OAuth refresh + access token storage. Mirror of
-- public.user_google_tokens (20260526100010) for the Phase 2.6 increment
-- adding Microsoft 365 integrations: Outlook Calendar, Microsoft To Do,
-- OneDrive (and future Outlook Mail / Teams / SharePoint).
--
-- Token capture happens server-side during the Supabase Auth callback
-- after the user grants the Microsoft Graph scopes for the first time
-- (provider 'azure' on supabase.auth.signInWithOAuth). The refresh token
-- is the long-lived credential — encrypted at rest with AES-GCM using
-- MICROSOFT_TOKEN_ENC_KEY (separate env from GOOGLE_TASKS_REFRESH_TOKEN_ENC_KEY
-- so the two providers have independent blast radii on key compromise).
--
-- Per Platform Mandate v1.7 §Data model: every primary table carries a
-- `company` column. This one allows NULL because Microsoft tokens are
-- user-scoped, not org-scoped. Super Admin reads via is_super_admin()
-- helper for support/debug.
-- ============================================================================


create table public.user_microsoft_tokens (
  user_id                  uuid primary key references auth.users(id) on delete cascade,

  -- AES-GCM encrypted Microsoft OAuth refresh token.
  -- Format: base64(12-byte iv || ciphertext || 16-byte auth tag).
  -- Decrypted on demand by lib/crypto/aes-gcm.ts with MICROSOFT_TOKEN_ENC_KEY.
  refresh_token_encrypted  text not null,

  -- Cached access token + expiry. Encrypted same way as refresh_token.
  -- NULL until the first lib/microsoft/refresh-access-token.ts call lands.
  access_token_encrypted   text,
  access_token_expires_at  timestamptz,

  -- Space-separated list of scopes granted on the most recent consent.
  -- Microsoft returns scopes verbatim in the token response — used to
  -- detect when a feature needs a re-consent (e.g. enabling OneDrive
  -- after only Calendar was originally granted).
  scopes                   text,

  -- Microsoft tenant id (issued in the id_token `tid` claim). Useful for
  -- supporting multi-tenant scenarios and for debugging "why are this
  -- user's calls 401-ing" — the tenant must match what the access token
  -- was issued for.
  tenant_id                text,

  -- When we last successfully refreshed the access token. Useful for
  -- debugging "why are my events not loading" and for rotation logic.
  last_refreshed_at        timestamptz,

  -- Company column per Mandate §Data model. NULL = user-scoped (not
  -- org-scoped) — a user's Microsoft account isn't a Meirverse org unit
  -- attribute. Kept on the table for shape uniformity.
  company                  text references public.company(company_id),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.user_microsoft_tokens is
  'Per-user Microsoft Graph API tokens for Phase 2.6 integrations (Outlook Calendar, To Do, OneDrive). Refresh + access tokens AES-GCM encrypted at rest with MICROSOFT_TOKEN_ENC_KEY.';
comment on column public.user_microsoft_tokens.refresh_token_encrypted is
  'AES-GCM encrypted Microsoft OAuth refresh token. Format: base64(iv || ciphertext || authTag).';
comment on column public.user_microsoft_tokens.access_token_encrypted is
  'AES-GCM encrypted Microsoft OAuth access token. Cached to avoid hammering login.microsoftonline.com; expires per access_token_expires_at.';
comment on column public.user_microsoft_tokens.tenant_id is
  'Microsoft tenant id (id_token tid claim). Used by refresh-access-token to hit the correct tenant-scoped token endpoint.';

create index user_microsoft_tokens_expires_idx
  on public.user_microsoft_tokens(access_token_expires_at)
  where access_token_expires_at is not null;

create trigger user_microsoft_tokens_touch
  before update on public.user_microsoft_tokens
  for each row execute function public.touch_updated_at();

alter table public.user_microsoft_tokens enable row level security;

-- Each user can manage only their own tokens. Service-role (used by the
-- /auth/callback handler) bypasses RLS — we don't write a separate
-- service-role policy because service-role doesn't go through RLS.
create policy "own microsoft tokens"
  on public.user_microsoft_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Super Admin gets read access for support / debug ("why is X's Outlook
-- empty?"). NOT write — Super Admin shouldn't be able to overwrite
-- another user's token without their consent.
create policy "super admin reads microsoft tokens"
  on public.user_microsoft_tokens
  for select
  using (public.is_super_admin());
