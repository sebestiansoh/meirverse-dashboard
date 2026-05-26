"use client";

import { fetchMyUpcomingEvents } from "../_actions/google";
import { usePollingData } from "./use-polling-data";
import {
  WidgetShell,
  WidgetSkeleton,
  WidgetEmpty,
  WidgetConnectGoogle,
} from "./widget-shell";

function formatWhen(start: string): string {
  const d = new Date(start);
  const now = new Date();
  const sameDay =
    d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("en-SG", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleString("en-SG", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CalendarWidget() {
  const { data } = usePollingData(fetchMyUpcomingEvents);

  let body;
  if (data === undefined) {
    body = <WidgetSkeleton />;
  } else if (data === null) {
    body = <WidgetConnectGoogle />;
  } else if (data.length === 0) {
    body = <WidgetEmpty message="Nothing scheduled coming up." />;
  } else {
    body = (
      <ul className="space-y-3">
        {data.slice(0, 5).map((e) => (
          <li key={e.id} className="space-y-0.5">
            <p className="font-sans text-sm text-ink truncate">{e.summary}</p>
            <p className="font-sans text-xs text-muted/70">
              {formatWhen(e.start)}
              {e.location && ` · ${e.location.split(",")[0]}`}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <WidgetShell
      title="Upcoming"
      subtitle="Google Calendar"
      footer={
        <a
          href="https://calendar.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink transition-colors"
        >
          Open Google Calendar →
        </a>
      }
    >
      {body}
    </WidgetShell>
  );
}
