"use client";

import { useGraphStore } from "@/lib/store";

/**
 * Small header affordance that opens the LegendPanel. Mirrored by the `?`
 * keyboard shortcut so power-users never have to click.
 */
export function LegendButton() {
  const setOpen = useGraphStore((s) => s.setLegendOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
      aria-label="Open legend (press ? from anywhere)"
      title="Open legend (press ?)"
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-neutral-700 text-[10px]">
        ?
      </span>
      Legend
    </button>
  );
}
