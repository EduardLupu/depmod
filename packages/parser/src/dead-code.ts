import type { Edge, Graph, Node as GraphNode } from "@depmod/types";

/**
 * Why a module was flagged as dead. Surfaced in the UI so users can tell a
 * tree-shakeable empty file from a real unreachable module.
 *
 *  - `unreferenced`; `Ca = 0`. Nothing in the graph imports this module.
 *  - `runtime-only-type`; every incoming edge is `type-only`; the file is
 *    erased at compile time and contributes nothing to the runtime bundle.
 *  - `no-exports`; file declares no exported symbols. Cannot be imported in
 *    any useful way, even if a stray `import "./side-effect"` exists.
 *  - `empty`; `loc < MIN_LOC`. Likely a stub left over from a refactor.
 */
export type DeadKind = "unreferenced" | "runtime-only-type" | "no-exports" | "empty";

export interface DeadModule {
  id: string;
  kinds: DeadKind[];
}

export interface FindDeadCodeOptions {
  /**
   * Additional path patterns (lower-cased, applied to `node.id`) that should
   * never be reported as dead even if Ca = 0. Each pattern is matched as a
   * substring against the lower-cased id. The defaults already cover Next.js,
   * tailwind, vite, vitest, postcss, and Storybook config files.
   */
  extraAllowlist?: readonly string[];
  /** Files with fewer than this many lines are flagged as `empty`. Default 3. */
  minLoc?: number;
}

const DEFAULT_MIN_LOC = 3;

/**
 * Default substrings; if a node's id (lower-cased) contains any of these,
 * it is excluded from the dead-code report. These are the files that
 * frameworks load by convention without any explicit import.
 *
 * Patterns starting with `/` match basenames at the repo root too; we prefix
 * the lower-cased id with `/` before testing.
 */
const DEFAULT_ALLOWLIST: readonly string[] = [
  ".config.",
  "/next.config.",
  "/tailwind.config.",
  "/postcss.config.",
  "/vite.config.",
  "/vitest.config.",
  "/jest.config.",
  "/biome.json",
  "/playwright.config.",
  "/eslint.config.",
  ".storybook/",
  "/middleware.ts",
  "/middleware.tsx",
  "/middleware.js",
  // Type declarations: `.d.ts` files exist solely to satisfy the type-checker.
  // They're effectively "runtime-dead" by design; don't surface them.
  ".d.ts",
  // Vite/Next entry shims that don't have a Ca but ARE the bundler entry.
  "/_app.",
  "/_document.",
  "/layout.tsx",
  "/layout.ts",
  "/error.tsx",
  "/not-found.tsx",
  "/loading.tsx",
  "/template.tsx",
];

/**
 * Detect dead modules across four heuristics. Each result carries the list of
 * rules it tripped (a node can match more than one; e.g. an empty file with
 * no exports). Ordering: lowest id first for deterministic output.
 *
 * **What this is NOT.** Static heuristics; will miss dynamic require/resolve
 * patterns, plugins that load files by string lookup, and CLI entry points.
 * The Inspector surfaces a caveat tooltip to set expectations.
 */
export function findDeadCode(graph: Graph, options: FindDeadCodeOptions = {}): DeadModule[] {
  const allowlist = [...DEFAULT_ALLOWLIST, ...(options.extraAllowlist ?? [])].map((p) =>
    p.toLowerCase(),
  );
  const minLoc = options.minLoc ?? DEFAULT_MIN_LOC;
  const incomingByTarget = buildIncomingIndex(graph.edges);

  const out: DeadModule[] = [];
  for (const node of graph.nodes) {
    if (isProtected(node, allowlist)) continue;
    const kinds = classifyDead(node, incomingByTarget.get(node.id) ?? EMPTY_EDGES, minLoc);
    if (kinds.length === 0) continue;
    out.push({ id: node.id, kinds });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * Legacy id-only output for older call-sites (`runCheck`, the CLI). Wraps
 * `findDeadCode` and flattens to a string list; matches the original API so
 * existing tests / consumers don't break.
 */
export function findDeadCodeIds(graph: Graph, options: FindDeadCodeOptions = {}): string[] {
  return findDeadCode(graph, options).map((d) => d.id);
}

const EMPTY_EDGES: readonly Edge[] = [];

function buildIncomingIndex(edges: readonly Edge[]): Map<string, Edge[]> {
  const out = new Map<string, Edge[]>();
  for (const e of edges) {
    const list = out.get(e.target);
    if (list) list.push(e);
    else out.set(e.target, [e]);
  }
  return out;
}

function isProtected(node: GraphNode, allowlist: readonly string[]): boolean {
  // Framework entry points (pages, API routes) and convention files (config,
  // test) are loaded by the runtime/test-runner, not by another module's
  // import. Their Ca is naturally 0; flagging them as dead is a false
  // positive every time.
  if (node.classification === "page" || node.classification === "api") return true;
  if (node.classification === "config") return true;
  if (node.classification === "test") return true;
  const idLower = `/${node.id.toLowerCase()}`;
  for (const pattern of allowlist) {
    if (idLower.includes(pattern)) return true;
  }
  return false;
}

function classifyDead(node: GraphNode, incoming: readonly Edge[], minLoc: number): DeadKind[] {
  const kinds: DeadKind[] = [];
  // Use the precomputed `Ca` metric for "unreferenced" so the result matches
  // what the Inspector / metrics report show. `incoming.length` could diverge
  // from Ca when a single source contributes multiple edge kinds to the same
  // target; Ca counts unique sources, not edges.
  if (node.metrics.Ca === 0) {
    kinds.push("unreferenced");
  } else if (incoming.length > 0 && incoming.every((e) => e.kind === "type-only")) {
    kinds.push("runtime-only-type");
  }
  if (node.exports.length === 0) kinds.push("no-exports");
  if (node.loc < minLoc) kinds.push("empty");
  // Stable order: unreferenced > runtime-only-type > no-exports > empty.
  return kinds;
}

/** Human-readable label for a DeadKind, used by UIs that show a chip per kind. */
export function deadKindLabel(kind: DeadKind): string {
  switch (kind) {
    case "unreferenced":
      return "unreferenced";
    case "runtime-only-type":
      return "type-only";
    case "no-exports":
      return "no exports";
    case "empty":
      return "empty";
  }
}
