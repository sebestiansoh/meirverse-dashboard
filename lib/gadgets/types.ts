import type { ReactNode } from "react";

/**
 * Gadget framework types — see docs/gadget-pattern.md.
 *
 * A Gadget is a self-contained dashboard tile that surfaces data from
 * one OAuth-gated third-party API. The generic <Gadget> component (in
 * gadget.tsx) reads the config and handles every lifecycle state.
 */

/**
 * OAuth providers a gadget can be gated on. Extend here when adding a
 * new provider (e.g. "github") — then add the matching ConnectPrompt
 * variant in connect-prompts.tsx.
 */
export type GadgetProvider = "google" | "microsoft";

export interface GadgetTab<TKey extends string = string> {
  key: TKey;
  label: string;
}

export interface GadgetRenderProps<TData, TVariant extends string> {
  data: TData;
  variant: TVariant;
}

/**
 * The strongly-typed config a gadget instance exports. The variant
 * generic is unused when `variants` is omitted — in that case pass
 * `string` (the default).
 */
export interface GadgetConfig<TData, TVariant extends string = string> {
  /** Stable id, e.g. "google.calendar". Used for telemetry + future per-user toggles. */
  id: string;

  /** OAuth provider that gates this gadget — selects the right ConnectPrompt. */
  provider: GadgetProvider;

  /** Serif heading at the top of the card. */
  title: string;

  /** Uppercase tagline above the title. */
  subtitle: string;

  /** Optional "Open … →" link in the card footer. */
  footerLink?: { href: string; label: string };

  /** Tabs across the top of the card. Undefined / empty = no tabs. */
  variants?: ReadonlyArray<GadgetTab<TVariant>>;

  /** Initial tab. Required when `variants` is non-empty. */
  defaultVariant?: TVariant;

  /**
   * Server-action fetcher. Return `null` to signal "user hasn't
   * connected this provider" — the framework will render the
   * provider-specific ConnectPrompt. Anything else is treated as data.
   */
  fetcher: (variant: TVariant) => Promise<TData | null>;

  /** Render the body. `data` is non-null and non-empty (those states handled by the framework). */
  render: (props: GadgetRenderProps<TData, TVariant>) => ReactNode;

  /** Per-variant empty-state message. */
  emptyMessage: (variant: TVariant) => string;

  /**
   * Predicate that determines whether `data` should render as empty.
   * Defaults to `Array.isArray(data) && data.length === 0`.
   */
  isEmpty?: (data: TData) => boolean;

  /** Poll interval. Default 60_000 ms. */
  pollIntervalMs?: number;
}

/**
 * Type-erased view used inside the framework + registries. Gadget
 * authors should declare their config with the strict generic form
 * above; the framework stores them through this looser type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGadgetConfig = GadgetConfig<any, any>;
