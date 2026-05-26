-- ============================================================================
-- 20260527100010_tasks_assignment_and_notifications.sql
-- ============================================================================
-- Phase 2.6 increment requested 2026-05-27:
--   1. Direct Reporting Officers (DROs) can assign tasks to their reports
--   2. Tasks have a tick-box to mark done
--   3. When an assigned task is marked done, the DRO is notified
--
-- Adds:
--   public.tasks.assigned_by  — the DRO who assigned the task. NULL for
--                                self-assigned tasks (the existing default).
--   public.notifications      — minimal in-app notifications table. First
--                                use is `task_completed`.
--   trigger on public.tasks   — when `done` flips false→true on a row with
--                                non-null `assigned_by`, writes a row to
--                                public.notifications for the assigner.
--
-- RLS:
--   - public.tasks: existing own-row access expanded to also grant the
--     assigner read+write on rows they assigned.
--   - public.notifications: own-row read + own-row update-to-mark-read.
--     Inserts only via the trigger (which runs SECURITY DEFINER).
--
-- Per Mandate §Access control: the rank label in user_reporting_line is
-- organisational metadata only. This migration does NOT grant access by
-- rank — only by the explicit (user_id, reporting_to_user_id) relation.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. tasks.assigned_by + tightened RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tasks
  add column if not exists assigned_by uuid references auth.users(id);

comment on column public.tasks.assigned_by is
  'The Direct Reporting Officer who assigned this task. NULL = self-assigned. Drives the on-done notification trigger.';

create index if not exists tasks_assigned_by_idx
  on public.tasks(assigned_by) where assigned_by is not null;

-- Replace the old policies. The original RLS in 100400 likely had
-- "own tasks" only — we expand to cover the assigner.

drop policy if exists "tasks select own"               on public.tasks;
drop policy if exists "tasks write own"                on public.tasks;
drop policy if exists "tasks select own or assigned"   on public.tasks;
drop policy if exists "tasks insert own or assigning"  on public.tasks;
drop policy if exists "tasks update own or assigning"  on public.tasks;
drop policy if exists "tasks delete own or assigning"  on public.tasks;

create policy "tasks select own or assigned" on public.tasks
  for select
  using (
    auth.uid() = user_id
    or auth.uid() = assigned_by
    or public.is_super_admin()
  );

create policy "tasks insert own or assigning" on public.tasks
  for insert
  with check (
    -- Self-assigned: user creates a task for themselves.
    (auth.uid() = user_id and assigned_by is null)
    -- DRO-assigned: assigner = me, and the assignee must actually report to me.
    or (
      auth.uid() = assigned_by
      and exists (
        select 1
        from public.user_reporting_line url
        where url.user_id = public.tasks.user_id
          and url.reporting_to_user_id = auth.uid()
          and (url.effective_to is null or url.effective_to >= current_date)
      )
    )
    or public.is_super_admin()
  );

create policy "tasks update own or assigning" on public.tasks
  for update
  using (
    auth.uid() = user_id
    or auth.uid() = assigned_by
    or public.is_super_admin()
  )
  with check (
    auth.uid() = user_id
    or auth.uid() = assigned_by
    or public.is_super_admin()
  );

create policy "tasks delete own or assigning" on public.tasks
  for delete
  using (
    auth.uid() = user_id
    or auth.uid() = assigned_by
    or public.is_super_admin()
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. notifications table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  -- Recipient. Notifications are point-to-point, not broadcast (those
  -- live in public.announcements).
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Discriminator for the payload shape. v1 has only 'task_completed';
  -- future: 'task_assigned', 'mention', 'approval_required', etc.
  kind        text not null,
  payload     jsonb not null default '{}'::jsonb,
  -- NULL = unread. Updated to timestamp when the user marks read.
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

comment on table public.notifications is
  'In-app notifications. v1 emits on task completion (assigner notified). v2 will add task_assigned, mentions, etc.';

create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications select own"                  on public.notifications;
drop policy if exists "notifications update own to mark read"     on public.notifications;

create policy "notifications select own" on public.notifications
  for select
  using (auth.uid() = user_id or public.is_super_admin());

create policy "notifications update own to mark read" on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- No client INSERT/DELETE. The trigger below writes via SECURITY DEFINER;
-- the service-role client (for any future admin paths) bypasses RLS.


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger: notify the assigner when their assignee marks done
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.notify_assigner_on_task_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.done = true
     and (OLD.done is null or OLD.done = false)
     and NEW.assigned_by is not null
     and NEW.assigned_by <> NEW.user_id
  then
    insert into public.notifications (user_id, kind, payload)
    values (
      NEW.assigned_by,
      'task_completed',
      jsonb_build_object(
        'task_id',     NEW.id,
        'task_text',   NEW.text,
        'assignee_id', NEW.user_id,
        'completed_at', now()
      )
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists tasks_notify_assigner_on_done on public.tasks;
create trigger tasks_notify_assigner_on_done
  after update on public.tasks
  for each row
  execute function public.notify_assigner_on_task_done();
