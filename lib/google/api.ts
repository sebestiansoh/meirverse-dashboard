/**
 * Thin Google API wrappers for Phase 2.4 dashboard widgets.
 *
 * Tasks  — list user's task LISTS + tasks in a list + mark complete
 * Calendar — list events in a time window (today / this week / next week)
 * Drive    — list files filtered by source (recent / my drive / shared)
 *
 * Errors return null + console.error; widgets render a graceful state.
 */

import { getGoogleAccessToken } from "./refresh-access-token";

export interface TaskList {
  id: string;
  title: string;
}

export interface TaskItem {
  id: string;
  listId: string; // we tag this on the way out so the widget can call complete()
  title: string;
  due?: string;
  notes?: string;
  completed?: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  hangoutLink?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  ownedByMe?: boolean;
}

export type CalendarVariant = "today" | "thisWeek" | "nextWeek";
export type DriveVariant = "recent" | "myDrive" | "sharedDrives";

async function authedFetch(
  userId: string,
  url: string,
  init?: RequestInit,
): Promise<unknown | null> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) return null;

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    console.error(
      `[google/api] ${res.status} ${init?.method ?? "GET"} ${url} — ${body.slice(0, 200)}`,
    );
    return null;
  }
  if (res.status === 204) return {};
  return res.json();
}

// ──────────────────────────────────────────────────────────────────────────
// Tasks
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fetch the user's Google Tasks LISTS (e.g. "My Tasks", "Work", "Personal").
 * One of them is always the default (`@default` alias resolves to its id).
 */
export async function listTaskLists(userId: string): Promise<TaskList[] | null> {
  const data = (await authedFetch(
    userId,
    "https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100",
  )) as { items?: Array<{ id: string; title: string }> } | null;
  if (!data) return null;
  return (data.items ?? []).map((l) => ({ id: l.id, title: l.title }));
}

/**
 * Incomplete tasks in a specific list, ordered by Google's default (position).
 */
export async function listTasksInList(
  userId: string,
  listId: string,
): Promise<TaskItem[] | null> {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?showCompleted=false&maxResults=50`;
  const data = (await authedFetch(userId, url)) as
    | {
        items?: Array<{
          id: string;
          title: string;
          due?: string;
          notes?: string;
          completed?: string;
        }>;
      }
    | null;
  if (!data) return null;
  return (data.items ?? []).map((t) => ({
    id: t.id,
    listId,
    title: t.title,
    due: t.due,
    notes: t.notes,
    completed: t.completed,
  }));
}

/**
 * Mark a Google Task complete. PATCH with status='completed' + a completion
 * timestamp. Google clears the task from the showCompleted=false list.
 */
export async function completeGoogleTask(
  userId: string,
  listId: string,
  taskId: string,
): Promise<boolean> {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`;
  const result = await authedFetch(userId, url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "completed",
      completed: new Date().toISOString(),
    }),
  });
  return result !== null;
}

// ──────────────────────────────────────────────────────────────────────────
// Calendar
// ──────────────────────────────────────────────────────────────────────────

function calendarRange(variant: CalendarVariant): {
  timeMin: string;
  timeMax: string;
} {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  if (variant === "today") {
    const SGT = 8 * 60 * 60 * 1000;
    const sgNow = new Date(now.getTime() + SGT);
    const sgEnd = new Date(sgNow);
    sgEnd.setUTCHours(23, 59, 59, 999);
    return {
      timeMin: now.toISOString(),
      timeMax: new Date(sgEnd.getTime() - SGT).toISOString(),
    };
  }
  if (variant === "thisWeek") {
    return {
      timeMin: now.toISOString(),
      timeMax: new Date(now.getTime() + 7 * day).toISOString(),
    };
  }
  return {
    timeMin: new Date(now.getTime() + 7 * day).toISOString(),
    timeMax: new Date(now.getTime() + 14 * day).toISOString(),
  };
}

export async function listUpcomingEvents(
  userId: string,
  variant: CalendarVariant = "today",
): Promise<CalendarEvent[] | null> {
  const range = calendarRange(variant);
  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  url.searchParams.set("timeMin", range.timeMin);
  url.searchParams.set("timeMax", range.timeMax);
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  const data = (await authedFetch(userId, url.toString())) as
    | {
        items?: Array<{
          id: string;
          summary?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
          location?: string;
          hangoutLink?: string;
        }>;
      }
    | null;
  if (!data) return null;

  return (data.items ?? [])
    .filter((e) => e.start?.dateTime || e.start?.date)
    .map((e) => ({
      id: e.id,
      summary: e.summary ?? "(no title)",
      start: (e.start?.dateTime ?? e.start?.date)!,
      end: (e.end?.dateTime ?? e.end?.date)!,
      location: e.location,
      hangoutLink: e.hangoutLink,
    }));
}

// ──────────────────────────────────────────────────────────────────────────
// Drive
// ──────────────────────────────────────────────────────────────────────────

export async function listDriveFiles(
  userId: string,
  variant: DriveVariant = "recent",
): Promise<DriveFile[] | null> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("pageSize", "20");
  url.searchParams.set(
    "fields",
    "files(id,name,mimeType,modifiedTime,webViewLink,ownedByMe)",
  );

  const qParts: string[] = [
    "trashed = false",
    "mimeType != 'application/vnd.google-apps.folder'",
  ];

  if (variant === "recent") {
    url.searchParams.set("corpora", "allDrives");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives", "true");
  } else if (variant === "myDrive") {
    qParts.push("'me' in owners");
  } else {
    url.searchParams.set("corpora", "allDrives");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("supportsAllDrives", "true");
    qParts.push("not 'me' in owners");
  }

  url.searchParams.set("q", qParts.join(" and "));

  const data = (await authedFetch(userId, url.toString())) as
    | { files?: DriveFile[] }
    | null;
  if (!data) return null;
  return data.files ?? [];
}

// Back-compat alias used by anything that imported the old name.
export const listRecentDriveFiles = (userId: string) =>
  listDriveFiles(userId, "recent");
