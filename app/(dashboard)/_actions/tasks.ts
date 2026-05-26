"use server";

/**
 * Dashboard-native task actions (assignment + completion + reports list +
 * notification helpers). Distinct from _actions/google.ts which wraps the
 * Google Tasks API.
 *
 * RLS does the heavy lifting — every read/write uses the user's own
 * Supabase session via createSupabaseServerClient. Trigger
 * `tasks_notify_assigner_on_done` writes the notification row when an
 * assigned task flips done.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/user-context";

export interface ReportSummary {
  userId: string;
  displayName: string | null;
  email: string | null;
  rank: string | null;
}

export interface AssignedTaskRow {
  id: string;
  text: string;
  due_date: string | null;
  done: boolean;
  assigned_by: string | null;
  assigner_name: string | null;
  user_id: string;
  assignee_name: string | null;
  created_at: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Reports — for the assign-task picker
// ──────────────────────────────────────────────────────────────────────────

export async function fetchMyReports(): Promise<ReportSummary[]> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return [];

  const supabase = createSupabaseServerClient();
  // Direct reports = users whose reporting_to_user_id is me, and whose
  // reporting line is still effective today.
  const { data: lines, error } = await supabase
    .from("user_reporting_line")
    .select("user_id, rank")
    .eq("reporting_to_user_id", ctx.userId);

  if (error) {
    console.error("[tasks/reports] line fetch failed:", error.message);
    return [];
  }
  if (!lines || lines.length === 0) return [];

  const userIds = lines.map((l) => l.user_id);
  const { data: profiles, error: profErr } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, email")
    .in("user_id", userIds);

  if (profErr) {
    console.error("[tasks/reports] profile fetch failed:", profErr.message);
    return [];
  }

  const profById = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  return lines.map((l) => {
    const p = profById.get(l.user_id);
    return {
      userId: l.user_id,
      displayName: p?.display_name ?? null,
      email: p?.email ?? null,
      rank: l.rank ?? null,
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Assigned tasks — shown in the "Assigned" tab of the Tasks widget
// ──────────────────────────────────────────────────────────────────────────

export async function fetchAssignedToMe(): Promise<AssignedTaskRow[]> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return [];

  const supabase = createSupabaseServerClient();
  // Tasks where I'm the user AND someone else assigned them, still open.
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      id, text, due_date, done, assigned_by, user_id, created_at,
      assigner:assigned_by(display_name),
      assignee:user_id(display_name)
    `,
    )
    .eq("user_id", ctx.userId)
    .not("assigned_by", "is", null)
    .eq("done", false)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[tasks/assigned-to-me] fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    text: row.text,
    due_date: row.due_date,
    done: row.done,
    assigned_by: row.assigned_by,
    // PostgREST relationship sub-selects come back as objects keyed by alias.
    assigner_name:
      (row as { assigner?: { display_name?: string | null } }).assigner
        ?.display_name ?? null,
    user_id: row.user_id,
    assignee_name:
      (row as { assignee?: { display_name?: string | null } }).assignee
        ?.display_name ?? null,
    created_at: row.created_at,
  }));
}

export async function fetchIAssigned(): Promise<AssignedTaskRow[]> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return [];

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      `
      id, text, due_date, done, assigned_by, user_id, created_at,
      assigner:assigned_by(display_name),
      assignee:user_id(display_name)
    `,
    )
    .eq("assigned_by", ctx.userId)
    .neq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[tasks/i-assigned] fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    text: row.text,
    due_date: row.due_date,
    done: row.done,
    assigned_by: row.assigned_by,
    assigner_name:
      (row as { assigner?: { display_name?: string | null } }).assigner
        ?.display_name ?? null,
    user_id: row.user_id,
    assignee_name:
      (row as { assignee?: { display_name?: string | null } }).assignee
        ?.display_name ?? null,
    created_at: row.created_at,
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Create / complete
// ──────────────────────────────────────────────────────────────────────────

export async function assignTask(input: {
  assigneeId: string;
  text: string;
  dueDate?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return { ok: false, error: "Not signed in." };
  if (!input.text.trim()) return { ok: false, error: "Task text is required." };

  const supabase = createSupabaseServerClient();

  // Get assignee's primary_company so the task row satisfies the NOT-NULL
  // company constraint without the assigner needing to pick one.
  const { data: assigneeProfile } = await supabase
    .from("user_profiles")
    .select("primary_company")
    .eq("user_id", input.assigneeId)
    .maybeSingle();

  const company =
    assigneeProfile?.primary_company ??
    (await supabase
      .from("user_profiles")
      .select("primary_company")
      .eq("user_id", ctx.userId)
      .maybeSingle()).data?.primary_company ??
    "holdco";

  const { error } = await supabase.from("tasks").insert({
    user_id: input.assigneeId,
    assigned_by: ctx.userId,
    company,
    text: input.text.trim(),
    done: false,
    due_date: input.dueDate ?? null,
  });

  if (error) {
    console.error("[tasks/assign] insert failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function completeDashboardTask(
  taskId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return { ok: false, error: "Not signed in." };

  const supabase = createSupabaseServerClient();
  // RLS lets either the assignee (user_id = auth.uid()) or the assigner
  // (assigned_by = auth.uid()) update; trigger fires the notification.
  const { error } = await supabase
    .from("tasks")
    .update({ done: true })
    .eq("id", taskId);

  if (error) {
    console.error("[tasks/complete] update failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Notifications — read count for the header bell + mark-as-read
// ──────────────────────────────────────────────────────────────────────────

export async function fetchUnreadNotificationCount(): Promise<number> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return 0;

  const supabase = createSupabaseServerClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    console.error("[notifications/count] failed:", error.message);
    return 0;
  }
  return count ?? 0;
}
