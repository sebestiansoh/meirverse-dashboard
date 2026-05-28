"use client";

import { type ReactNode, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { MICROSOFT_OAUTH_SCOPES } from "@/lib/microsoft/scopes";

/**
 * Shared card chrome for the Phase 2.4 widgets. Provides the
 * uppercase cluster-style subtitle, serif title, optional tab strip,
 * scrollable body, and optional footer link.
 */
export function WidgetShell({
  title,
  subtitle,
  tabs,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  tabs?: ReactNode;
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
      {tabs && <div className="mb-3">{tabs}</div>}
      <div className="flex-1 min-h-[8rem]">{children}</div>
      {footer && (
        <footer className="mt-4 pt-3 border-t border-surface/70 font-sans text-xs text-muted/80">
          {footer}
        </footer>
      )}
    </section>
  );
}

export function WidgetTabs<T extends string>({
  active,
  onChange,
  options,
}: {
  active: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ key: T; label: string }>;
}) {
  return (
    <div className="flex gap-1 border-b border-surface/60 -mx-1">
      {options.map((opt) => {
        const isActive = opt.key === active;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            className={`px-2 py-1.5 font-sans text-[11px] uppercase tracking-[0.12em] transition-colors -mb-px border-b-2 ${
              isActive
                ? "text-ink border-accent"
                : "text-muted border-transparent hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
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

export function WidgetConnectMicrosoft() {
  const [linking, setLinking] = useState(false);

  // Per Mandate v1.7, Microsoft is a *secondary* grant layered onto the
  // already-signed-in Google user — not a competing login. linkIdentity
  // attaches the Azure identity to the current session; signInWithOAuth
  // would replace it (signing the user out of Google). The flow=link-azure
  // marker tells /auth/callback to store the returned refresh token in the
  // Microsoft table — app_metadata.provider stays "google" on a link.
  const connectMicrosoft = async () => {
    setLinking(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.linkIdentity({
      provider: "azure",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?flow=link-azure`,
        scopes: MICROSOFT_OAUTH_SCOPES,
        queryParams: { prompt: "consent" },
      },
    });
    if (error) setLinking(false);
  };

  return (
    <div className="space-y-3">
      <p className="font-sans text-sm text-muted">
        Connect your Microsoft 365 account to enable this widget.
      </p>
      <button
        type="button"
        onClick={connectMicrosoft}
        disabled={linking}
        className="inline-block font-sans text-xs uppercase tracking-[0.15em] text-accent hover:text-ink transition-colors disabled:opacity-50"
      >
        {linking ? "Redirecting…" : "Connect Microsoft 365 →"}
      </button>
      <p className="font-sans text-xs text-muted/60">
        Keeps you signed in with Google · grants Calendar · To Do · OneDrive access.
      </p>
    </div>
  );
}
