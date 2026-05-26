"use client";

import type { Classification, Graph } from "@depmod/types";
import { type ClassificationModes, getSoloClassification } from "./classification-filters";
import { type PathMask, matchesPathMask } from "./path-mask";
import { type ViewFilters, nodeVisible } from "./view-graph";

export interface VisibleCounts {
  /** Visible file/node count after every filter. */
  nodes: number;
  /** Edges where BOTH endpoints are still visible. */
  edges: number;
  /** Cycles whose every node remains visible; surfaces user-relevant cycles. */
  cycles: number;
  /** Total nodes in the graph, for "N of TOTAL" display. */
  totalNodes: number;
  totalEdges: number;
  totalCycles: number;
}

interface ComputeArgs {
  graph: Graph;
  classificationModes: ClassificationModes;
  pathMask: PathMask;
  viewFilters: ViewFilters;
  /**
   * If set, the visible set is hard-restricted to these ids — overriding the
   * classification toggle (so hidden-class neighbours of the focus/blast
   * root still count). The cytoscape canvas applies the same "hard
   * isolation" semantic; this keeps the status bar in lockstep.
   */
  restrictTo?: ReadonlySet<string> | null;
}

/**
 * Count nodes / edges / cycles that survive the current filters. Mirrors the
 * cytoscape canvas's visibility logic (in `applyOverlays`) so the status bar
 * matches what the user actually sees.
 *
 * Visibility rules (in precedence order):
 *   1. Directory filter (`viewFilters.directoryByPath`)  → `nodeVisible(...)`
 *   2. Path-mask include / exclude globs                 → `matchesPathMask(...)`
 *   3. Classification mode === "excluded"                → hidden
 *   4. Solo classification                               → only nodes of that
 *      class are kept; other classifications hidden
 *
 * `dimmed` doesn't hide a node, so it's NOT subtracted here.
 */
export function computeVisibleCounts(args: ComputeArgs): VisibleCounts {
  const { graph, classificationModes, pathMask, viewFilters, restrictTo } = args;
  const soloCls = getSoloClassification(classificationModes);
  const visibleIds = new Set<string>();
  for (const n of graph.nodes) {
    if (restrictTo) {
      // Hard isolation: only nodes in the focus/blast/cycle scope count.
      // Structural cuts (view filters, path mask) still apply because those
      // are explicit "never show this kind of file" choices — but the
      // classification toggle is bypassed (the user asked to see the
      // network around X, and the answer includes hidden-class neighbours).
      if (!restrictTo.has(n.id)) continue;
      if (!nodeVisible(n.id, viewFilters)) continue;
      if (!matchesPathMask(n.id, pathMask, { classification: n.classification })) continue;
      visibleIds.add(n.id);
      continue;
    }
    if (
      !isNodeStillVisible(
        n.id,
        n.classification,
        classificationModes,
        soloCls,
        pathMask,
        viewFilters,
      )
    ) {
      continue;
    }
    visibleIds.add(n.id);
  }

  let edges = 0;
  for (const e of graph.edges) {
    if (visibleIds.has(e.source) && visibleIds.has(e.target)) edges++;
  }

  let cycles = 0;
  for (const cycle of graph.cycles) {
    if (cycle.nodes.every((id) => visibleIds.has(id))) cycles++;
  }

  return {
    nodes: visibleIds.size,
    edges,
    cycles,
    totalNodes: graph.stats.nodes,
    totalEdges: graph.stats.edges,
    totalCycles: graph.stats.cycles,
  };
}

function isNodeStillVisible(
  id: string,
  classification: Classification,
  modes: ClassificationModes,
  solo: Classification | null,
  mask: PathMask,
  viewFilters: ViewFilters,
): boolean {
  if (!nodeVisible(id, viewFilters)) return false;
  if (!matchesPathMask(id, mask, { classification })) return false;
  const mode = modes[classification];
  if (mode === "excluded") return false;
  if (solo && classification !== solo) return false;
  return true;
}
