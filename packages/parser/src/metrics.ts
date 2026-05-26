import type { Edge, EdgeKind, Metrics } from "@depmod/types";

export interface ComputeMetricsOptions {
  /**
   * Edge kinds to exclude before computing Ca/Ce/instability. Defaults to
   * `["type-only"]`: a TypeScript `import type` declaration is erased at
   * compile time and creates no runtime dependency, so counting it inflates
   * Ce and instability without reflecting a real coupling. Pass `[]` to count
   * every edge kind (used by the parser to populate the on-disk `metrics`
   * field, which preserves the v1 disk format semantics).
   */
  excludeEdgeKinds?: readonly EdgeKind[];
}

const DEFAULT_EXCLUDED_KINDS: readonly EdgeKind[] = ["type-only"];

/**
 * Compute Martin coupling metrics per node:
 *   Ca (afferent)  = number of distinct modules that import this node
 *   Ce (efferent)  = number of distinct modules this node imports
 *   I (instability) = Ce / (Ca + Ce), with the convention I = 0 when Ca + Ce = 0
 *
 * The directed multigraph emitted by the parser may contain two edges between the
 * same (source, target) pair when both a value-level and a type-only import exist
 * (or a static import and a dynamic import). For metrics we collapse multi-edges
 * to a single dependency relation, which matches how a developer thinks about
 * "does A depend on B?" while still preserving multi-edge information on the
 * underlying Graph for visualisation.
 */
export function computeMetrics(
  nodeIds: readonly string[],
  edges: readonly Pick<Edge, "source" | "target" | "kind">[],
  options: ComputeMetricsOptions = {},
): Map<string, Metrics> {
  const excludedKinds = new Set<EdgeKind>(options.excludeEdgeKinds ?? DEFAULT_EXCLUDED_KINDS);
  const idSet = new Set(nodeIds);
  const ca = new Map<string, Set<string>>();
  const ce = new Map<string, Set<string>>();
  for (const id of nodeIds) {
    ca.set(id, new Set());
    ce.set(id, new Set());
  }

  for (const edge of edges) {
    if (excludedKinds.has(edge.kind)) continue;
    // Edges that escape the node universe (e.g. external packages, if ever emitted)
    // are silently ignored. They never should appear, because the parser filters
    // them out before emitting.
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
    const instability = sum === 0 ? 0 : Ce / sum;
    out.set(id, { Ca, Ce, instability });
  }
  return out;
}
