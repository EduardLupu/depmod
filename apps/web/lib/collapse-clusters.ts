import type { Graph } from "@depmod/types";
import type { ElementDefinition } from "cytoscape";
import { directoryParent } from "./cytoscape-elements";

export interface CollapsedNodeData {
  /** Either a directory path ("apps/web") or, for repo-root files, the file id itself. */
  id: string;
  label: string;
  /** True for aggregated directory super-nodes; false for repo-root file pass-throughs. */
  isCluster: boolean;
  /** Number of underlying source files in this cluster. */
  fileCount: number;
  /** Sum of LOC across underlying files. */
  loc: number;
  /** Ids of underlying nodes; useful for "drill in" affordances. */
  childIds: readonly string[];
}

export interface CollapsedEdgeData {
  id: string;
  source: string;
  target: string;
  /** Number of underlying edges aggregated into this one. */
  weight: number;
}

/**
 * Render the graph as a "collapsed clusters" element set.
 *
 * Every internal node is bucketed into its top-2-level directory (matching the
 * compound parent semantics of the expanded view). Each bucket becomes a single
 * super-node sized by the aggregate file count and LOC. Files at the repo
 * root (no directory parent) survive as their own pass-through nodes. Edges
 * are aggregated by (source-cluster, target-cluster); intra-cluster edges
 * are dropped, multi-edges are collapsed, and the resulting edge carries a
 * `weight` that the canvas stylesheet can use for line thickness.
 *
 * Layout cost drops from O(|nodes|) toward O(|directories|), so cal.com-sized
 * graphs are tractable.
 */
export function toCollapsedElements(graph: Graph): ElementDefinition[] {
  const clusterOf = new Map<string, string>();
  const clusters = new Map<
    string,
    { id: string; isCluster: boolean; fileCount: number; loc: number; childIds: string[] }
  >();

  for (const node of graph.nodes) {
    const dir = directoryParent(node.id);
    const clusterId = dir ?? node.id;
    clusterOf.set(node.id, clusterId);
    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, {
        id: clusterId,
        isCluster: dir !== undefined,
        fileCount: 0,
        loc: 0,
        childIds: [],
      });
    }
    const agg = clusters.get(clusterId);
    if (!agg) continue;
    agg.fileCount += 1;
    agg.loc += node.loc;
    agg.childIds.push(node.id);
  }

  // Aggregate edges by (source-cluster, target-cluster). Drop intra-cluster
  // edges; they vanish when the cluster is one super-node.
  const edgeWeights = new Map<string, { source: string; target: string; weight: number }>();
  for (const edge of graph.edges) {
    const src = clusterOf.get(edge.source);
    const tgt = clusterOf.get(edge.target);
    if (!src || !tgt) continue;
    if (src === tgt) continue;
    const key = `${src}|${tgt}`;
    const existing = edgeWeights.get(key);
    if (existing) {
      existing.weight += 1;
    } else {
      edgeWeights.set(key, { source: src, target: tgt, weight: 1 });
    }
  }

  // Deterministic ordering helps with snapshot tests and stable layout seeds.
  const sortedClusters = [...clusters.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const sortedEdges = [...edgeWeights.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return a.target < b.target ? -1 : 1;
  });

  const elements: ElementDefinition[] = [];
  for (const c of sortedClusters) {
    const label = c.isCluster ? c.id.split("/").pop() || c.id : c.id;
    const data: CollapsedNodeData = {
      id: c.id,
      label,
      isCluster: c.isCluster,
      fileCount: c.fileCount,
      loc: c.loc,
      childIds: c.childIds.sort(),
    };
    elements.push({ group: "nodes", data });
  }
  for (const e of sortedEdges) {
    const data: CollapsedEdgeData = {
      id: `${e.source}|${e.target}`,
      source: e.source,
      target: e.target,
      weight: e.weight,
    };
    elements.push({ group: "edges", data });
  }
  return elements;
}
