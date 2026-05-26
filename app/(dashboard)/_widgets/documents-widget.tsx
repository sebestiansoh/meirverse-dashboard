"use client";

import { useCallback, useState } from "react";
import { fetchMyDriveFiles } from "../_actions/google";
import type { DriveVariant } from "@/lib/google/api";
import { usePollingData } from "./use-polling-data";
import {
  WidgetShell,
  WidgetTabs,
  WidgetSkeleton,
  WidgetEmpty,
  WidgetConnectGoogle,
} from "./widget-shell";

const TABS: ReadonlyArray<{ key: DriveVariant; label: string }> = [
  { key: "recent", label: "Recent" },
  { key: "myDrive", label: "My Drive" },
  { key: "sharedDrives", label: "Shared" },
];

const EMPTY_BY_VARIANT: Record<DriveVariant, string> = {
  recent: "No recent files.",
  myDrive: "No files in your Drive.",
  sharedDrives: "Nothing shared with you.",
};

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
  const [variant, setVariant] = useState<DriveVariant>("recent");
  const fetcher = useCallback(() => fetchMyDriveFiles(variant), [variant]);
  const { data } = usePollingData(fetcher, 60_000, [variant]);

  let body;
  if (data === undefined) body = <WidgetSkeleton />;
  else if (data === null) body = <WidgetConnectGoogle />;
  else if (data.length === 0)
    body = <WidgetEmpty message={EMPTY_BY_VARIANT[variant]} />;
  else
    body = (
      <ul className="space-y-2">
        {data.slice(0, 6).map((f) => (
          <li key={f.id} className="flex items-start gap-2">
            <span
              className="text-base leading-none mt-0.5 shrink-0"
              aria-hidden
            >
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

  return (
    <WidgetShell
      title="Files"
      subtitle="Google Drive"
      tabs={<WidgetTabs active={variant} onChange={setVariant} options={TABS} />}
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
