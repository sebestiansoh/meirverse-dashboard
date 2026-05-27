"use client";

import { Gadget, type GadgetConfig } from "@/lib/gadgets/gadget";
import { fetchMyUpcomingEvents } from "@/app/(dashboard)/_actions/google";
import type { CalendarEvent, CalendarVariant } from "@/lib/google/api";

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

const config: GadgetConfig<CalendarEvent[], CalendarVariant> = {
  id: "google.calendar",
  provider: "google",
  title: "Upcoming",
  subtitle: "Google Calendar",
  footerLink: {
    href: "https://calendar.google.com",
    label: "Open Google Calendar →",
  },
  variants: [
    { key: "today", label: "Today" },
    { key: "thisWeek", label: "This Week" },
    { key: "nextWeek", label: "Next Week" },
  ],
  defaultVariant: "today",
  fetcher: (variant) => fetchMyUpcomingEvents(variant),
  emptyMessage: (variant) => EMPTY_BY_VARIANT[variant],
  render: ({ data, variant }) => (
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
  ),
};

export function CalendarGadget() {
  return <Gadget config={config} />;
}
