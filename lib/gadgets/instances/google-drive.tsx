"use client";

import { Gadget, type GadgetConfig } from "@/lib/gadgets/gadget";
import { fetchMyDriveFiles } from "@/app/(dashboard)/_actions/google";
import type { DriveFile, DriveVariant } from "@/lib/google/api";

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

const config: GadgetConfig<DriveFile[], DriveVariant> = {
  id: "google.drive",
  provider: "google",
  title: "Files",
  subtitle: "Google Drive",
  footerLink: {
    href: "https://drive.google.com",
    label: "Open Google Drive →",
  },
  variants: [
    { key: "recent", label: "Recent" },
    { key: "myDrive", label: "My Drive" },
    { key: "sharedDrives", label: "Shared" },
  ],
  defaultVariant: "recent",
  fetcher: (variant) => fetchMyDriveFiles(variant),
  emptyMessage: (variant) => EMPTY_BY_VARIANT[variant],
  render: ({ data }) => (
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
  ),
};

export function DocumentsGadget() {
  return <Gadget config={config} />;
}
