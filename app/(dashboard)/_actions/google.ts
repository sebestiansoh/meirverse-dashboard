"use server";

/**
 * Server actions for the Phase 2.4 dashboard widgets.
 *
 * Each widget calls the matching action on mount + on a 60s interval +
 * on tab change. Server-side authenticates via getCurrentUserContext,
 * then delegates to the typed wrappers in lib/google/api.ts.
 */

import { getCurrentUserContext } from "@/lib/auth/user-context";
import {
  listTasks,
  listUpcomingEvents,
  listDriveFiles,
  type TaskItem,
  type CalendarEvent,
  type DriveFile,
  type TasksVariant,
  type CalendarVariant,
  type DriveVariant,
} from "@/lib/google/api";

export async function fetchMyTasks(
  variant: TasksVariant = "current",
): Promise<TaskItem[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listTasks(ctx.userId, variant);
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

// Back-compat — kept so existing imports keep working through the deploy.
export const fetchMyRecentFiles = () => fetchMyDriveFiles("recent");
