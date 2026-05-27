/**
 * Thin Microsoft Graph API wrappers for the Phase 2.6 widgets.
 *
 * Outlook Calendar — list events in a time window (today / this week / next week)
 * Microsoft To Do  — list user's task LISTS + open tasks in a list
 * OneDrive         — list files filtered by source (recent / my drive / shared)
 *
 * Mirror of lib/google/api.ts. All requests are server-side (Node) so
 * CSP doesn't apply to outbound — but we still proxy through getAccessToken
 * to ensure encrypted tokens, refresh handling, and consistent error paths.
 *
 * Errors return null + console.error; widgets render a graceful state.
 */

import { getMicrosoftAccessToken } from "./refresh-access-token";

export interface OutlookEvent {
  id: string;
  subject: string;
  start: string; // ISO
  end: string; // ISO
  location?: string;
  webLink?: string;
  isOnlineMeeting?: boolean;
}

export interface MsTodoList {
  id: string;
  displayName: string;
  isDefault?: boolean;
}

export interface MsTodoTask {
  id: string;
  listId: string; // we tag this on the way out so the widget can deeplink
  title: string;
  dueDateTime?: string; // ISO when present
  status: "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";
}

export interface OneDriveFile {
  id: string;
  name: string;
  webUrl: string;
  /** "folder" | mime — Graph returns either file.mimeType or folder facet. */
  mimeType: string;
  lastModifiedDateTime: string;
  size?: number;
}

export type OutlookCalendarVariant = "today" | "thisWeek" | "nextWeek";
export type OneDriveVariant = "recent" | "myDrive" | "shared";

async function graphFetch(
  userId: string,
  url: string,
  init?: RequestInit,
): Promise<unknown | null> {
  const accessToken = await getMicrosoftAccessToken(userId);
  if (!accessToken) return null;

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      // Outlook prefers ISO 8601 timezone semantics; the Prefer header
      // tells Graph to return event times in UTC consistently.
      Prefer: 'outlook.timezone="UTC"',
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    console.error(
      `[microsoft/api] ${res.status} ${init?.method ?? "GET"} ${url} — ${body.slice(0, 200)}`,
    );
    return null;
  }
  if (res.status === 204) return {};
  return res.json();
}

// ──────────────────────────────────────────────────────────────────────────
// Outlook Calendar
// ──────────────────────────────────────────────────────────────────────────

function calendarRange(variant: OutlookCalendarVariant): {
  startDateTime: string;
  endDateTime: string;
} {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  if (variant === "today") {
    // End of today in Singapore Time (UTC+8) — same semantics as
    // lib/google/api.ts's `today` variant so the two calendars align.
    const SGT = 8 * 60 * 60 * 1000;
    const sgNow = new Date(now.getTime() + SGT);
    const sgEnd = new Date(sgNow);
    sgEnd.setUTCHours(23, 59, 59, 999);
    return {
      startDateTime: now.toISOString(),
      endDateTime: new Date(sgEnd.getTime() - SGT).toISOString(),
    };
  }
  if (variant === "thisWeek") {
    return {
      startDateTime: now.toISOString(),
      endDateTime: new Date(now.getTime() + 7 * day).toISOString(),
    };
  }
  return {
    startDateTime: new Date(now.getTime() + 7 * day).toISOString(),
    endDateTime: new Date(now.getTime() + 14 * day).toISOString(),
  };
}

/**
 * Fetch the user's upcoming Outlook events in the given time window.
 * Uses the calendarView endpoint which expands recurring events into
 * single instances (vs /events which returns the master series).
 */
export async function listOutlookEvents(
  userId: string,
  variant: OutlookCalendarVariant = "today",
): Promise<OutlookEvent[] | null> {
  const range = calendarRange(variant);
  const url = new URL(
    "https://graph.microsoft.com/v1.0/me/calendarView",
  );
  url.searchParams.set("startDateTime", range.startDateTime);
  url.searchParams.set("endDateTime", range.endDateTime);
  url.searchParams.set("$top", "20");
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set(
    "$select",
    "id,subject,start,end,location,webLink,isOnlineMeeting",
  );

  const data = (await graphFetch(userId, url.toString())) as
    | {
        value?: Array<{
          id: string;
          subject?: string;
          start?: { dateTime?: string; timeZone?: string };
          end?: { dateTime?: string; timeZone?: string };
          location?: { displayName?: string };
          webLink?: string;
          isOnlineMeeting?: boolean;
        }>;
      }
    | null;
  if (!data) return null;

  return (data.value ?? [])
    .filter((e) => e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({
      id: e.id,
      subject: e.subject ?? "(no title)",
      start: e.start!.dateTime!,
      end: e.end!.dateTime!,
      location: e.location?.displayName || undefined,
      webLink: e.webLink,
      isOnlineMeeting: e.isOnlineMeeting,
    }));
}

// ──────────────────────────────────────────────────────────────────────────
// Microsoft To Do
// ──────────────────────────────────────────────────────────────────────────

/**
 * Fetch the user's To Do task LISTS. There is always at least one (the
 * default "Tasks" list); users can have more.
 */
export async function listTodoLists(
  userId: string,
): Promise<MsTodoList[] | null> {
  const url = "https://graph.microsoft.com/v1.0/me/todo/lists?$top=50";
  const data = (await graphFetch(userId, url)) as
    | {
        value?: Array<{
          id: string;
          displayName: string;
          wellknownListName?: string;
        }>;
      }
    | null;
  if (!data) return null;
  return (data.value ?? []).map((l) => ({
    id: l.id,
    displayName: l.displayName,
    isDefault: l.wellknownListName === "defaultList",
  }));
}

/**
 * Open (non-completed) tasks in a specific To Do list, oldest-first
 * within priority.
 */
export async function listTodoTasksInList(
  userId: string,
  listId: string,
): Promise<MsTodoTask[] | null> {
  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/todo/lists/${encodeURIComponent(listId)}/tasks`,
  );
  url.searchParams.set("$filter", "status ne 'completed'");
  url.searchParams.set("$top", "50");
  url.searchParams.set("$select", "id,title,dueDateTime,status");

  const data = (await graphFetch(userId, url.toString())) as
    | {
        value?: Array<{
          id: string;
          title?: string;
          dueDateTime?: { dateTime?: string; timeZone?: string };
          status?: MsTodoTask["status"];
        }>;
      }
    | null;
  if (!data) return null;
  return (data.value ?? []).map((t) => ({
    id: t.id,
    listId,
    title: t.title ?? "(untitled)",
    dueDateTime: t.dueDateTime?.dateTime,
    status: t.status ?? "notStarted",
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// OneDrive
// ──────────────────────────────────────────────────────────────────────────

export async function listOneDriveFiles(
  userId: string,
  variant: OneDriveVariant = "recent",
): Promise<OneDriveFile[] | null> {
  // Three endpoints map to the three variants:
  //   recent   → /me/drive/recent  (server-sorted by lastAccessed; cross-source)
  //   myDrive  → /me/drive/root/children
  //   shared   → /me/drive/sharedWithMe  (shared by others, including SharePoint)
  let url: URL;
  if (variant === "recent") {
    url = new URL("https://graph.microsoft.com/v1.0/me/drive/recent");
    url.searchParams.set("$top", "20");
  } else if (variant === "myDrive") {
    url = new URL(
      "https://graph.microsoft.com/v1.0/me/drive/root/children",
    );
    url.searchParams.set("$top", "20");
    url.searchParams.set("$orderby", "lastModifiedDateTime desc");
  } else {
    url = new URL("https://graph.microsoft.com/v1.0/me/drive/sharedWithMe");
    url.searchParams.set("$top", "20");
  }

  const data = (await graphFetch(userId, url.toString())) as
    | {
        value?: Array<{
          id: string;
          name?: string;
          webUrl?: string;
          file?: { mimeType?: string };
          folder?: { childCount?: number };
          lastModifiedDateTime?: string;
          size?: number;
          remoteItem?: {
            name?: string;
            webUrl?: string;
            file?: { mimeType?: string };
            folder?: { childCount?: number };
            lastModifiedDateTime?: string;
            size?: number;
          };
        }>;
      }
    | null;
  if (!data) return null;

  // sharedWithMe wraps real items in `remoteItem`. Flatten that here so
  // downstream consumers see one consistent shape.
  return (data.value ?? [])
    .map((item) => {
      const src = item.remoteItem ?? item;
      const mimeType = src.file?.mimeType ?? (src.folder ? "folder" : "unknown");
      return {
        id: item.id,
        name: src.name ?? "(unnamed)",
        webUrl: src.webUrl ?? "",
        mimeType,
        lastModifiedDateTime: src.lastModifiedDateTime ?? "",
        size: src.size,
      };
    })
    .filter((f) => f.mimeType !== "folder"); // Hide folders; widget shows files only.
}
