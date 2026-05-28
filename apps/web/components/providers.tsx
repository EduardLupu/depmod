"use client";

import { isStaticDemo } from "@/lib/static-mode";
import { useLegendShortcut } from "@/lib/use-legend-shortcut";
import { useServerGraphReload } from "@/lib/use-server-graph-reload";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

import { LegendPanel } from "@/components/legend-panel";

function ServerGraphReload() {
  useServerGraphReload();
  return null;
}

/**
 * Root client wrapper. Hosts:
 *   - Radix TooltipProvider    ; context every <InfoTooltip/> depends on.
 *   - <LegendPanel/>           ; shared modal across all routes.
 *   - useLegendShortcut()      ; global `?` keybinding.
 *   - useServerGraphReload()   ; live-reloads from `/api/events` when
 *                                 hosted by `depmod-ui --watch`.
 */
export function Providers({ children }: { children: ReactNode }) {
  useLegendShortcut();
  return (
    <Tooltip.Provider delayDuration={150} skipDelayDuration={300} disableHoverableContent={false}>
      {!isStaticDemo ? <ServerGraphReload /> : null}
      {children}
      <LegendPanel />
    </Tooltip.Provider>
  );
}
