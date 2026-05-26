import type { Edge, Graph, Node as GraphNode, UnusedDependency } from "@depmod/types";

/**
 * Why a module was flagged as dead. Kept in sync with the parser's
 * `DeadKind` (`packages/parser/src/dead-code.ts`); see comment in this file
 * about avoiding a runtime dep on the parser package.
 */
export type DeadKind = "unreferenced" | "runtime-only-type" | "no-exports" | "empty";

export interface DeadModule {
  id: string;
  kinds: DeadKind[];
}

export interface FrontendHealth {
  deadModules: readonly DeadModule[];
  unusedDeps: readonly UnusedDependency[];
}

/**
 * Dead-module substrings; mirrored from the parser's default allowlist. The
 * web app loads only `@depmod/types` (not the parser), so the rule set is
 * duplicated here. Comment in both files reminds future tweakers to keep
 * them in sync.
 */
const ALLOWLIST: readonly string[] = [
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
  ".d.ts",
  "/_app.",
  "/_document.",
  "/layout.tsx",
  "/layout.ts",
  "/error.tsx",
  "/not-found.tsx",
  "/loading.tsx",
  "/template.tsx",
];

const DEFAULT_MIN_LOC = 3;

/**
 * Browser port of `findDeadCode`. A module is dead if it trips at least one
 * of: unreferenced (Ca=0), runtime-only-type (all incoming edges erased),
 * no-exports, empty. Pages / APIs / configs and convention files are exempt.
 */
export function findDeadModules(graph: Graph): DeadModule[] {
  const incomingByTarget = buildIncomingIndex(graph.edges);
  const out: DeadModule[] = [];
  for (const node of graph.nodes) {
    if (isProtected(node)) continue;
    const kinds = classifyDead(node, incomingByTarget.get(node.id) ?? []);
    if (kinds.length === 0) continue;
    out.push({ id: node.id, kinds });
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

function buildIncomingIndex(edges: readonly Edge[]): Map<string, Edge[]> {
  const out = new Map<string, Edge[]>();
  for (const e of edges) {
    const list = out.get(e.target);
    if (list) list.push(e);
    else out.set(e.target, [e]);
  }
  return out;
}

function isProtected(node: GraphNode): boolean {
  // Mirrors the parser: framework entries (page/api), runtime-loaded conventions
  // (config), and test-runner-loaded files (test) all have Ca = 0 by design;
  // they're never imported by another module.
  if (node.classification === "page" || node.classification === "api") return true;
  if (node.classification === "config") return true;
  if (node.classification === "test") return true;
  const idLower = `/${node.id.toLowerCase()}`;
  for (const p of ALLOWLIST) {
    if (idLower.includes(p)) return true;
  }
  return false;
}

function classifyDead(node: GraphNode, incoming: readonly Edge[]): DeadKind[] {
  const kinds: DeadKind[] = [];
  // Mirrors the parser; Ca counts unique sources, edges count occurrences;
  // we want the user-visible Ca for the "unreferenced" decision.
  if (node.metrics.Ca === 0) {
    kinds.push("unreferenced");
  } else if (incoming.length > 0 && incoming.every((e) => e.kind === "type-only")) {
    kinds.push("runtime-only-type");
  }
  if (node.exports.length === 0) kinds.push("no-exports");
  if (node.loc < DEFAULT_MIN_LOC) kinds.push("empty");
  return kinds;
}

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

export function deadKindDescription(kind: DeadKind): string {
  switch (kind) {
    case "unreferenced":
      return "Nothing in the graph imports this module.";
    case "runtime-only-type":
      return "Imported only via `import type`; erased at compile time, contributes nothing at runtime.";
    case "no-exports":
      return "Declares no exported symbols. Importing it would be a no-op aside from side effects.";
    case "empty":
      return "Fewer than 3 lines of code. Likely a stub left over from a refactor.";
  }
}

export function summarizeHealth(graph: Graph): FrontendHealth {
  return {
    deadModules: findDeadModules(graph),
    unusedDeps: graph.unusedDependencies ?? [],
  };
}
