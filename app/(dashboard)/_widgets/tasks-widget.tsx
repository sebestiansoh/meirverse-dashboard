"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchMyTaskLists,
  fetchMyTasksInList,
  markGoogleTaskDone,
} from "../_actions/google";
import {
  fetchAssignedToMe,
  fetchIAssigned,
  fetchMyReports,
  assignTask,
  completeDashboardTask,
  type AssignedTaskRow,
  type ReportSummary,
} from "../_actions/tasks";
import type { TaskItem, TaskList } from "@/lib/google/api";
import { usePollingData } from "./use-polling-data";
import {
  WidgetShell,
  WidgetTabs,
  WidgetSkeleton,
  WidgetEmpty,
  WidgetConnectGoogle,
} from "./widget-shell";

type TabKey = string; // "google:<listId>" | "assigned-to-me" | "i-assigned" | "assign"

export function TasksWidget() {
  // Lists + reports — fetched once on mount, then on-demand if refresh
  // is triggered (e.g. after assigning a task).
  const [lists, setLists] = useState<TaskList[] | null | undefined>(undefined);
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [active, setActive] = useState<TabKey>("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ls, rs] = await Promise.all([fetchMyTaskLists(), fetchMyReports()]);
      if (cancelled) return;
      setLists(ls);
      setReports(rs);
      // Default to the first Google list, or "assigned-to-me" if no lists.
      if (!active) {
        if (ls && ls.length > 0) setActive(`google:${ls[0].id}`);
        else setActive("assigned-to-me");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick]);

  // Polling fetcher for the currently-selected tab's items.
  // Returns either TaskItem[] (Google) or AssignedTaskRow[] (dashboard).
  const fetcher = useCallback(async () => {
    if (active.startsWith("google:")) {
      const listId = active.slice("google:".length);
      const items = await fetchMyTasksInList(listId);
      return items === null ? null : ({ kind: "google" as const, items });
    }
    if (active === "assigned-to-me") {
      const items = await fetchAssignedToMe();
      return { kind: "dash-to-me" as const, items };
    }
    if (active === "i-assigned") {
      const items = await fetchIAssigned();
      return { kind: "dash-i-gave" as const, items };
    }
    // 'assign' tab — no list to fetch
    return { kind: "form" as const };
  }, [active]);

  const { data } = usePollingData(fetcher, 60_000, [active, refreshTick]);

  // Build tabs dynamically.
  const tabs: Array<{ key: TabKey; label: string }> = [];
  if (lists) {
    for (const l of lists) tabs.push({ key: `google:${l.id}`, label: l.title });
  }
  tabs.push({ key: "assigned-to-me", label: "Assigned" });
  if (reports.length > 0) {
    tabs.push({ key: "i-assigned", label: "I Gave" });
    tabs.push({ key: "assign", label: "+ Assign" });
  }

  // Render body based on data kind.
  let body;
  if (lists === undefined && active === "") {
    body = <WidgetSkeleton />;
  } else if (lists === null) {
    body = <WidgetConnectGoogle />;
  } else if (data === undefined) {
    body = <WidgetSkeleton />;
  } else if (data === null) {
    body = <WidgetConnectGoogle />;
  } else if (data.kind === "form") {
    body = (
      <AssignForm
        reports={reports}
        onDone={() => {
          setActive("i-assigned");
          setRefreshTick((t) => t + 1);
        }}
        onCancel={() => {
          setActive(lists && lists.length > 0 ? `google:${lists[0].id}` : "assigned-to-me");
        }}
      />
    );
  } else if (data.kind === "google") {
    body = (
      <GoogleTaskList
        items={data.items}
        onTick={async (item) => {
          await markGoogleTaskDone(item.listId, item.id);
          setRefreshTick((t) => t + 1);
        }}
      />
    );
  } else {
    // dash-to-me or dash-i-gave
    body = (
      <DashTaskList
        items={data.items}
        showAssignee={data.kind === "dash-i-gave"}
        onTick={async (taskId) => {
          await completeDashboardTask(taskId);
          setRefreshTick((t) => t + 1);
        }}
      />
    );
  }

  return (
    <WidgetShell
      title="Tasks"
      subtitle="Google Tasks · Assignments"
      tabs={
        tabs.length > 0 && (
          <WidgetTabs active={active} onChange={setActive} options={tabs} />
        )
      }
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

// ──────────────────────────────────────────────────────────────────────────
// Google task list (incomplete only — tick removes from view)
// ──────────────────────────────────────────────────────────────────────────

function GoogleTaskList({
  items,
  onTick,
}: {
  items: TaskItem[];
  onTick: (item: TaskItem) => void | Promise<void>;
}) {
  // Local optimistic removal — tick immediately hides while server catches up.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = items.filter((t) => !hidden.has(t.id));

  if (visible.length === 0) {
    return <WidgetEmpty message="Nothing in this list. 🎉" />;
  }
  return (
    <ul className="space-y-2">
      {visible.slice(0, 6).map((t) => (
        <li key={t.id} className="flex items-start gap-2">
          <button
            type="button"
            aria-label={`Mark "${t.title}" done`}
            onClick={async () => {
              setHidden((s) => new Set(s).add(t.id));
              try {
                await onTick(t);
              } catch {
                setHidden((s) => {
                  const next = new Set(s);
                  next.delete(t.id);
                  return next;
                });
              }
            }}
            className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-muted/40 hover:border-accent hover:bg-accent/10 transition-colors"
          >
            <span className="sr-only">Done</span>
          </button>
          <div className="min-w-0">
            <p className="font-sans text-sm text-ink truncate">{t.title}</p>
            {t.due && (
              <p className="font-sans text-xs text-muted/70">
                due{" "}
                {new Date(t.due).toLocaleDateString("en-SG", {
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

// ──────────────────────────────────────────────────────────────────────────
// Dashboard task list — assigned to me OR I assigned
// ──────────────────────────────────────────────────────────────────────────

function DashTaskList({
  items,
  showAssignee,
  onTick,
}: {
  items: AssignedTaskRow[];
  showAssignee: boolean;
  onTick: (taskId: string) => void | Promise<void>;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = items.filter((t) => !hidden.has(t.id));

  if (visible.length === 0) {
    return (
      <WidgetEmpty
        message={
          showAssignee
            ? "You haven't assigned any open tasks."
            : "Nothing assigned to you. 🎉"
        }
      />
    );
  }
  return (
    <ul className="space-y-2">
      {visible.slice(0, 6).map((t) => (
        <li key={t.id} className="flex items-start gap-2">
          <button
            type="button"
            disabled={t.done}
            aria-label={`Mark "${t.text}" done`}
            onClick={async () => {
              setHidden((s) => new Set(s).add(t.id));
              try {
                await onTick(t.id);
              } catch {
                setHidden((s) => {
                  const next = new Set(s);
                  next.delete(t.id);
                  return next;
                });
              }
            }}
            className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
              t.done
                ? "border-muted/30 bg-muted/30 cursor-default"
                : "border-muted/40 hover:border-accent hover:bg-accent/10"
            }`}
          >
            {t.done && (
              <span className="text-[10px] text-paper" aria-hidden>
                ✓
              </span>
            )}
            <span className="sr-only">Done</span>
          </button>
          <div className="min-w-0">
            <p
              className={`font-sans text-sm truncate ${
                t.done ? "text-muted/60 line-through" : "text-ink"
              }`}
            >
              {t.text}
            </p>
            <p className="font-sans text-xs text-muted/70">
              {showAssignee
                ? `to ${t.assignee_name ?? "(unknown)"}`
                : `from ${t.assigner_name ?? "(unknown)"}`}
              {t.due_date && ` · due ${new Date(t.due_date).toLocaleDateString("en-SG", { month: "short", day: "numeric" })}`}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Inline assign-task form
// ──────────────────────────────────────────────────────────────────────────

function AssignForm({
  reports,
  onDone,
  onCancel,
}: {
  reports: ReportSummary[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState(reports[0]?.userId ?? "");
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (reports.length === 0) {
    return (
      <WidgetEmpty message="You have no direct reports to assign tasks to." />
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const result = await assignTask({
          assigneeId,
          text,
          dueDate: dueDate || null,
        });
        setPending(false);
        if (result.ok) {
          setText("");
          setDueDate("");
          onDone();
        } else {
          setError(result.error ?? "Failed to assign.");
        }
      }}
    >
      <div>
        <label className="block font-sans text-[11px] uppercase tracking-[0.12em] text-muted mb-1">
          Assignee
        </label>
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="w-full rounded border border-surface bg-paper px-2 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none"
          required
        >
          {reports.map((r) => (
            <option key={r.userId} value={r.userId}>
              {r.displayName ?? r.email ?? r.userId.slice(0, 8)}
              {r.rank && ` · ${r.rank}`}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block font-sans text-[11px] uppercase tracking-[0.12em] text-muted mb-1">
          Task
        </label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What needs to be done?"
          className="w-full rounded border border-surface bg-paper px-2 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none"
          required
          maxLength={200}
        />
      </div>
      <div>
        <label className="block font-sans text-[11px] uppercase tracking-[0.12em] text-muted mb-1">
          Due date (optional)
        </label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full rounded border border-surface bg-paper px-2 py-1.5 font-sans text-sm text-ink focus:border-accent focus:outline-none"
        />
      </div>
      {error && (
        <p
          role="alert"
          className="font-sans text-xs text-red-700 bg-red-50 border border-red-300 rounded px-2 py-1"
        >
          {error}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-ink text-paper px-3 py-1.5 font-sans text-xs uppercase tracking-[0.12em] hover:bg-accent disabled:opacity-50 transition-colors"
        >
          {pending ? "Assigning…" : "Assign"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-sans text-xs uppercase tracking-[0.12em] text-muted hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
