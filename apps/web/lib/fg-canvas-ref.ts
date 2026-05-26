"use client";

/**
 * Module-level handle on the active react-force-graph-3d instance. Mirrors
 * `canvas-ref.ts` for Cytoscape — the 3D canvas registers itself on mount
 * so toolbar widgets (Export) can read the underlying three.js renderer
 * without subscribing through React state.
 *
 * Typed as `unknown` because react-force-graph-3d's instance type isn't
 * exported in a useful way; callers narrow at the use site.
 */
// biome-ignore lint/suspicious/noExplicitAny: third-party fg instance is loosely typed.
type FgInstance = any;

let activeFg: FgInstance | null = null;

export function registerFg(fg: FgInstance): void {
  activeFg = fg;
}

export function unregisterFg(fg: FgInstance): void {
  if (activeFg === fg) activeFg = null;
}

export function getFg(): FgInstance | null {
  return activeFg;
}
