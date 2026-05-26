"use client";

import { useCallback, useState } from "react";
import { fetchMyTasks } from "../_actions/google";
import type { TasksVariant } from "@/lib/google/api";
import { usePollingData } from "./use-polling-data";
import {
  WidgetShell,
  WidgetTabs,
  WidgetSkeleton,
  WidgetEmpty,
  WidgetConnectGoogle,
} from "./widget-shell";

const TABS: ReadonlyArray<{ key: TasksVariant; label: string }> = [
  { key: "current", label: "Current" },
  { key: "today", label: "Today" },
  { key: "done", label: "Done" },
];

const EMPTY_BY_VARIANT: Record<TasksVariant, string> = {
  current: "No outstanding tasks. 🎉",
  today: "Nothing due today.",
  done: "Nothing marked done in the last 7 days.",
};

export function TasksWidget() {
  const [variant, setVariant] = useState<TasksVariant>("current");
  const fetcher = useCallback(() => fetchMyTasks(variant), [variant]);
  const { data } = usePollingData(fetcher, 60_000, [variant]);

  let body;
  if (data === undefined) body = <WidgetSkeleton />;
  else if (data === null) body = <WidgetConnectGoogle />;
  else if (data.length === 0)
    body = <WidgetEmpty message={EMPTY_BY_VARIANT[variant]} />;
  else
    body = (
      <ul className="space-y-2">
        {data.slice(0, 6).map((t) => (
          <li key={t.id} className="flex items-start gap-2">
            <span
              className={`mt-1 inline-block h-2 w-2 rounded-full shrink-0 ${
                variant === "done" ? "bg-muted/60" : "bg-accent"
              }`}
            />
            <div className="min-w-0">
              <p
                className={`font-sans text-sm text-ink truncate ${
                  variant === "done" ? "line-through text-muted/70" : ""
                }`}
              >
                {t.title}
              </p>
              {variant !== "done" && t.due && (
                <p className="font-sans text-xs text-muted/70">
                  due{" "}
                  {new Date(t.due).toLocaleDateString("en-SG", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
              {variant === "done" && t.completed && (
                <p className="font-sans text-xs text-muted/70">
                  done{" "}
                  {new Date(t.completed).toLocaleDateString("en-SG", {
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

  return (
    <WidgetShell
      title="Tasks"
      subtitle="Google Tasks"
      tabs={<WidgetTabs active={variant} onChange={setVariant} options={TABS} />}
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
