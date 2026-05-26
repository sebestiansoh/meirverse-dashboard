/**
 * Thin Google API wrappers for Phase 2.4 dashboard widgets.
 *
 * Each function takes a variant string so the widget can offer tab
 * filters (current / today / done · today / thisWeek / nextWeek ·
 * recent / myDrive / sharedDrives). The shape returned is identical
 * across variants — the widget just renders the items.
 *
 * Errors surface as `null` data + console.error — the widget renders a
 * "couldn't load" message and lets the user retry. We do NOT throw out
 * to the page; one widget breaking shouldn't break the whole dashboard.
 */

import { getGoogleAccessToken } from "./refresh-access-token";

export interface TaskItem {
  id: string;
  title: string;
  due?: string; // ISO timestamp or undefined
  notes?: string;
  completed?: string; // ISO when completed (only set for 'done' variant)
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string; // ISO timestamp
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

export type TasksVariant = "current" | "today" | "done";
export type CalendarVariant = "today" | "thisWeek" | "nextWeek";
export type DriveVariant = "recent" | "myDrive" | "sharedDrives";

async function authedFetch(
  userId: string,
  url: string,
): Promise<unknown | null> {
  const accessToken = await getGoogleAccessToken(userId);
  if (!accessToken) return null;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    console.error(
      `[google/api] ${res.status} ${url} — ${body.slice(0, 200)}`,
    );
    return null;
  }
  return res.json();
}

// ──────────────────────────────────────────────────────────────────────────
// Tasks
// ──────────────────────────────────────────────────────────────────────────

const TASKS_ROOT =
  "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks";

function isSameSgDay(iso: string, ref: Date): boolean {
  // Singapore is UTC+8, no DST.
  const SGT = 8 * 60 * 60 * 1000;
  const a = new Date(new Date(iso).getTime() + SGT);
  const b = new Date(ref.getTime() + SGT);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export async function listTasks(
  userId: string,
  variant: TasksVariant = "current",
): Promise<TaskItem[] | null> {
  const params = new URLSearchParams();
  params.set("maxResults", "50");

  if (variant === "done") {
    // Completed in the last 7 days.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    params.set("showCompleted", "true");
    params.set("showHidden", "true");
    params.set("completedMin", since.toISOString());
  } else {
    // 'current' + 'today' — incomplete only.
    params.set("showCompleted", "false");
  }

  const data = (await authedFetch(
    userId,
    `${TASKS_ROOT}?${params.toString()}`,
  )) as
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

  let items = (data.items ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    due: t.due,
    notes: t.notes,
    completed: t.completed,
  }));

  if (variant === "today") {
    const now = new Date();
    items = items.filter((t) => t.due && isSameSgDay(t.due, now));
  } else if (variant === "done") {
    // Sort done items by most-recently-completed first.
    items.sort((a, b) => (b.completed ?? "").localeCompare(a.completed ?? ""));
  }

  return items;
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
    // End of today in Singapore (UTC+8).
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
  // nextWeek
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
    // corpora=user (default) — only user's own Drive files.
    qParts.push("'me' in owners");
  } else {
    // sharedDrives — includes team-drive files + files shared with the user.
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

// Back-compat alias so older callers don't break during transition.
export const listRecentDriveFiles = (userId: string) =>
  listDriveFiles(userId, "recent");
