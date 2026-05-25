-- ============================================================================
-- 20260525100400_rls_policies.sql
-- ============================================================================
-- Row-level security policies for every primary table in the Internal DB.
--
-- Policy structure — uniform across all tables:
--
--   SELECT:
--     • Super Admin sees everything (is_super_admin() = true), OR
--     • User has has_access(module, 'view', row.company)
--
--   INSERT / UPDATE / DELETE:
--     • Super Admin can do anything, OR
--     • User has has_access(module, 'write', row.company)
--       (approve actions go through write paths with extra app-layer checks)
--
-- The helper functions is_super_admin() and has_access(module, action,
-- company) are defined in 20260525100030_user_access_matrix.sql.
--
-- These policies REPLACE the recursive RLS approach of the deprecated
-- Department × Role model — no self-joins to user_departments, no
-- circular reads. has_access() short-circuits on Super Admin and on
-- NULL-company (cross-org) grants.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- user_profiles · user can see their own, Super Admin sees all
-- ─────────────────────────────────────────────────────────────────────────────

create policy "user_profiles select own or super-admin"
  on public.user_profiles for select
  using (user_id = auth.uid() or public.is_super_admin());

create policy "user_profiles update own metadata"
  on public.user_profiles for update
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- user_access · users see their own grants, admins manage
-- ─────────────────────────────────────────────────────────────────────────────

create policy "user_access select own or super-admin"
  on public.user_access for select
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.has_access('admin', 'view', company)
  );

create policy "user_access write super-admin or admin-grant"
  on public.user_access for all
  using (
    public.is_super_admin()
    or public.has_access('admin', 'write', company)
  )
  with check (
    public.is_super_admin()
    or public.has_access('admin', 'write', company)
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- user_reporting_line · users see their own line + chain, admins manage
-- ─────────────────────────────────────────────────────────────────────────────

create policy "user_reporting_line select own or super-admin"
  on public.user_reporting_line for select
  using (
    user_id = auth.uid()
    or reporting_to_user_id = auth.uid()       -- managers see direct reports
    or public.is_super_admin()
    or public.has_access('hr', 'view', null)   -- HR with cross-org grant
  );

create policy "user_reporting_line write super-admin or hr-admin"
  on public.user_reporting_line for all
  using (public.is_super_admin() or public.has_access('hr', 'write', null))
  with check (public.is_super_admin() or public.has_access('hr', 'write', null));


-- ─────────────────────────────────────────────────────────────────────────────
-- Dashboard surface tables (public.*)
-- ─────────────────────────────────────────────────────────────────────────────

-- tasks · user sees own; Super Admin sees all
create policy "tasks select own"
  on public.tasks for select
  using (user_id = auth.uid() or public.is_super_admin());

create policy "tasks write own"
  on public.tasks for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- notes · same pattern (encrypted, but RLS still gates access)
create policy "notes select own"
  on public.notes for select
  using (user_id = auth.uid() or public.is_super_admin());

create policy "notes write own"
  on public.notes for all
  using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());

-- quick_launch · own tiles + shared-with-team within same company
create policy "quick_launch select own or shared"
  on public.quick_launch for select
  using (
    owner_user_id = auth.uid()
    or public.is_super_admin()
    or (
      shared_with_team
      and public.has_access('dashboard', 'view', company)
    )
  );

create policy "quick_launch write own"
  on public.quick_launch for all
  using (owner_user_id = auth.uid() or public.is_super_admin())
  with check (owner_user_id = auth.uid() or public.is_super_admin());

-- announcements · readable by users with dashboard:view in matching company OR holdco
create policy "announcements select by company"
  on public.announcements for select
  using (
    public.is_super_admin()
    or company = 'holdco'      -- holdco announcements visible to everyone authenticated
    or public.has_access('dashboard', 'view', company)
  );

create policy "announcements write by dashboard-admin"
  on public.announcements for all
  using (
    public.is_super_admin()
    or public.has_access('dashboard', 'write', company)
  )
  with check (
    public.is_super_admin()
    or public.has_access('dashboard', 'write', company)
  );

-- feedback · submitter sees own; Org Admin / dashboard-admin sees scoped
create policy "feedback select own or admin"
  on public.feedback for select
  using (
    submitter_user_id = auth.uid()
    or public.is_super_admin()
    or public.has_access('dashboard', 'view', company)
  );

create policy "feedback insert any authenticated"
  on public.feedback for insert
  with check (auth.role() = 'authenticated');

create policy "feedback update admin-only"
  on public.feedback for update
  using (public.is_super_admin() or public.has_access('dashboard', 'write', company))
  with check (public.is_super_admin() or public.has_access('dashboard', 'write', company));

-- sso_issuances · user sees own, Super Admin audits all
create policy "sso_issuances select own or super-admin"
  on public.sso_issuances for select
  using (user_id = auth.uid() or public.is_super_admin());

create policy "sso_issuances insert service-role only"
  on public.sso_issuances for insert
  with check (false);   -- service role bypasses RLS; clients cannot insert


-- ─────────────────────────────────────────────────────────────────────────────
-- ERP surface tables (erp.*)
-- ─────────────────────────────────────────────────────────────────────────────

-- erp.projects · view by company; write requires erp:write in that company
create policy "erp_projects select by company"
  on erp.projects for select
  using (public.is_super_admin() or public.has_access('erp', 'view', company));

create policy "erp_projects write by company"
  on erp.projects for all
  using (public.is_super_admin() or public.has_access('erp', 'write', company))
  with check (public.is_super_admin() or public.has_access('erp', 'write', company));

-- erp.project_members · same as parent projects (joined via project_id)
create policy "erp_project_members select via project"
  on erp.project_members for select
  using (
    public.is_super_admin()
    or exists (
      select 1 from erp.projects p
      where p.id = project_id
        and public.has_access('erp', 'view', p.company)
    )
  );

create policy "erp_project_members write via project"
  on erp.project_members for all
  using (
    public.is_super_admin()
    or exists (
      select 1 from erp.projects p
      where p.id = project_id
        and public.has_access('erp', 'write', p.company)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from erp.projects p
      where p.id = project_id
        and public.has_access('erp', 'write', p.company)
    )
  );

-- erp.project_locations · same join pattern
create policy "erp_project_locations select via project"
  on erp.project_locations for select
  using (
    public.is_super_admin()
    or exists (
      select 1 from erp.projects p
      where p.id = project_id
        and public.has_access('erp', 'view', p.company)
    )
  );

create policy "erp_project_locations write via project"
  on erp.project_locations for all
  using (
    public.is_super_admin()
    or exists (
      select 1 from erp.projects p
      where p.id = project_id
        and public.has_access('erp', 'write', p.company)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from erp.projects p
      where p.id = project_id
        and public.has_access('erp', 'write', p.company)
    )
  );

-- erp.items · own-company match via denormalised company column
create policy "erp_items select by company"
  on erp.items for select
  using (public.is_super_admin() or public.has_access('erp', 'view', company));

create policy "erp_items write by company"
  on erp.items for all
  using (public.is_super_admin() or public.has_access('erp', 'write', company))
  with check (public.is_super_admin() or public.has_access('erp', 'write', company));

-- erp.item_photos · via items
create policy "erp_item_photos select via item"
  on erp.item_photos for select
  using (
    public.is_super_admin()
    or exists (
      select 1 from erp.items i
      where i.id = item_id
        and public.has_access('erp', 'view', i.company)
    )
  );

create policy "erp_item_photos write via item"
  on erp.item_photos for all
  using (
    public.is_super_admin()
    or exists (
      select 1 from erp.items i
      where i.id = item_id
        and public.has_access('erp', 'write', i.company)
    )
  )
  with check (
    public.is_super_admin()
    or exists (
      select 1 from erp.items i
      where i.id = item_id
        and public.has_access('erp', 'write', i.company)
    )
  );

-- Remaining ERP primary tables — same shape (own-company match).
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'progress_reports', 'wip_assessments', 'payment_certs', 'subcon_claims',
    'oop_claims', 'master_programmes', 'suggestions', 'notifications',
    'audit_log', 'claim_counters'
  ])
  loop
    execute format(
      'create policy %I on erp.%I for select using (public.is_super_admin() or public.has_access(''erp'', ''view'', company))',
      'erp_' || tbl || ' select by company', tbl
    );
    execute format(
      'create policy %I on erp.%I for all using (public.is_super_admin() or public.has_access(''erp'', ''write'', company)) with check (public.is_super_admin() or public.has_access(''erp'', ''write'', company))',
      'erp_' || tbl || ' write by company', tbl
    );
  end loop;
end$$;

-- erp.taxonomies · readable by anyone with erp:view in any company; writable by Super Admin
create policy "erp_taxonomies select all-erp-users"
  on erp.taxonomies for select
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.user_access ua
      where ua.user_id = auth.uid()
        and ua.module_id = 'erp'
    )
  );

create policy "erp_taxonomies write super-admin"
  on erp.taxonomies for all
  using (public.is_super_admin())
  with check (public.is_super_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- HR surface tables (hr.*)
-- ─────────────────────────────────────────────────────────────────────────────

-- hr.employees · employee sees own record; HR admins see by company
create policy "hr_employees select own or hr-admin"
  on hr.employees for select
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.has_access('hr', 'view', company)
  );

create policy "hr_employees write hr-admin"
  on hr.employees for all
  using (public.is_super_admin() or public.has_access('hr', 'write', company))
  with check (public.is_super_admin() or public.has_access('hr', 'write', company));

-- hr.leave_balances · same pattern
create policy "hr_leave_balances select own or hr-admin"
  on hr.leave_balances for select
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.has_access('hr', 'view', company)
  );

create policy "hr_leave_balances write hr-admin"
  on hr.leave_balances for all
  using (public.is_super_admin() or public.has_access('hr', 'write', company))
  with check (public.is_super_admin() or public.has_access('hr', 'write', company));

-- hr.leave_requests · submitter sees own + drafts + approvers see assigned
create policy "hr_leave_requests select own or hr-admin"
  on hr.leave_requests for select
  using (
    user_id = auth.uid()
    or decided_by_user_id = auth.uid()
    or public.is_super_admin()
    or public.has_access('hr', 'view', company)
  );

create policy "hr_leave_requests insert own"
  on hr.leave_requests for insert
  with check (user_id = auth.uid() or public.is_super_admin() or public.has_access('hr', 'write', company));

create policy "hr_leave_requests update workflow"
  on hr.leave_requests for update
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.has_access('hr', 'approve', company)
    or public.has_access('hr', 'write', company)
  )
  with check (
    user_id = auth.uid()
    or public.is_super_admin()
    or public.has_access('hr', 'approve', company)
    or public.has_access('hr', 'write', company)
  );

-- hr.employee_documents · access driven by sensitivity tag + company
create policy "hr_employee_documents select by sensitivity"
  on hr.employee_documents for select
  using (
    public.is_super_admin()
    or (sensitivity = 'public' and public.has_access('hr', 'view', company))
    or (sensitivity = 'employee-only' and (
      user_id = auth.uid()
      or public.has_access('hr', 'view', company)
    ))
    or (sensitivity = 'restricted' and public.has_access('hr', 'write', company))
    -- 'confidential' = Super Admin only, handled by the leading is_super_admin() branch
  );

create policy "hr_employee_documents write hr-admin"
  on hr.employee_documents for all
  using (public.is_super_admin() or public.has_access('hr', 'write', company))
  with check (public.is_super_admin() or public.has_access('hr', 'write', company));


-- ─────────────────────────────────────────────────────────────────────────────
-- Sync infrastructure (Phase 2) — Super Admin only until activated
-- ─────────────────────────────────────────────────────────────────────────────

create policy "sync_outbound_events super-admin only"
  on public.sync_outbound_events for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy "sync_inbound_events super-admin only"
  on public.sync_inbound_events for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

comment on policy "sync_outbound_events super-admin only" on public.sync_outbound_events is
  'Phase 2 only. Service-role bypasses RLS for the drainer; in normal app paths the sync tables stay locked.';
