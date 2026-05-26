import type { Classification, EdgeKind, Graph } from "@depmod/types";
import type { ElementDefinition } from "cytoscape";

export interface CyNodeData {
  id: string;
  label: string;
  parent?: string;
  classification: Classification;
  loc: number;
  Ca: number;
  Ce: number;
  instability: number;
  isCompound?: never;
}

export interface CyCompoundData {
  id: string;
  label: string;
  isCompound: true;
}

export interface CyEdgeData {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  inCycle: boolean;
}

/**
 * Convert a parsed Graph into Cytoscape elements. Each module becomes a node,
 * each directory (up to 2 levels deep) becomes a compound parent, and each
 * (source, target, kind) triple becomes an edge. Edges whose endpoints both
 * belong to the same SCC are tagged `inCycle: true` so the stylesheet can paint
 * them red.
 */
export function toCytoscapeElements(graph: Graph): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const parents = new Map<string, CyCompoundData>();

  // Nodes + collect compound parents.
  for (const node of graph.nodes) {
    const parentId = directoryParent(node.id);
    if (parentId) {
      if (!parents.has(parentId)) {
        parents.set(parentId, { id: parentId, label: parentId, isCompound: true });
      }
    }
    const data: CyNodeData = {
      id: node.id,
      label: node.name,
      classification: node.classification,
      loc: node.loc,
      Ca: node.metrics.Ca,
      Ce: node.metrics.Ce,
      instability: node.metrics.instability,
      ...(parentId ? { parent: parentId } : {}),
    };
    elements.push({ group: "nodes", data });
  }

  for (const parent of parents.values()) {
    elements.push({ group: "nodes", data: parent });
  }

  // Tag edges that belong to a cycle (both endpoints in the same SCC).
  const edgeInCycle = new Set<string>();
  for (const cycle of graph.cycles) {
    const set = new Set(cycle.nodes);
    for (const edge of graph.edges) {
      if (set.has(edge.source) && set.has(edge.target)) {
        edgeInCycle.add(edgeKey(edge.source, edge.target, edge.kind));
      }
    }
  }

  for (const edge of graph.edges) {
    const key = edgeKey(edge.source, edge.target, edge.kind);
    const data: CyEdgeData = {
      id: key,
      source: edge.source,
      target: edge.target,
      kind: edge.kind,
      inCycle: edgeInCycle.has(key),
    };
    elements.push({ group: "edges", data });
  }

  return elements;
}

/**
 * Top-2-level directory of a repo-relative POSIX path. Files at the repo root
 * (no directory) return undefined.
 *
 *   "app/page.tsx"               → "app"
 *   "app/api/users/route.ts"     → "app/api"
 *   "packages/parser/src/x.ts"   → "packages/parser"
 *   "README.md"                  → undefined
 */
export function directoryParent(id: string): string | undefined {
  const segs = id.split("/");
  if (segs.length <= 1) return undefined;
  const dirSegs = segs.slice(0, -1);
  return dirSegs.slice(0, 2).join("/");
}

function edgeKey(source: string, target: string, kind: EdgeKind): string {
  return `${source}|${target}|${kind}`;
}
