import type { Graph } from "@depmod/types";

export interface BlastRadius {
  /** The node we started from (depth 0 if it exists in the graph). */
  rootId: string;
  /** Map from impacted node id → BFS depth (0 = root, 1 = direct dependents, …). */
  depthByNode: Map<string, number>;
  /** Total impacted modules including the root. */
  size: number;
  /** Maximum BFS depth reached. */
  maxDepth: number;
}

/**
 * "If I change this module, what else might break?"; reverse-BFS from `rootId`
 * over the import graph. A module v is in the blast radius if there is a path
 * `v ⇢ … ⇢ rootId` of imports. The root itself is included at depth 0.
 *
 * Multi-edges between the same (source, target) pair collapse to one adjacency,
 * so blast radius is purely a function of the directed dependency relation.
 *
 * Does not throw if `rootId` is not in the graph; returns an empty radius. The
 * UI is the only caller and shouldn't crash on a stale selection id.
 */
export function computeBlastRadius(graph: Graph, rootId: string, maxDepth?: number): BlastRadius {
  const depthByNode = new Map<string, number>();
  if (!graph.nodes.some((n) => n.id === rootId)) {
    return { rootId, depthByNode, size: 0, maxDepth: 0 };
  }

  // Reverse adjacency: target → unique sources.
  const reverse = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (!reverse.has(edge.target)) reverse.set(edge.target, new Set());
    reverse.get(edge.target)!.add(edge.source);
  }

  depthByNode.set(rootId, 0);
  const queue: string[] = [rootId];
  let maxObservedDepth = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth = depthByNode.get(current)!;
    if (maxDepth !== undefined && depth >= maxDepth) continue;
    const upstream = reverse.get(current);
    if (!upstream) continue;
    for (const next of upstream) {
      if (depthByNode.has(next)) continue;
      depthByNode.set(next, depth + 1);
      if (depth + 1 > maxObservedDepth) maxObservedDepth = depth + 1;
      queue.push(next);
    }
  }

  return {
    rootId,
    depthByNode,
    size: depthByNode.size,
    maxDepth: maxObservedDepth,
  };
}

export const EMPTY_BLAST_RADIUS: BlastRadius = {
  rootId: "",
  depthByNode: new Map(),
  size: 0,
  maxDepth: 0,
};
