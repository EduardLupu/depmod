import type { Edge, Graph } from "@depmod/types";

/**
 * Per-node metrics that aren't part of the Graph schema; derived on demand
 * for the Inspector. Kept in a small dedicated module so the math is
 * unit-testable without dragging in React.
 */

/**
 * Index outgoing edges per source so transitive walks (bundle size) are O(E)
 * instead of O(N * E). Skip type-only edges by default; they're erased at
 * compile time and don't contribute to the runtime bundle.
 */
export interface OutgoingIndex {
  /** source id → list of target ids reachable via a runtime edge. */
  byId: Map<string, string[]>;
}

/**
 * Build the index. `excludeTypeOnly` (default `true`) drops `type-only` edges,
 * matching the Inspector's "runtime" metric view.
 */
export function buildOutgoingIndex(
  edges: readonly Edge[],
  options: { excludeTypeOnly?: boolean } = {},
): OutgoingIndex {
  const excludeTypeOnly = options.excludeTypeOnly ?? true;
  const byId = new Map<string, string[]>();
  for (const edge of edges) {
    if (excludeTypeOnly && edge.kind === "type-only") continue;
    let list = byId.get(edge.source);
    if (!list) {
      list = [];
      byId.set(edge.source, list);
    }
    list.push(edge.target);
  }
  return { byId };
}

export interface BundleEstimate {
  /** Number of unique modules reachable from `rootId` (including itself). */
  modules: number;
  /** Sum of `bytes` across those modules. `0` when no node carries a `bytes` field. */
  bytes: number;
  /** True when every reachable node had a `bytes` value (no fall-back zeros). */
  bytesKnown: boolean;
}

/**
 * Compute an upper-bound transitive bundle estimate for `rootId`: sum of
 * `bytes` over self + every runtime descendant, deduped. This is what would
 * ship in a worst-case bundler pass that pulls in *everything* reachable;
 * real bundlers tree-shake unused exports and split dynamic imports, so the
 * real number is typically smaller.
 *
 * Cycle-safe (visited set). Returns `{ modules: 0, bytes: 0, bytesKnown: false }`
 * if `rootId` is not in the graph.
 */
export function estimateBundleSize(
  graph: Graph,
  rootId: string,
  index: OutgoingIndex,
): BundleEstimate {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  if (!nodesById.has(rootId)) return { modules: 0, bytes: 0, bytesKnown: false };

  const visited = new Set<string>();
  const stack: string[] = [rootId];
  let bytes = 0;
  let bytesKnown = true;
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || visited.has(id)) continue;
    visited.add(id);
    const node = nodesById.get(id);
    if (!node) continue;
    if (typeof node.bytes === "number") {
      bytes += node.bytes;
    } else {
      bytesKnown = false;
    }
    const targets = index.byId.get(id);
    if (targets) {
      for (const t of targets) {
        if (!visited.has(t)) stack.push(t);
      }
    }
  }
  return { modules: visited.size, bytes, bytesKnown };
}

/**
 * Build a quick lookup table: nodeId → list of cycle indices the node
 * participates in. Most nodes are in zero cycles; doing this once per graph
 * keeps the Inspector's "Cycles" metric O(1) per selection.
 */
export function buildCycleMembership(
  cycles: ReadonlyArray<{ nodes: readonly string[] }>,
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  cycles.forEach((cycle, idx) => {
    for (const id of cycle.nodes) {
      let list = out.get(id);
      if (!list) {
        list = [];
        out.set(id, list);
      }
      list.push(idx);
    }
  });
  return out;
}
