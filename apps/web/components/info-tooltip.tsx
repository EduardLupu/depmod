"use client";

import { lookupGlossaryEntry } from "@/lib/glossary";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

interface InfoTooltipProps {
  /**
   * Stable glossary id (see lib/glossary.ts). Drives the rendered definition;
   * renaming UI labels never breaks tooltips.
   */
  term: string;
  /**
   * Optional wrapped trigger. When omitted, renders a small "?" affordance
   * suitable for placement next to a label.
   */
  children?: ReactNode;
  /** Override tooltip side. Radix default is "top". */
  side?: "top" | "right" | "bottom" | "left";
  /** Override tooltip alignment. Radix default is "center". */
  align?: "start" | "center" | "end";
  /** Extra className applied to the trigger. */
  className?: string;
}

/**
 * Hover/focus-revealed definition pulled from the glossary.
 * Built on Radix Tooltip so keyboard focus, escape-to-close, and ARIA wiring
 * come for free.
 */
export function InfoTooltip({
  term,
  children,
  side = "top",
  align = "center",
  className,
}: InfoTooltipProps) {
  const entry = lookupGlossaryEntry(term);
  if (!entry) return <>{children}</>;

  const trigger = children ?? (
    <DefaultTrigger className={className} ariaLabel={`What is ${entry.term}?`} />
  );

  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>
        <span className="inline-flex items-center">{trigger}</span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          className="z-[200] max-w-xs rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs leading-snug text-neutral-200 shadow-2xl outline-none data-[state=delayed-open]:animate-in data-[state=closed]:animate-out"
          style={{ backgroundColor: "#171717" }}
        >
          <div className="mb-0.5 font-semibold text-neutral-100">{entry.term}</div>
          <div className="text-neutral-300">{entry.short}</div>
          {entry.formula ? (
            <div className="mt-1 font-mono text-[11px] text-neutral-400">{entry.formula}</div>
          ) : null}
          <Tooltip.Arrow className="fill-neutral-800" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function DefaultTrigger({ className, ariaLabel }: { className?: string; ariaLabel: string }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      tabIndex={0}
      className={`ml-1 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-neutral-700 text-[9px] text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200 focus-visible:border-neutral-400 focus-visible:text-neutral-100 focus-visible:outline-none ${className ?? ""}`}
    >
      ?
    </button>
  );
}
