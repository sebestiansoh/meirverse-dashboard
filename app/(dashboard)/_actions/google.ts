"use server";

/**
 * Server actions for the Phase 2.4 dashboard widgets (Google APIs side).
 * Dashboard-native task assignment lives in _actions/tasks.ts.
 */

import { getCurrentUserContext } from "@/lib/auth/user-context";
import {
  listTaskLists,
  listTasksInList,
  completeGoogleTask,
  listUpcomingEvents,
  listDriveFiles,
  type TaskList,
  type TaskItem,
  type CalendarEvent,
  type DriveFile,
  type CalendarVariant,
  type DriveVariant,
} from "@/lib/google/api";

export async function fetchMyTaskLists(): Promise<TaskList[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listTaskLists(ctx.userId);
}

export async function fetchMyTasksInList(
  listId: string,
): Promise<TaskItem[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listTasksInList(ctx.userId, listId);
}

export async function markGoogleTaskDone(
  listId: string,
  taskId: string,
): Promise<{ ok: boolean }> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return { ok: false };
  const ok = await completeGoogleTask(ctx.userId, listId, taskId);
  return { ok };
}

export async function fetchMyUpcomingEvents(
  variant: CalendarVariant = "today",
): Promise<CalendarEvent[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listUpcomingEvents(ctx.userId, variant);
}

export async function fetchMyDriveFiles(
  variant: DriveVariant = "recent",
): Promise<DriveFile[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listDriveFiles(ctx.userId, variant);
}
