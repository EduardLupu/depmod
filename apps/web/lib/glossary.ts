/**
 * Single source of truth for in-app definitions.
 *
 * Consumed by:
 *   - <InfoTooltip term="..."/>; hover/focus on a `?` badge anywhere in the UI.
 *   - <LegendPanel/>           ; `?` keyboard shortcut opens the full glossary.
 *
 * Lookup is by stable `id`, NEVER by `term`, so renaming labels in the UI does
 * not break tooltips.
 */

import type { Classification, EdgeKind } from "@depmod/types";
import { CLASSIFICATION_COLORS } from "./colors";

export interface GlossaryEntry {
  id: string;
  term: string;
  /** Short one-liner suitable for a hover tooltip. */
  short: string;
  /** Optional longer description shown in the legend panel only. */
  long?: string;
  /** Optional formula or symbolic definition (rendered in <code>). */
  formula?: string;
  /** Optional swatch colour, in CSS hex. */
  swatch?: string;
}

export interface GlossaryGroup {
  id: string;
  title: string;
  entries: GlossaryEntry[];
}

export const CLASSIFICATION_ENTRIES: Record<Classification, GlossaryEntry> = {
  page: {
    id: "cls.page",
    term: "page",
    short: "Next.js route entry (app/page, layout, pages/*). Canvas shape: rounded rectangle.",
    swatch: CLASSIFICATION_COLORS.page,
  },
  api: {
    id: "cls.api",
    term: "api",
    short: "Server route or HTTP handler. Canvas shape: ◇ (diamond).",
    swatch: CLASSIFICATION_COLORS.api,
  },
  hook: {
    id: "cls.hook",
    term: "hook",
    short: "React hook (use* filename or export). Canvas shape: hexagon, double border.",
    swatch: CLASSIFICATION_COLORS.hook,
  },
  test: {
    id: "cls.test",
    term: "test",
    short:
      "Test/spec/mock paths. Canvas shape: octagon, dashed border. Hidden by default; click the test pill to show.",
    swatch: CLASSIFICATION_COLORS.test,
  },
  component: {
    id: "cls.component",
    term: "component",
    short: "A React component (.tsx, PascalCase export). Canvas shape: ▽ (vee).",
    swatch: CLASSIFICATION_COLORS.component,
  },
  lib: {
    id: "cls.lib",
    term: "lib",
    short: "Utilities and shared code. Canvas shape: rectangle.",
    swatch: CLASSIFICATION_COLORS.lib,
  },
  config: {
    id: "cls.config",
    term: "config",
    short:
      "Build/tooling configuration (*.config.ts, *.d.ts, files under config/). Canvas shape: pentagon, dotted border. Hidden by default; click the config pill to show.",
    swatch: CLASSIFICATION_COLORS.config,
  },
};

const METRIC_ENTRIES = {
  ca: {
    id: "metric.ca",
    term: "Ca (afferent coupling)",
    short: "Number of distinct modules that import this one.",
    long: "High Ca means many things depend on this module; changing it has a wide blast radius. Stable cores (utils, types, design tokens) tend to have high Ca and low Ce.",
  },
  ce: {
    id: "metric.ce",
    term: "Ce (efferent coupling)",
    short: "Number of distinct modules this one imports.",
    long: "High Ce means this module touches many parts of the codebase, which often correlates with cognitive load when reading it. Top-level pages tend to have high Ce.",
  },
  instability: {
    id: "metric.instability",
    term: "Instability (I)",
    short: "I = Ce / (Ca + Ce). 0 = maximally stable, 1 = maximally unstable.",
    formula: "I = Ce / (Ca + Ce)",
    long: "Robert C. Martin's metric. A module with I=0 is a stable foundation (everyone depends on it, it depends on nothing). A module with I=1 is a leaf consumer at the top of the import graph. Mid-tier values often indicate awkward layering.",
  },
  loc: {
    id: "metric.loc",
    term: "LOC",
    short: "Lines of code in the source file (including comments and blank lines).",
  },
  exports: {
    id: "metric.exports",
    term: "Exports",
    short: "Number of distinct exported symbols (named exports + a `default` if present).",
    long: "A rough proxy for a module's public surface area. Modules with many exports often act as barrels or facades; modules with zero exports are imported only for their side-effects (or are unreachable).",
  },
  bundle: {
    id: "metric.bundle",
    term: "Bundle",
    short: "Estimated worst-case bundle size: self + all transitive runtime imports.",
    long: "Walks every non-type-only edge out of this module and sums the bytes. This is an upper bound; real bundlers tree-shake unused exports and split dynamic imports into separate chunks, so production bundles will typically be smaller. Useful as a relative measure to compare modules.",
  },
  cyclesMember: {
    id: "metric.cycles-member",
    term: "Cycles (membership)",
    short: "Number of dependency cycles this module participates in.",
    long: "Most modules belong to zero cycles. A non-zero value here means there's at least one chain of imports that loops back through this file. Click the value to isolate the first cycle on the canvas.",
  },
} satisfies Record<string, GlossaryEntry>;

const EDGE_KIND_ENTRIES: Record<EdgeKind, GlossaryEntry> = {
  import: {
    id: "edge.import",
    term: "import",
    short: "A static value import that executes at runtime. Drawn as a solid line.",
  },
  "type-only": {
    id: "edge.type-only",
    term: "type-only",
    short:
      "A TypeScript `import type` declaration — erased at compile time, no runtime dependency. Drawn as a dashed line.",
    long: "Filtered out of the runtime-only metrics view by default. Toggle the toolbar checkbox to include them.",
  },
  dynamic: {
    id: "edge.dynamic",
    term: "dynamic",
    short:
      "A runtime `import('...')` expression. Loaded on demand, but still a real dependency. Drawn as a dotted line.",
  },
};

const ACTION_ENTRIES = {
  blastRadius: {
    id: "action.blast-radius",
    term: "Blast radius",
    short: "Highlights every upstream module that transitively depends on the selected one.",
    long: "Use this to estimate the cost of changing a module before you change it. Press ⌘B (or Ctrl+B) on a selection to toggle.",
  },
  focusMode: {
    id: "action.focus-mode",
    term: "Focus mode",
    short: "Dims everything outside an N-hop neighborhood of the selected node.",
    long: "Combines outgoing and incoming traversal; what this module touches AND what touches it; so you can navigate a large graph one neighborhood at a time. Press F to toggle; [ and ] adjust depth in [1, 6].",
  },
  cycle: {
    id: "action.cycle",
    term: "Circular dependency",
    short:
      "A strongly-connected component of size ≥ 2 in the import graph. Rendered with red edges.",
    long: "Cycles make modules impossible to load independently and usually indicate a missing seam. Detected via Tarjan's SCC algorithm.",
  },
  reLayout: {
    id: "action.relayout",
    term: "Re-layout",
    short: "Runs a fresh fCoSE force-directed layout pass over the visible nodes.",
  },
  collapseClusters: {
    id: "action.collapse-clusters",
    term: "Collapse clusters",
    short:
      "Render each top-2 directory as a single super-node, with inter-directory edges aggregated by weight.",
    long: "Layout cost drops from O(|files|) toward O(|directories|), so cal.com-sized graphs become tractable. Single-click a cluster to drill in via the directory tree; double-click to expand and pin focus.",
  },
  typeOnlyToggle: {
    id: "action.type-only-toggle",
    term: "Include type-only in metrics",
    short: "When off, Ca/Ce ignore `import type` edges so they reflect runtime coupling.",
    long: "Affects only the Inspector's metric display. The Cytoscape canvas and the React Flow detail view always render the full multigraph.",
  },
  codeViewer: {
    id: "action.code-viewer",
    term: "Code viewer",
    short: "Read-only source for the selected module (Monaco). Requires depmod-ui.",
    long: "Press C to toggle the pane. Selecting a node opens it automatically when serve mode has access to the project files on disk.",
  },
  subtreeView: {
    id: "action.subtree-view",
    term: "Subtree view",
    short: "Hierarchical diagram of everything this module pulls in via outgoing imports (BFS).",
    long: "Replaces the 2D canvas with a React Flow tree rooted at the selected module. Follows import, type-only, and dynamic edges up to 12 hops deep. Press T to toggle.",
  },
} satisfies Record<string, GlossaryEntry>;

export const GLOSSARY: GlossaryEntry[] = [
  ...Object.values(CLASSIFICATION_ENTRIES),
  ...Object.values(METRIC_ENTRIES),
  ...Object.values(EDGE_KIND_ENTRIES),
  ...Object.values(ACTION_ENTRIES),
];

const BY_ID: Map<string, GlossaryEntry> = new Map(GLOSSARY.map((e) => [e.id, e]));

export function lookupGlossaryEntry(id: string): GlossaryEntry | undefined {
  return BY_ID.get(id);
}

export const GLOSSARY_GROUPS: GlossaryGroup[] = [
  {
    id: "classifications",
    title: "Classifications",
    entries: Object.values(CLASSIFICATION_ENTRIES),
  },
  {
    id: "metrics",
    title: "Coupling metrics",
    entries: Object.values(METRIC_ENTRIES),
  },
  {
    id: "edges",
    title: "Edge kinds",
    entries: Object.values(EDGE_KIND_ENTRIES),
  },
  {
    id: "actions",
    title: "Actions & overlays",
    entries: Object.values(ACTION_ENTRIES),
  },
];
