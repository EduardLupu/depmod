import type { Graph } from "@depmod/types";

export interface FocusNeighborhood {
  /** The root node of the focus. Always included at depth 0. */
  rootId: string;
  /** Map from node id → BFS depth from root. Root is 0. */
  depthByNode: Map<string, number>;
  /** Total nodes in the neighborhood (including the root). */
  size: number;
  /** Maximum BFS depth actually reached (may be < maxDepth on small graphs). */
  maxObservedDepth: number;
}

export const FOCUS_MODE_DEFAULT_DEPTH = 2;
export const FOCUS_MODE_MIN_DEPTH = 1;
export const FOCUS_MODE_MAX_DEPTH = 6;

/**
 * Compute the N-hop neighborhood of a node in the import graph.
 *
 * Combines:
 *   - outgoing BFS  (what does this module pull in?)
 *   - incoming BFS  (what depends on this module?)
 *
 * Both treat the directed multigraph as a simple undirected adjacency for
 * traversal; multi-edges between the same (source, target) collapse to one
 * hop, and edge kinds (import / type-only / dynamic) are all traversable.
 *
 * Returns an empty neighborhood if `rootId` is not in the graph (the UI
 * shouldn't crash on a stale selection).
 */
export function computeFocusNeighborhood(
  graph: Graph,
  rootId: string,
  depth: number = FOCUS_MODE_DEFAULT_DEPTH,
): FocusNeighborhood {
  if (!graph.nodes.some((n) => n.id === rootId)) {
    return { rootId, depthByNode: new Map(), size: 0, maxObservedDepth: 0 };
  }

  const out = new Map<string, Set<string>>();
  const inc = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!out.has(edge.source)) out.set(edge.source, new Set());
    out.get(edge.source)!.add(edge.target);
    if (!inc.has(edge.target)) inc.set(edge.target, new Set());
    inc.get(edge.target)!.add(edge.source);
  }

  const clampedDepth = Math.max(
    FOCUS_MODE_MIN_DEPTH,
    Math.min(FOCUS_MODE_MAX_DEPTH, Math.trunc(depth)),
  );

  const depthByNode = new Map<string, number>();
  depthByNode.set(rootId, 0);
  const queue: string[] = [rootId];
  let maxObservedDepth = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depthByNode.get(current)!;
    if (currentDepth >= clampedDepth) continue;

    const neighbours = new Set<string>([...(out.get(current) ?? []), ...(inc.get(current) ?? [])]);
    for (const next of neighbours) {
      if (depthByNode.has(next)) continue;
      depthByNode.set(next, currentDepth + 1);
      if (currentDepth + 1 > maxObservedDepth) maxObservedDepth = currentDepth + 1;
      queue.push(next);
    }
  }

  return {
    rootId,
    depthByNode,
    size: depthByNode.size,
    maxObservedDepth,
  };
}

export function clampFocusDepth(depth: number): number {
  if (!Number.isFinite(depth)) return FOCUS_MODE_DEFAULT_DEPTH;
  return Math.max(FOCUS_MODE_MIN_DEPTH, Math.min(FOCUS_MODE_MAX_DEPTH, Math.trunc(depth)));
}
