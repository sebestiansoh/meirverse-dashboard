-- ============================================================================
-- 20260525100020_user_profiles.sql
-- ============================================================================
-- Minimal user profile + the Super Admin flag. Per Mandate §Access control
-- layer 1: Super Admin is "reserved to the Principal + designated deputies"
-- and is cross-org / cross-dashboard.
--
-- A profile row is auto-created on auth.users insert via the trigger below.
-- That guarantees every dashboard query that joins to user_profiles for
-- is_super_admin (the universal bypass) succeeds for a freshly-signed-up
-- user instead of 500ing.
--
-- The `primary_company` column is the user's HOME org unit. The
-- user_access matrix in 20260525100030_user_access_matrix.sql carries the
-- list of OTHER companies the user can act in. A user with no rows in
-- user_access still has read access scoped to their primary_company via
-- the RLS policies in 20260525100400_rls_policies.sql.
-- ============================================================================

create table public.user_profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  email             text,
  is_super_admin    boolean not null default false,
  primary_company   text references public.company(company_id),
  ui_preferences    jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.user_profiles is
  'One row per authenticated user. is_super_admin is the universal bypass (Mandate §Access control). primary_company is the user''s home org unit — secondary grants live in user_access.';
comment on column public.user_profiles.is_super_admin is
  'Set manually via service role. Bypasses all (module × company) checks. Reserved to the Principal (sebestian@meir.sg) and designated deputies.';
comment on column public.user_profiles.primary_company is
  'The user''s home org unit. Other companies they can act in live in user_access. NULL for users not yet assigned to an org unit (e.g. holdco-only staff).';

create index user_profiles_primary_company_idx
  on public.user_profiles(primary_company)
  where primary_company is not null;
create index user_profiles_super_admin_idx
  on public.user_profiles(is_super_admin)
  where is_super_admin = true;

alter table public.user_profiles enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_touch
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- auth.users → user_profiles auto-bridge
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
