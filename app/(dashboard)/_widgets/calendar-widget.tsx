"use client";

import { useCallback, useState } from "react";
import { fetchMyUpcomingEvents } from "../_actions/google";
import type { CalendarVariant } from "@/lib/google/api";
import { usePollingData } from "./use-polling-data";
import {
  WidgetShell,
  WidgetTabs,
  WidgetSkeleton,
  WidgetEmpty,
  WidgetConnectGoogle,
} from "./widget-shell";

const TABS: ReadonlyArray<{ key: CalendarVariant; label: string }> = [
  { key: "today", label: "Today" },
  { key: "thisWeek", label: "This Week" },
  { key: "nextWeek", label: "Next Week" },
];

const EMPTY_BY_VARIANT: Record<CalendarVariant, string> = {
  today: "Nothing else scheduled today.",
  thisWeek: "Nothing scheduled this week.",
  nextWeek: "Nothing scheduled next week.",
};

function formatWhen(startIso: string, variant: CalendarVariant): string {
  const d = new Date(startIso);
  const opts: Intl.DateTimeFormatOptions =
    variant === "today"
      ? { hour: "numeric", minute: "2-digit" }
      : {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        };
  return d.toLocaleString("en-SG", opts);
}

export function CalendarWidget() {
  const [variant, setVariant] = useState<CalendarVariant>("today");
  const fetcher = useCallback(
    () => fetchMyUpcomingEvents(variant),
    [variant],
  );
  const { data } = usePollingData(fetcher, 60_000, [variant]);

  let body;
  if (data === undefined) body = <WidgetSkeleton />;
  else if (data === null) body = <WidgetConnectGoogle />;
  else if (data.length === 0)
    body = <WidgetEmpty message={EMPTY_BY_VARIANT[variant]} />;
  else
    body = (
      <ul className="space-y-3">
        {data.slice(0, 6).map((e) => (
          <li key={e.id} className="space-y-0.5">
            <p className="font-sans text-sm text-ink truncate">{e.summary}</p>
            <p className="font-sans text-xs text-muted/70">
              {formatWhen(e.start, variant)}
              {e.location && ` · ${e.location.split(",")[0]}`}
            </p>
          </li>
        ))}
      </ul>
    );

  return (
    <WidgetShell
      title="Upcoming"
      subtitle="Google Calendar"
      tabs={<WidgetTabs active={variant} onChange={setVariant} options={TABS} />}
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
