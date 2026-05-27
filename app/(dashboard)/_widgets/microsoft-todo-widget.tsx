"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchMyTodoLists,
  fetchMyTodoTasksInList,
} from "../_actions/microsoft";
import type { MsTodoList, MsTodoTask } from "@/lib/microsoft/api";
import { usePollingData } from "./use-polling-data";
import {
  WidgetShell,
  WidgetTabs,
  WidgetSkeleton,
  WidgetEmpty,
  WidgetConnectMicrosoft,
} from "./widget-shell";

/**
 * Microsoft To Do widget — mirror of the Google Tasks widget's list-tab
 * pattern but without mutations (no tick-box yet; surface the data only,
 * deeplink out to the To Do web client to actually mark done).
 *
 * Tabs are dynamic: one per To Do list the user has (default "Tasks" plus
 * any user-created lists). Selecting a tab fetches the open tasks in
 * that list.
 */
export function MicrosoftTodoWidget() {
  // Lists are fetched once on mount; data null = not connected.
  const [lists, setLists] = useState<MsTodoList[] | null | undefined>(
    undefined,
  );
  const [activeListId, setActiveListId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ls = await fetchMyTodoLists();
      if (cancelled) return;
      setLists(ls);
      if (ls && ls.length > 0 && !activeListId) {
        // Default to the "default" list if present, else first list.
        const def = ls.find((l) => l.isDefault) ?? ls[0];
        setActiveListId(def.id);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetcher = useCallback(async (): Promise<MsTodoTask[] | null> => {
    if (!activeListId) return [];
    return fetchMyTodoTasksInList(activeListId);
  }, [activeListId]);

  const { data } = usePollingData(fetcher, 60_000, [activeListId]);

  const tabs: Array<{ key: string; label: string }> = (lists ?? []).map((l) => ({
    key: l.id,
    label: l.displayName,
  }));

  let body;
  if (lists === undefined) body = <WidgetSkeleton />;
  else if (lists === null) body = <WidgetConnectMicrosoft />;
  else if (lists.length === 0)
    body = <WidgetEmpty message="No To Do lists. Create one in Microsoft To Do first." />;
  else if (data === undefined) body = <WidgetSkeleton />;
  else if (data === null) body = <WidgetConnectMicrosoft />;
  else if (data.length === 0)
    body = <WidgetEmpty message="Nothing in this list. 🎉" />;
  else
    body = (
      <ul className="space-y-2">
        {data.slice(0, 6).map((t) => (
          <li key={t.id} className="flex items-start gap-2">
            <span
              className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-muted/40"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="font-sans text-sm text-ink truncate">{t.title}</p>
              {t.dueDateTime && (
                <p className="font-sans text-xs text-muted/70">
                  due{" "}
                  {new Date(t.dueDateTime).toLocaleDateString("en-SG", {
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
      title="To Do"
      subtitle="Microsoft To Do"
      tabs={
        tabs.length > 1 ? (
          <WidgetTabs
            active={activeListId}
            onChange={setActiveListId}
            options={tabs}
          />
        ) : undefined
      }
      footer={
        <a
          href="https://to-do.live.com/tasks"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink transition-colors"
        >
          Open Microsoft To Do →
        </a>
      }
    >
      {body}
    </WidgetShell>
  );
}
