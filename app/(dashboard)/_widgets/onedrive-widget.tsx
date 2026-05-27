"use client";

import { useCallback, useState } from "react";
import { fetchMyOneDriveFiles } from "../_actions/microsoft";
import type { OneDriveVariant } from "@/lib/microsoft/api";
import { usePollingData } from "./use-polling-data";
import {
  WidgetShell,
  WidgetTabs,
  WidgetSkeleton,
  WidgetEmpty,
  WidgetConnectMicrosoft,
} from "./widget-shell";

const TABS: ReadonlyArray<{ key: OneDriveVariant; label: string }> = [
  { key: "recent", label: "Recent" },
  { key: "myDrive", label: "My Drive" },
  { key: "shared", label: "Shared" },
];

const EMPTY_BY_VARIANT: Record<OneDriveVariant, string> = {
  recent: "No recent files.",
  myDrive: "No files in your OneDrive.",
  shared: "Nothing shared with you.",
};

function iconFor(mimeType: string): string {
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return "🖥️";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📄";
  if (mimeType.includes("pdf")) return "📕";
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  return "📁";
}

export function OneDriveWidget() {
  const [variant, setVariant] = useState<OneDriveVariant>("recent");
  const fetcher = useCallback(
    () => fetchMyOneDriveFiles(variant),
    [variant],
  );
  const { data } = usePollingData(fetcher, 60_000, [variant]);

  let body;
  if (data === undefined) body = <WidgetSkeleton />;
  else if (data === null) body = <WidgetConnectMicrosoft />;
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
              href={f.webUrl}
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
      subtitle="OneDrive"
      tabs={<WidgetTabs active={variant} onChange={setVariant} options={TABS} />}
      footer={
        <a
          href="https://onedrive.live.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink transition-colors"
        >
          Open OneDrive →
        </a>
      }
    >
      {body}
    </WidgetShell>
  );
}
