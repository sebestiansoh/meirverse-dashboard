"use client";

import { fetchMyTasks } from "../_actions/google";
import { usePollingData } from "./use-polling-data";
import {
  WidgetShell,
  WidgetSkeleton,
  WidgetEmpty,
  WidgetConnectGoogle,
} from "./widget-shell";

export function TasksWidget() {
  const { data } = usePollingData(fetchMyTasks);

  let body;
  if (data === undefined) {
    body = <WidgetSkeleton />;
  } else if (data === null) {
    body = <WidgetConnectGoogle />;
  } else if (data.length === 0) {
    body = <WidgetEmpty message="No outstanding tasks. 🎉" />;
  } else {
    body = (
      <ul className="space-y-2">
        {data.slice(0, 6).map((t) => (
          <li key={t.id} className="flex items-start gap-2">
            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-accent shrink-0" />
            <div className="min-w-0">
              <p className="font-sans text-sm text-ink truncate">{t.title}</p>
              {t.due && (
                <p className="font-sans text-xs text-muted/70">
                  due {new Date(t.due).toLocaleDateString("en-SG", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <WidgetShell
      title="Tasks"
      subtitle="Google Tasks"
      footer={
        <a
          href="https://tasks.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink transition-colors"
        >
          Open Google Tasks →
        </a>
      }
    >
      {body}
    </WidgetShell>
  );
}
