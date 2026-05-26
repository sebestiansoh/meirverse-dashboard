/**
 * Thin Google API wrappers for Phase 2.4 dashboard widgets.
 *
 *   listTasks            → google tasks (default list, incomplete only)
 *   listUpcomingEvents   → google calendar (primary, next N events)
 *   listRecentDriveFiles → google drive (modified-desc, top N)
 *
 * Each call refreshes the user's access token via
 * lib/google/refresh-access-token.ts, then hits the relevant Google API
 * endpoint with `Authorization: Bearer …`. Returns typed payloads
 * shaped for the widgets (not the full Google response).
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
}

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

const TASKS_URL =
  "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=false&maxResults=15";

export async function listTasks(userId: string): Promise<TaskItem[] | null> {
  const data = (await authedFetch(userId, TASKS_URL)) as
    | { items?: Array<{ id: string; title: string; due?: string; notes?: string }> }
    | null;
  if (!data) return null;
  return (data.items ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    due: t.due,
    notes: t.notes,
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Calendar
// ──────────────────────────────────────────────────────────────────────────

export async function listUpcomingEvents(
  userId: string,
): Promise<CalendarEvent[] | null> {
  const now = new Date().toISOString();
  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  url.searchParams.set("timeMin", now);
  url.searchParams.set("maxResults", "10");
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

export async function listRecentDriveFiles(
  userId: string,
): Promise<DriveFile[] | null> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("pageSize", "10");
  url.searchParams.set(
    "fields",
    "files(id,name,mimeType,modifiedTime,webViewLink)",
  );
  // Exclude trashed + Google-internal types where it makes sense.
  url.searchParams.set(
    "q",
    "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
  );

  const data = (await authedFetch(userId, url.toString())) as
    | { files?: DriveFile[] }
    | null;
  if (!data) return null;
  return data.files ?? [];
}
