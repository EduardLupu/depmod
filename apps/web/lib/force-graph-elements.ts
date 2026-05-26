import type { Classification, Graph, Node as GraphNode } from "@depmod/types";
import { type ClassificationModes, getSoloClassification } from "./classification-filters";
import { CLASSIFICATION_COLORS } from "./colors";
import { type PathMask, matchesPathMask } from "./path-mask";
import { type ViewFilters, nodeVisible } from "./view-graph";

export interface ForceGraphNode {
  id: string;
  label: string;
  /** Hex colour applied to the sphere; drives `nodeColor` in react-force-graph. */
  color: string;
  classification: Classification;
  /** Drives `nodeVal`; react-force-graph uses sqrt(val) so a 0..400 range maps to a pleasant ~0..20 radius. */
  val: number;
  /** Whether the node should render dimmed (still visible, but de-emphasised). */
  dimmed: boolean;
}

export interface ForceGraphLink {
  source: string;
  target: string;
  kind: "import" | "type-only" | "dynamic";
  inCycle: boolean;
  dimmed: boolean;
}

export interface ForceGraphData {
  nodes: ForceGraphNode[];
  links: ForceGraphLink[];
}

interface AdapterArgs {
  graph: Graph;
  classificationModes: ClassificationModes;
  pathMask: PathMask;
  viewFilters: ViewFilters;
  /**
   * Node ids that must appear in the output regardless of classification /
   * path-mask filters. Used by the 3D canvas to surface focus/blast
   * neighbours whose classification has been toggled off — matching the
   * "show me the network around X, even across hidden classes" intent.
   * Path mask + view filter exclusions still win because those are explicit
   * structural cuts the user just typed.
   */
  alwaysInclude?: ReadonlySet<string>;
}

/**
 * Convert a `Graph` into the `{ nodes, links }` shape react-force-graph
 * expects. Visibility logic mirrors the Cytoscape canvas: nodes hidden by
 * filters are dropped entirely (3D renderer prefers data-level pruning over
 * per-frame opacity tweaks). `dimmed` nodes/links remain in the graph but
 * carry a flag the canvas uses to lower their opacity.
 *
 * Cycle edges (`inCycle`) are surfaced so the canvas can render them thicker
 * + red, matching the 2D convention.
 */
export function toForceGraphData(args: AdapterArgs): ForceGraphData {
  const { graph, classificationModes, pathMask, viewFilters, alwaysInclude } = args;
  const solo = getSoloClassification(classificationModes);

  // First pass: decide visibility + dim for every node.
  const visibleNodes = new Map<string, ForceGraphNode>();
  for (const n of graph.nodes) {
    const force = alwaysInclude?.has(n.id) ?? false;
    const decision = classifyVisibility(n, classificationModes, solo, pathMask, viewFilters, force);
    if (decision === "hidden") continue;
    visibleNodes.set(n.id, {
      id: n.id,
      label: n.id,
      color: CLASSIFICATION_COLORS[n.classification],
      classification: n.classification,
      val: clampSize(n.loc),
      dimmed: decision === "dimmed",
    });
  }

  // Second pass: edges. Drop any edge whose endpoint was hidden.
  const cycleEdgeKeys = buildCycleEdgeKeys(graph);
  const links: ForceGraphLink[] = [];
  for (const e of graph.edges) {
    const s = visibleNodes.get(e.source);
    const t = visibleNodes.get(e.target);
    if (!s || !t) continue;
    links.push({
      source: e.source,
      target: e.target,
      kind: e.kind,
      inCycle: cycleEdgeKeys.has(`${e.source}|${e.target}`),
      // An edge is dimmed if either endpoint is dimmed.
      dimmed: s.dimmed || t.dimmed,
    });
  }

  return { nodes: Array.from(visibleNodes.values()), links };
}

/**
 * Map every directed edge that participates in a reported cycle to a Set key
 * (`"src|dst"`). Used for `inCycle` flagging in the link adapter.
 */
function buildCycleEdgeKeys(graph: Graph): Set<string> {
  const out = new Set<string>();
  for (const cycle of graph.cycles) {
    const ns = cycle.nodes;
    if (ns.length < 2) continue;
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i] as string;
      const b = (ns[(i + 1) % ns.length] as string) ?? a;
      out.add(`${a}|${b}`);
    }
  }
  return out;
}

function classifyVisibility(
  n: GraphNode,
  modes: ClassificationModes,
  solo: Classification | null,
  mask: PathMask,
  viewFilters: ViewFilters,
  /**
   * When true, the node is part of an active focus/blast neighbourhood. The
   * structural cuts (`viewFilters`, `pathMask`) still apply because those
   * are the user's explicit "never show this kind of file" choices, but the
   * classification toggle (and solo mode) is bypassed: the user asked for
   * the network around X, the answer is "this node is in it".
   */
  force = false,
): "visible" | "dimmed" | "hidden" {
  if (!nodeVisible(n.id, viewFilters)) return "hidden";
  if (!matchesPathMask(n.id, mask, { classification: n.classification })) return "hidden";
  if (force) return "visible";
  const mode = modes[n.classification];
  if (mode === "excluded") return "hidden";
  if (solo && n.classification !== solo) return "hidden";
  if (mode === "dimmed") return "dimmed";
  return "visible";
}

/**
 * Map a raw LOC to a node "value" for force-graph. The library uses sqrt(val)
 * for the radius, so we keep `val ∈ [4, 250]` to bound the visual range;
 * pages with 5k LOC don't dwarf everything else.
 */
function clampSize(loc: number): number {
  if (!Number.isFinite(loc) || loc <= 0) return 4;
  if (loc > 250) return 250;
  return Math.max(4, loc);
}

/**
 * Above this node count, the 3D toggle disables itself with a tooltip.
 * Three.js can handle ~5k nodes at 60 FPS but interactivity (label rendering,
 * picking) tanks beyond that; better UX is to ask the user to filter first.
 */
export const MAX_3D_NODES = 5000;
