"use client";

import type { Core } from "cytoscape";

/**
 * Module-level handle on the active Cytoscape instance. The canvas registers
 * itself on mount; toolbar widgets (Export, future Reset-camera) read it.
 *
 * Why a module-level ref instead of a store field: the cy instance is mutable,
 * not serialisable, and shouldn't trigger React re-renders. Stashing it on
 * the zustand store would force every subscriber to subscribe to it explicitly,
 * which is noise.
 */
let activeCy: Core | null = null;

export function registerCy(cy: Core): void {
  activeCy = cy;
}

export function unregisterCy(cy: Core): void {
  if (activeCy === cy) activeCy = null;
}

export function getCy(): Core | null {
  return activeCy;
}
