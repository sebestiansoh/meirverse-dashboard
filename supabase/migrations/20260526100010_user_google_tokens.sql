-- ============================================================================
-- 20260526100010_user_google_tokens.sql
-- ============================================================================
-- Per-user Google OAuth refresh + access token storage for Phase 2.4
-- (Google Tasks · Calendar · Drive · future Gmail / Photos integration).
--
-- Captured server-side during the Supabase Auth callback right after the
-- user grants access to the Google scopes for the first time. The
-- refresh token is the long-lived credential — we encrypt it at rest
-- with AES-GCM using GOOGLE_TASKS_REFRESH_TOKEN_ENC_KEY. The access
-- token is short-lived (1h, per Google) and cached here to avoid
-- hammering Google's token endpoint on every API call.
--
-- Per Platform Mandate §Data model: every primary table carries a
-- `company` column. This one allows NULL because Google tokens are
-- user-scoped (an individual's Google account isn't bound to a specific
-- Meirverse org unit). Super Admin reads via the same is_super_admin()
-- helper as the rest of the schema.
-- ============================================================================


create table public.user_google_tokens (
  user_id                  uuid primary key references auth.users(id) on delete cascade,

  -- AES-GCM encrypted Google OAuth refresh token.
  -- Format: base64(12-byte iv || ciphertext || 16-byte auth tag).
  -- Decrypted on demand by lib/crypto/aes-gcm.ts with the env-stored key.
  refresh_token_encrypted  text not null,

  -- Cached access token + expiry. Encrypted same way as refresh_token.
  -- NULL until the first lib/google/refresh-access-token.ts call lands.
  access_token_encrypted   text,
  access_token_expires_at  timestamptz,

  -- Space-separated list of scopes granted on the most recent consent.
  -- Stored verbatim from Google's token response — used to detect when
  -- a feature needs a re-consent (e.g. enabling Calendar after only
  -- Tasks was originally granted).
  scopes                   text,

  -- When we last successfully refreshed the access token. Useful for
  -- debugging "why are my tasks not loading" and for rotation logic.
  last_refreshed_at        timestamptz,

  -- Company column per Mandate §Data model. NULL = user-scoped (not
  -- org-scoped) — a user's Google account isn't a Meirverse org unit
  -- attribute. Kept on the table for shape uniformity.
  company                  text references public.company(company_id),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.user_google_tokens is
  'Per-user Google API tokens for Phase 2.4 integrations (Tasks, Calendar, Drive). Refresh + access tokens AES-GCM encrypted at rest with GOOGLE_TASKS_REFRESH_TOKEN_ENC_KEY.';
comment on column public.user_google_tokens.refresh_token_encrypted is
  'AES-GCM encrypted Google OAuth refresh token. Format: base64(iv || ciphertext || authTag).';
comment on column public.user_google_tokens.access_token_encrypted is
  'AES-GCM encrypted Google OAuth access token. Cached to avoid hammering Google''s token endpoint; expires per access_token_expires_at.';

create index user_google_tokens_expires_idx
  on public.user_google_tokens(access_token_expires_at)
  where access_token_expires_at is not null;

create trigger user_google_tokens_touch
  before update on public.user_google_tokens
  for each row execute function public.touch_updated_at();

alter table public.user_google_tokens enable row level security;

-- Each user can manage only their own tokens. Service-role (used by the
-- /auth/callback handler) bypasses RLS — we don't write a separate
-- service-role policy because service-role doesn't go through RLS.
create policy "own google tokens"
  on public.user_google_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Super Admin gets read access for support / debug ("why is X's calendar
-- empty?"). NOT write — Super Admin shouldn't be able to overwrite
-- another user's token without their consent.
create policy "super admin reads google tokens"
  on public.user_google_tokens
  for select
  using (public.is_super_admin());
