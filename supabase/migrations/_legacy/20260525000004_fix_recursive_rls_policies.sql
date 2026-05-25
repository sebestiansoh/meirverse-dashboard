-- ============================================================================
-- 20260525000004_fix_recursive_rls_policies.sql
--
-- Fix `infinite recursion detected in policy for relation "user_departments"`
-- surfaced as a 500 on first sign-in (2026-05-25, prod digest 2254084883).
--
-- Root cause: the four "directors …" policies on public.user_departments do
--   exists (select 1 from public.user_departments ud where ud.user_id = … )
-- inside a policy ON public.user_departments. Postgres tries to evaluate the
-- inner SELECT through the same policy → infinite recursion → query aborts.
--
-- Fix: extract the "is the current user a director in this department?"
-- check into a SECURITY DEFINER function (`is_director_in_department(text)`).
-- SECURITY DEFINER runs with the function-owner's privileges and bypasses
-- RLS for the inner SELECT, breaking the recursion cycle. Same pattern as
-- `is_super_admin_bypass()` introduced in migration 1.
--
-- The feedback/announcements policies also query user_departments via EXISTS,
-- but from a different table — no recursion there. They keep working once
-- the user_departments policies are fixed (their inner SELECT then evaluates
-- user_departments' now-non-recursive policies cleanly).
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: SECURITY DEFINER → bypasses RLS, so the inner lookup against
-- user_departments doesn't re-enter its own policies.
--
-- STABLE so the planner can call once per query rather than per row.
-- search_path pinned to public to defuse the "definer-function search-path
-- hijack" attack class.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.is_director_in_department(target_dept_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_departments
    where user_id = auth.uid()
      and department_id = target_dept_id
      and role = 'director'
  );
$$;

grant execute on function public.is_director_in_department(text)
  to anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Replace the four recursive director policies on user_departments.
-- DROP-then-CREATE because CREATE POLICY is not idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "directors see dept assignments" on public.user_departments;
create policy "directors see dept assignments" on public.user_departments
  for select
  using (public.is_director_in_department(department_id));

drop policy if exists "directors grant in own dept" on public.user_departments;
create policy "directors grant in own dept" on public.user_departments
  for insert
  with check (
    public.is_director_in_department(department_id)
    or public.is_super_admin_bypass()
  );

drop policy if exists "directors revoke in own dept" on public.user_departments;
create policy "directors revoke in own dept" on public.user_departments
  for delete
  using (
    public.is_director_in_department(department_id)
    or public.is_super_admin_bypass()
  );

drop policy if exists "directors update in own dept" on public.user_departments;
create policy "directors update in own dept" on public.user_departments
  for update
  using (
    public.is_director_in_department(department_id)
    or public.is_super_admin_bypass()
  );
