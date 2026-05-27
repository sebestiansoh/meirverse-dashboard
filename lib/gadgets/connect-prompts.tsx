"use client";

import type { GadgetProvider } from "./types";

/**
 * Provider-aware "Connect …" CTA shown when a gadget's fetcher returns
 * `null` (meaning the user hasn't completed offline-access OAuth for
 * that provider yet).
 *
 * Each branch matches the OAuth flow exposed on /login. Adding a new
 * provider to the GadgetProvider union means adding a branch here.
 */
export function ConnectPrompt({ provider }: { provider: GadgetProvider }) {
  if (provider === "google") {
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
          You&apos;ll be re-prompted to grant the relevant scopes.
        </p>
      </div>
    );
  }

  if (provider === "microsoft") {
    return (
      <div className="space-y-3">
        <p className="font-sans text-sm text-muted">
          Connect your Microsoft account to enable this widget.
        </p>
        <a
          href="/login"
          className="inline-block font-sans text-xs uppercase tracking-[0.15em] text-accent hover:text-ink transition-colors"
        >
          Connect Microsoft →
        </a>
        <p className="font-sans text-xs text-muted/60">
          You&apos;ll be re-prompted to grant the relevant scopes.
        </p>
      </div>
    );
  }

  // Exhaustiveness guard — TS narrows `provider` to `never` here if the
  // union is fully handled. Runtime fallback renders a generic prompt
  // so a new provider added without a branch still degrades gracefully.
  const _exhaustive: never = provider;
  void _exhaustive;
  return (
    <p className="font-sans text-sm text-muted">
      Connect your account to enable this widget.
    </p>
  );
}
