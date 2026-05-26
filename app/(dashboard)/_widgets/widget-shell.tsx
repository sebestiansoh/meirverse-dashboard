"use client";

import type { ReactNode } from "react";

/**
 * Shared card chrome for the Phase 2.4 widgets. Keeps the visual
 * language consistent — uppercase cluster-style label, serif title,
 * scrollable body, optional footer link.
 */
export function WidgetShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-md border border-surface bg-paper p-5">
      <header className="mb-4">
        {subtitle && (
          <p className="font-sans text-xs uppercase tracking-[0.15em] text-muted">
            {subtitle}
          </p>
        )}
        <h2 className="font-serif text-lg leading-tight text-ink">{title}</h2>
      </header>
      <div className="flex-1 min-h-[8rem]">{children}</div>
      {footer && (
        <footer className="mt-4 pt-3 border-t border-surface/70 font-sans text-xs text-muted/80">
          {footer}
        </footer>
      )}
    </section>
  );
}

export function WidgetSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-3/4 rounded bg-surface animate-pulse" />
      <div className="h-3 w-2/3 rounded bg-surface animate-pulse" />
      <div className="h-3 w-1/2 rounded bg-surface animate-pulse" />
    </div>
  );
}

export function WidgetEmpty({ message }: { message: string }) {
  return (
    <p className="font-sans text-sm text-muted/70 italic">{message}</p>
  );
}

export function WidgetConnectGoogle() {
  return (
    <div className="space-y-3">
      <p className="font-sans text-sm text-muted">
        Connect your Google account to enable this widget.
      </p>
      <a
        href="/login"
        className="inline-block font-sans text-xs uppercase tracking-[0.15em] text-accent hover:text-ink transition-colors"
      >
        Connect Google →
      </a>
      <p className="font-sans text-xs text-muted/60">
        You&apos;ll be re-prompted to grant Tasks · Calendar · Drive access.
      </p>
    </div>
  );
}
