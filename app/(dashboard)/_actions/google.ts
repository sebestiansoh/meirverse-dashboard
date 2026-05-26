"use server";

/**
 * Server actions for the Phase 2.4 dashboard widgets.
 *
 * Each action authenticates the caller via getCurrentUserContext, then
 * delegates to the Google API wrappers in lib/google/api.ts. Returns
 * typed payloads or null on error — widgets handle null gracefully.
 *
 * Why server actions instead of API routes: we want React Server
 * Component-friendly call sites + automatic typing across the boundary.
 * Each widget calls the matching action on mount + on a 60s interval.
 */

import { getCurrentUserContext } from "@/lib/auth/user-context";
import {
  listTasks,
  listUpcomingEvents,
  listRecentDriveFiles,
  type TaskItem,
  type CalendarEvent,
  type DriveFile,
} from "@/lib/google/api";

export async function fetchMyTasks(): Promise<TaskItem[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listTasks(ctx.userId);
}

export async function fetchMyUpcomingEvents(): Promise<CalendarEvent[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listUpcomingEvents(ctx.userId);
}

export async function fetchMyRecentFiles(): Promise<DriveFile[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listRecentDriveFiles(ctx.userId);
}
