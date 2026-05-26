"use client";

import { fetchMyRecentFiles } from "../_actions/google";
import { usePollingData } from "./use-polling-data";
import {
  WidgetShell,
  WidgetSkeleton,
  WidgetEmpty,
  WidgetConnectGoogle,
} from "./widget-shell";

function iconFor(mimeType: string): string {
  if (mimeType.includes("spreadsheet")) return "📊";
  if (mimeType.includes("presentation")) return "🖥️";
  if (mimeType.includes("document")) return "📄";
  if (mimeType.includes("pdf")) return "📕";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  return "📁";
}

export function DocumentsWidget() {
  const { data } = usePollingData(fetchMyRecentFiles);

  let body;
  if (data === undefined) {
    body = <WidgetSkeleton />;
  } else if (data === null) {
    body = <WidgetConnectGoogle />;
  } else if (data.length === 0) {
    body = <WidgetEmpty message="No recent files." />;
  } else {
    body = (
      <ul className="space-y-2">
        {data.slice(0, 6).map((f) => (
          <li key={f.id} className="flex items-start gap-2">
            <span className="text-base leading-none mt-0.5 shrink-0" aria-hidden>
              {iconFor(f.mimeType)}
            </span>
            <a
              href={f.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-sm text-ink truncate hover:text-accent transition-colors min-w-0"
            >
              {f.name}
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <WidgetShell
      title="Recent"
      subtitle="Google Drive"
      footer={
        <a
          href="https://drive.google.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink transition-colors"
        >
          Open Google Drive →
        </a>
      }
    >
      {body}
    </WidgetShell>
  );
}
