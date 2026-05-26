import { isNodeUnderDirectory } from "./directory-tree";
import type { Edge, EdgeKind, Graph, Metrics, Node } from "@depmod/types";
export type DirectoryVisibility = "neutral" | "excluded" | "included";

export interface ViewFilters {
  /** Per-directory visibility; longest matching prefix wins for each node. */
  directoryByPath: Record<string, DirectoryVisibility>;
}

export const DEFAULT_VIEW_FILTERS: ViewFilters = {
  directoryByPath: {},
};

/**
 * View-time subgraph filter. Never calls the parser; operates on the
 * canonical in-memory graph only.
 */
export function filterGraphView(fullGraph: Graph, filters: ViewFilters): Graph {
  const keptIds = new Set<string>();
  for (const node of fullGraph.nodes) {
    if (nodeVisible(node.id, filters)) keptIds.add(node.id);
  }

  const nodes = fullGraph.nodes.filter((n) => keptIds.has(n.id));
  const edges = fullGraph.edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));
  const metricsFull = computeViewMetrics(
    nodes.map((n) => n.id),
    edges,
    [],
  );
  const metricsRuntime = computeViewMetrics(
    nodes.map((n) => n.id),
    edges,
    ["type-only"],
  );

  const nodesWithMetrics: Node[] = nodes.map((n) => ({
    ...n,
    metrics: metricsFull.get(n.id) ?? n.metrics,
    metricsRuntimeOnly: metricsRuntime.get(n.id) ?? n.metricsRuntimeOnly,
  }));

  const cycles = fullGraph.cycles.filter((c) => c.nodes.every((id) => keptIds.has(id)));

  return {
    ...fullGraph,
    nodes: nodesWithMetrics,
    edges,
    cycles,
    stats: {
      ...fullGraph.stats,
      nodes: nodesWithMetrics.length,
      edges: edges.length,
      cycles: cycles.length,
      files: nodesWithMetrics.length,
    },
  };
}

export function nodeVisible(nodeId: string, filters: ViewFilters): boolean {
  const includedRoots = pathsWithVisibility(filters.directoryByPath, "included");
  const excludedRoots = pathsWithVisibility(filters.directoryByPath, "excluded");

  if (excludedRoots.some((p) => isNodeUnderDirectory(nodeId, p))) return false;

  if (includedRoots.length > 0) {
    return includedRoots.some((p) => isNodeUnderDirectory(nodeId, p));
  }

  const explicit = effectiveDirectoryVisibility(nodeId, filters.directoryByPath);
  if (explicit === "excluded") return false;
  return true;
}

function pathsWithVisibility(
  directoryByPath: Record<string, DirectoryVisibility>,
  target: DirectoryVisibility,
): string[] {
  return Object.entries(directoryByPath)
    .filter(([, v]) => v === target)
    .map(([p]) => p);
}

function effectiveDirectoryVisibility(
  nodeId: string,
  directoryByPath: Record<string, DirectoryVisibility>,
): DirectoryVisibility {
  let best: DirectoryVisibility = "neutral";
  let bestLen = -1;
  for (const [path, vis] of Object.entries(directoryByPath)) {
    if (vis === "neutral") continue;
    if (!isNodeUnderDirectory(nodeId, path) && nodeId !== path) continue;
    if (path.length > bestLen) {
      bestLen = path.length;
      best = vis;
    }
  }
  return best;
}

/** Client-safe coupling recompute on the visible edge set. */
function computeViewMetrics(
  nodeIds: readonly string[],
  edges: readonly Pick<Edge, "source" | "target" | "kind">[],
  excludeEdgeKinds: readonly EdgeKind[],
): Map<string, Metrics> {
  const excluded = new Set(excludeEdgeKinds);
  const idSet = new Set(nodeIds);
  const ca = new Map<string, Set<string>>();
  const ce = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    ca.set(id, new Set());
    ce.set(id, new Set());
  }
  for (const edge of edges) {
    if (excluded.has(edge.kind)) continue;
    if (!idSet.has(edge.source) || !idSet.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    ca.get(edge.target)?.add(edge.source);
    ce.get(edge.source)?.add(edge.target);
  }
  const out = new Map<string, Metrics>();
  for (const id of nodeIds) {
    const Ca = ca.get(id)?.size ?? 0;
    const Ce = ce.get(id)?.size ?? 0;
    const sum = Ca + Ce;
    out.set(id, { Ca, Ce, instability: sum === 0 ? 0 : Ce / sum });
  }
  return out;
}

/** Cycle directory filter state: neutral → excluded → included → neutral. */
export function cycleDirectoryVisibility(
  current: DirectoryVisibility | undefined,
): DirectoryVisibility {
  if (!current || current === "neutral") return "excluded";
  if (current === "excluded") return "included";
  return "neutral";
}
