"use server";

/**
 * Server actions for the Phase 2.6 Microsoft 365 widgets. Mirror of
 * _actions/google.ts for the Microsoft Graph integrations:
 *   - Outlook Calendar (variant: today / thisWeek / nextWeek)
 *   - Microsoft To Do (lists + tasks in a list)
 *   - OneDrive (variant: recent / myDrive / shared)
 *
 * All actions read getCurrentUserContext() — if the user isn't signed
 * in we return null and the widget falls back to its connect/empty UX.
 */

import { getCurrentUserContext } from "@/lib/auth/user-context";
import {
  listOutlookEvents,
  listTodoLists,
  listTodoTasksInList,
  listOneDriveFiles,
  type OutlookEvent,
  type MsTodoList,
  type MsTodoTask,
  type OneDriveFile,
  type OutlookCalendarVariant,
  type OneDriveVariant,
} from "@/lib/microsoft/api";

export async function fetchMyOutlookEvents(
  variant: OutlookCalendarVariant = "today",
): Promise<OutlookEvent[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listOutlookEvents(ctx.userId, variant);
}

export async function fetchMyTodoLists(): Promise<MsTodoList[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listTodoLists(ctx.userId);
}

export async function fetchMyTodoTasksInList(
  listId: string,
): Promise<MsTodoTask[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listTodoTasksInList(ctx.userId, listId);
}

export async function fetchMyOneDriveFiles(
  variant: OneDriveVariant = "recent",
): Promise<OneDriveFile[] | null> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;
  return listOneDriveFiles(ctx.userId, variant);
}
