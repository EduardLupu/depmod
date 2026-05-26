/**
 * Persist fCoSE-computed node positions in localStorage so a second visit
 * to the same graph version skips the multi-second layout pass and renders
 * instantly via `layout: 'preset'`. Keyed by:
 *
 *   - graph.rootDir       (scopes per project)
 *   - graph.generatedAt   (invalidates when the parser re-runs)
 *   - collapseMode        (collapsed vs expanded have disjoint node sets)
 *
 * Storage budget is small: 1153 nodes × ~40 bytes per entry ≈ 45 KB, well
 * under the ~5 MB per-origin localStorage cap. Eviction is opportunistic;
 * on every save we drop any older entry for the same rootDir so stale
 * graph versions don't accumulate.
 */
import type { Graph } from "@depmod/types";
import type { Core } from "cytoscape";

const KEY_PREFIX = "depmod-ui:layout:";

export type CollapseMode = "expanded" | "collapsed";

interface CachedLayout {
  /** Schema marker; bump if the payload shape changes. */
  v: 1;
  rootDir: string;
  generatedAt: string;
  collapseMode: CollapseMode;
  /** node id → position. Includes compound (parent) nodes when applicable. */
  positions: Record<string, { x: number; y: number }>;
}

function keyFor(graph: Graph, collapseMode: CollapseMode): string {
  // rootDir can contain `:` on Windows-ish paths or `/` everywhere; encode
  // so the prefix split below stays unambiguous.
  return `${KEY_PREFIX}${encodeURIComponent(graph.rootDir)}:${graph.generatedAt}:${collapseMode}`;
}

function safeGetStorage(): Storage | null {
  // SSR / disabled-cookies / private-mode Safari can throw on access.
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Returns a Map of node id → position if a complete, current entry exists,
 * else null. Falsy if any cached node id is missing from the requested
 * graph (we don't try to partially re-layout; fall through to fcose).
 */
export function loadCachedPositions(
  graph: Graph,
  collapseMode: CollapseMode,
): Map<string, { x: number; y: number }> | null {
  const storage = safeGetStorage();
  if (!storage) return null;
  const raw = storage.getItem(keyFor(graph, collapseMode));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedLayout;
    if (parsed.v !== 1) return null;
    if (parsed.rootDir !== graph.rootDir) return null;
    if (parsed.generatedAt !== graph.generatedAt) return null;
    const map = new Map<string, { x: number; y: number }>();
    for (const [id, p] of Object.entries(parsed.positions)) {
      if (typeof p?.x !== "number" || typeof p?.y !== "number") return null;
      map.set(id, { x: p.x, y: p.y });
    }
    return map;
  } catch {
    // Corrupted entry; drop it so the next save replaces it cleanly.
    try {
      storage.removeItem(keyFor(graph, collapseMode));
    } catch {
      /* ignore */
    }
    return null;
  }
}

/**
 * Reads every node's current position out of the cy instance and writes it
 * under the current (graph, collapseMode) key. Also evicts older entries
 * for the same rootDir so localStorage doesn't accumulate stale versions.
 */
export function saveCachedPositions(graph: Graph, collapseMode: CollapseMode, cy: Core): void {
  const storage = safeGetStorage();
  if (!storage) return;
  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of cy.nodes()) {
    const p = n.position();
    positions[n.id()] = { x: p.x, y: p.y };
  }
  const payload: CachedLayout = {
    v: 1,
    rootDir: graph.rootDir,
    generatedAt: graph.generatedAt,
    collapseMode,
    positions,
  };
  const targetKey = keyFor(graph, collapseMode);
  try {
    storage.setItem(targetKey, JSON.stringify(payload));
  } catch {
    // Likely QuotaExceededError on a tiny private-mode origin; give up
    // quietly, the next mount will just re-layout.
    return;
  }
  // Evict older entries for the same rootDir. We can't list-iterate
  // localStorage reactively, so we walk keys() once.
  try {
    const prefix = `${KEY_PREFIX}${encodeURIComponent(graph.rootDir)}:`;
    const drop: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(prefix) && k !== targetKey) {
        // Keep entries for the same generatedAt but a *different* collapse
        // mode; both views are valid for the current parse.
        const samePayload = k.includes(`:${graph.generatedAt}:`);
        if (!samePayload) drop.push(k);
      }
    }
    for (const k of drop) storage.removeItem(k);
  } catch {
    /* ignore eviction failures */
  }
}

/**
 * Apply a position map to the cy instance in a single batch. Returns true
 * if every leaf node found a cached position (i.e. the cache covered the
 * current graph completely). On false, the caller should fall through to a
 * full layout pass.
 *
 * Compound (parent) nodes are positioned automatically by cytoscape from
 * their children's bounds, so a missing parent entry is fine.
 */
export function applyCachedPositions(
  cy: Core,
  positions: Map<string, { x: number; y: number }>,
): boolean {
  let complete = true;
  cy.batch(() => {
    for (const n of cy.nodes()) {
      if (n.isParent()) continue;
      const p = positions.get(n.id());
      if (!p) {
        complete = false;
        continue;
      }
      n.position(p);
    }
  });
  return complete;
}
