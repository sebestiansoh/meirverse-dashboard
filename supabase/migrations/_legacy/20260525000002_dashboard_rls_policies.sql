-- ============================================================================
-- 20260525000002_dashboard_rls_policies.sql
-- ============================================================================
-- Phase 2.3 · Row-Level Security · NON-NEGOTIABLE per ARCHITECTURE §13.
--
-- Every table from the core schema is locked down here. Without these, the
-- anon key in the browser could read every user's notes and tasks. With
-- these, the same anon key is gated by auth.uid() and the policies below.
--
-- Conventions:
--   • Super Admin bypass is implemented as a `using/with check` predicate
--     `is_super_admin_bypass()` so adding new tables stays one-line.
--   • "Own row" predicates use auth.uid() against the user_id column.
--   • Director-scoped policies use a correlated subquery into
--     user_departments — cheap with the (user_id, department_id) PK index.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- Super Admin bypass helper · used by every "modify reference data" policy
-- and as a fallback grant on user-scoped tables.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_super_admin_bypass()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.user_profiles where user_id = auth.uid()),
    false
  );
$$;

comment on function public.is_super_admin_bypass() is
  'True iff the current auth.uid() has user_profiles.is_super_admin = true. SECURITY DEFINER so RLS on user_profiles does not recursively block the lookup.';


-- ─────────────────────────────────────────────────────────────────────────────
-- user_profiles
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_profiles enable row level security;

create policy "own profile read"      on public.user_profiles for select using (auth.uid() = user_id or public.is_super_admin_bypass());
create policy "own profile update"    on public.user_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- Inserts are made by the on_auth_user_created trigger (SECURITY DEFINER).
-- Block direct inserts from the anon key.
create policy "no client profile insert" on public.user_profiles for insert with check (false);
-- Deletes cascade from auth.users; no client-side delete path.
create policy "no client profile delete" on public.user_profiles for delete using (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- departments · read by all authenticated · Super Admin modifies
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.departments enable row level security;

create policy "all read departments"      on public.departments for select using (auth.uid() is not null);
create policy "super admin modifies departments" on public.departments for all
  using (public.is_super_admin_bypass())
  with check (public.is_super_admin_bypass());


-- ─────────────────────────────────────────────────────────────────────────────
-- user_departments
--   • Own assignments — always visible (so the dashboard can show your roles)
--   • Directors — see all assignments inside departments they direct
--   • Super Admin — all
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_departments enable row level security;

create policy "own department assignments" on public.user_departments for select
  using (auth.uid() = user_id);

create policy "directors see dept assignments" on public.user_departments for select
  using (
    exists (
      select 1 from public.user_departments ud
      where ud.user_id = auth.uid()
        and ud.department_id = public.user_departments.department_id
        and ud.role = 'director'
    )
  );

create policy "super admin sees all assignments" on public.user_departments for select
  using (public.is_super_admin_bypass());

-- Writes — Directors within their dept, or Super Admin.
create policy "directors grant in own dept" on public.user_departments for insert
  with check (
    exists (
      select 1 from public.user_departments ud
      where ud.user_id = auth.uid()
        and ud.department_id = public.user_departments.department_id
        and ud.role = 'director'
    )
    or public.is_super_admin_bypass()
  );

create policy "directors revoke in own dept" on public.user_departments for delete
  using (
    exists (
      select 1 from public.user_departments ud
      where ud.user_id = auth.uid()
        and ud.department_id = public.user_departments.department_id
        and ud.role = 'director'
    )
    or public.is_super_admin_bypass()
  );

create policy "directors update in own dept" on public.user_departments for update
  using (
    exists (
      select 1 from public.user_departments ud
      where ud.user_id = auth.uid()
        and ud.department_id = public.user_departments.department_id
        and ud.role = 'director'
    )
    or public.is_super_admin_bypass()
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- tasks · own only (Super Admin can read all for support)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tasks enable row level security;

create policy "own tasks all"     on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "super admin reads tasks" on public.tasks for select
  using (public.is_super_admin_bypass());


-- ─────────────────────────────────────────────────────────────────────────────
-- notes · own only · Super Admin CANNOT read (encrypted client-side anyway,
-- but keep the policy honest — Super Admin's bypass is for *operational*
-- visibility, not surveillance of private notes)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.notes enable row level security;

create policy "own notes all" on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- quick_launch · own or team-shared
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.quick_launch enable row level security;

create policy "own or shared launch read" on public.quick_launch for select
  using (
    owner_user_id = auth.uid()
    or shared_with_team = true
    or public.is_super_admin_bypass()
  );

create policy "own launch insert" on public.quick_launch for insert
  with check (owner_user_id = auth.uid());

create policy "own launch update" on public.quick_launch for update
  using (owner_user_id = auth.uid() or public.is_super_admin_bypass());

create policy "own launch delete" on public.quick_launch for delete
  using (owner_user_id = auth.uid() or public.is_super_admin_bypass());


-- ─────────────────────────────────────────────────────────────────────────────
-- entities · read by all authenticated · Super Admin modifies
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.entities enable row level security;

create policy "all read entities" on public.entities for select using (auth.uid() is not null);
create policy "super admin modifies entities" on public.entities for all
  using (public.is_super_admin_bypass())
  with check (public.is_super_admin_bypass());


-- ─────────────────────────────────────────────────────────────────────────────
-- cluster_entities · read by all authenticated · Super Admin modifies
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.cluster_entities enable row level security;

create policy "all read cluster_entities" on public.cluster_entities for select using (auth.uid() is not null);
create policy "super admin modifies cluster_entities" on public.cluster_entities for all
  using (public.is_super_admin_bypass())
  with check (public.is_super_admin_bypass());


-- ─────────────────────────────────────────────────────────────────────────────
-- sso_issuances · own only (Super Admin reads all for audit)
-- Writes happen exclusively via the SSO bridge route handler using the
-- service-role key, so no INSERT policy is granted to the anon role.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.sso_issuances enable row level security;

create policy "own sso records" on public.sso_issuances for select
  using (auth.uid() = user_id or public.is_super_admin_bypass());

create policy "no client sso insert" on public.sso_issuances for insert with check (false);
create policy "no client sso update" on public.sso_issuances for update using (false);
create policy "no client sso delete" on public.sso_issuances for delete using (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- announcements · read by all authenticated · Director+ posts
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.announcements enable row level security;

create policy "all read announcements" on public.announcements for select using (auth.uid() is not null);

create policy "directors post announcements" on public.announcements for insert
  with check (
    exists (
      select 1 from public.user_departments
      where user_id = auth.uid() and role = 'director'
    )
    or public.is_super_admin_bypass()
  );

create policy "authors edit announcements" on public.announcements for update
  using (posted_by = auth.uid() or public.is_super_admin_bypass())
  with check (posted_by = auth.uid() or public.is_super_admin_bypass());

create policy "authors delete announcements" on public.announcements for delete
  using (posted_by = auth.uid() or public.is_super_admin_bypass());


-- ─────────────────────────────────────────────────────────────────────────────
-- feedback
--   • Submitters can read their own
--   • Directors read feedback tagged to their department
--   • Directors respond (update) to feedback in their department
--   • Super Admin sees and modifies all
-- The `anonymous` flag is a UI display rule — directors/super admin still
-- have the submitter_user_id in the row so they can respond. UI MUST render
-- "Anonymous" when the flag is set.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.feedback enable row level security;

create policy "own feedback read" on public.feedback for select
  using (submitter_user_id = auth.uid());

create policy "submit feedback" on public.feedback for insert
  with check (submitter_user_id = auth.uid());

create policy "directors see dept feedback" on public.feedback for select
  using (
    exists (
      select 1 from public.user_departments
      where user_id = auth.uid()
        and department_id = public.feedback.department_id
        and role = 'director'
    )
  );

create policy "super admin sees all feedback" on public.feedback for all
  using (public.is_super_admin_bypass())
  with check (public.is_super_admin_bypass());

create policy "directors respond dept feedback" on public.feedback for update
  using (
    exists (
      select 1 from public.user_departments
      where user_id = auth.uid()
        and department_id = public.feedback.department_id
        and role = 'director'
    )
  )
  with check (
    exists (
      select 1 from public.user_departments
      where user_id = auth.uid()
        and department_id = public.feedback.department_id
        and role = 'director'
    )
  );
