"use client";

import { useCallback, useState } from "react";
import { usePollingData } from "@/app/(dashboard)/_widgets/use-polling-data";
import {
  WidgetShell,
  WidgetTabs,
  WidgetSkeleton,
  WidgetEmpty,
} from "@/app/(dashboard)/_widgets/widget-shell";
import { ConnectPrompt } from "./connect-prompts";
import type { GadgetConfig } from "./types";

/**
 * Generic gadget renderer. Reads a GadgetConfig and produces a card
 * with tabs, polling, and the four canonical states
 * (loading / not-connected / empty / data). See docs/gadget-pattern.md.
 */
export function Gadget<TData, TVariant extends string = string>({
  config,
}: {
  config: GadgetConfig<TData, TVariant>;
}) {
  // Resolve initial variant: explicit default, or first tab, or "" when
  // the gadget has no tabs at all. The empty-string fallback keeps the
  // type happy for variant-less gadgets — the fetcher signature accepts
  // it (TVariant defaults to string).
  const initialVariant =
    config.defaultVariant ??
    (config.variants && config.variants.length > 0
      ? config.variants[0].key
      : ("" as TVariant));

  const [variant, setVariant] = useState<TVariant>(initialVariant);

  const fetcher = useCallback(
    () => config.fetcher(variant),
    [config, variant],
  );

  const { data } = usePollingData(
    fetcher,
    config.pollIntervalMs ?? 60_000,
    [config.id, variant],
  );

  // Default "empty" predicate: array with length 0.
  const isEmpty =
    config.isEmpty ??
    ((d: TData) => Array.isArray(d) && (d as unknown[]).length === 0);

  let body;
  if (data === undefined) {
    body = <WidgetSkeleton />;
  } else if (data === null) {
    body = <ConnectPrompt provider={config.provider} />;
  } else if (isEmpty(data)) {
    body = <WidgetEmpty message={config.emptyMessage(variant)} />;
  } else {
    body = config.render({ data, variant });
  }

  const hasTabs = config.variants && config.variants.length > 0;

  return (
    <WidgetShell
      title={config.title}
      subtitle={config.subtitle}
      tabs={
        hasTabs ? (
          <WidgetTabs
            active={variant}
            onChange={setVariant}
            options={config.variants!}
          />
        ) : undefined
      }
      footer={
        config.footerLink ? (
          <a
            href={config.footerLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink transition-colors"
          >
            {config.footerLink.label}
          </a>
        ) : undefined
      }
    >
      {body}
    </WidgetShell>
  );
}

export type { GadgetConfig, AnyGadgetConfig } from "./types";
