import type { Edge, Graph, Node as GraphNode } from "@depmod/types";

export interface Subtree {
  /** The root node we started from (always included, even if isolated). */
  root: GraphNode;
  /** All nodes reachable from root within `maxDepth` import hops, including root. */
  nodes: GraphNode[];
  /** Edges whose source AND target both fall inside `nodes`. */
  edges: Edge[];
  /** Per-node BFS depth from root (root = 0). */
  depthByNode: Map<string, number>;
  /** True iff the BFS hit `maxDepth` and had additional unexplored frontier. */
  truncated: boolean;
}

/** Max outgoing-import hops in the React Flow subtree view. */
export const DEFAULT_DETAIL_DEPTH = 12;

/**
 * Extract the descendant subtree rooted at `rootId` via outgoing-edge BFS, stopping
 * at `maxDepth` hops. Used to render "what does this page actually pull in?".
 * Edges of every kind (import / type-only / dynamic) count as descent hops.
 *
 * Returns the root node alone (depth = 0) if it has no outgoing edges.
 * Throws if the rootId is not in the graph.
 */
export function extractSubtree(
  graph: Graph,
  rootId: string,
  maxDepth: number = DEFAULT_DETAIL_DEPTH,
): Subtree {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const root = nodesById.get(rootId);
  if (!root) {
    throw new Error(`extractSubtree: rootId not in graph: ${rootId}`);
  }

  // Adjacency list of outgoing edges, deduped by (source, target) since multiple
  // edge kinds between the same pair count as one descent hop.
  const out = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (!out.has(e.source)) out.set(e.source, new Set());
    out.get(e.source)?.add(e.target);
  }

  const depthByNode = new Map<string, number>();
  depthByNode.set(rootId, 0);
  const visited = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const depth = depthByNode.get(current);
    if (depth === undefined) continue;
    if (depth >= maxDepth) {
      // If anything dangling beyond the depth wall exists, mark truncated.
      const neighbours = out.get(current);
      if (neighbours && neighbours.size > 0) {
        for (const n of neighbours) {
          if (!visited.has(n)) {
            truncated = true;
            break;
          }
        }
      }
      continue;
    }
    const neighbours = out.get(current);
    if (!neighbours) continue;
    for (const next of neighbours) {
      if (visited.has(next)) continue;
      if (!nodesById.has(next)) continue;
      visited.add(next);
      depthByNode.set(next, depth + 1);
      queue.push(next);
    }
  }

  const includedIds = visited;
  const nodes = graph.nodes.filter((n) => includedIds.has(n.id));
  const edges = graph.edges.filter((e) => includedIds.has(e.source) && includedIds.has(e.target));

  // Deterministic ordering
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { root, nodes, edges, depthByNode, truncated };
}
