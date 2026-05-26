import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Graph, UnusedDependency } from "@depmod/types";

export type { UnusedDependency };

export interface FindUnusedDepsOptions {
  /**
   * Package names never reported as unused. Defaults cover dev-time tools
   * that legitimately don't appear as imports in source code (test runners,
   * linters, the TS compiler, build tooling).
   */
  extraAllowlist?: readonly string[];
}

/** Dev/build tooling that intentionally lives in package.json without being imported. */
const DEFAULT_ALLOWLIST: ReadonlySet<string> = new Set([
  "typescript",
  "vitest",
  "@biomejs/biome",
  "prettier",
  "eslint",
  // React/Next-ecosystem peers that frameworks inject without an explicit
  // import — `react-dom` is required by React-rendering frameworks but apps
  // rarely import it directly outside the entry point.
  "react-dom",
  "tailwindcss",
  "@tailwindcss/postcss",
  "postcss",
  "autoprefixer",
  "vite",
  "next",
  "@vitejs/plugin-react",
  "tsx",
  "ts-node",
  "esbuild",
  "rollup",
]);

/**
 * Names that match any of these prefixes are never reported. Covers the
 * `@types/*` family — pure type-augmentation packages that are picked up
 * by the TS compiler via the `types` resolution machinery and would never
 * appear as an `import "..."` statement.
 */
const ALLOWLIST_PREFIXES: readonly string[] = ["@types/"];

/**
 * Cross-reference every package.json under `graph.rootDir` against the
 * `externalDependencies` map captured during parsing. Returns the entries
 * declared in package.json but never imported by any source file under that
 * workspace.
 *
 * Caveats: this is a static-import view. Deps consumed via config files,
 * binary CLIs (`tsx`, `vitest`), or runtime `require` will be reported as
 * unused. The allowlist mitigates the common false positives.
 */
export function findUnusedDependencies(
  graph: Graph,
  options: FindUnusedDepsOptions = {},
): UnusedDependency[] {
  const allowlist = new Set([...DEFAULT_ALLOWLIST, ...(options.extraAllowlist ?? [])]);
  const externals = graph.externalDependencies ?? {};

  // Walk package.json files under rootDir.
  const packageJsons = findPackageJsons(graph.rootDir);
  const out: UnusedDependency[] = [];

  for (const pkgPath of packageJsons) {
    const workspaceAbs = pkgPath.slice(0, -"package.json".length).replace(/\/$/, "");
    const workspaceRel = relative(graph.rootDir, workspaceAbs).split(/\\|\//).join("/");

    const declared = readPackageJson(pkgPath);
    if (!declared) continue;

    // Collect specifiers imported from any node inside this workspace.
    const usedHere = new Set<string>();
    for (const [nodeId, specs] of Object.entries(externals)) {
      if (workspaceRel === "" || isInsideWorkspace(nodeId, workspaceRel)) {
        for (const spec of specs) usedHere.add(spec);
      }
    }

    for (const [name, kind] of declared) {
      if (allowlist.has(name)) continue;
      if (ALLOWLIST_PREFIXES.some((p) => name.startsWith(p))) continue;
      if (usedHere.has(name)) continue;
      out.push({ workspace: workspaceRel, name, kind });
    }
  }

  out.sort((a, b) => {
    if (a.workspace !== b.workspace) return a.workspace < b.workspace ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return out;
}

function isInsideWorkspace(nodeId: string, workspaceRel: string): boolean {
  if (workspaceRel === "") return true;
  return nodeId === workspaceRel || nodeId.startsWith(`${workspaceRel}/`);
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".turbo"]);

function findPackageJsons(rootDir: string): string[] {
  const out: string[] = [];
  walk(rootDir, out, 0);
  return out;
}

function walk(dir: string, out: string[], depth: number): void {
  // Hard limit on depth so we don't explore deeply nested workspaces forever.
  if (depth > 6) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walk(abs, out, depth + 1);
    } else if (entry === "package.json") {
      out.push(abs);
    }
  }
}

function readPackageJson(
  absPath: string,
): Array<[string, "dependencies" | "devDependencies"]> | null {
  if (!existsSync(absPath)) return null;
  let raw: string;
  try {
    raw = readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const pkg = parsed as { dependencies?: unknown; devDependencies?: unknown };
  const out: Array<[string, "dependencies" | "devDependencies"]> = [];
  for (const kind of ["dependencies", "devDependencies"] as const) {
    const obj = pkg[kind];
    if (!obj || typeof obj !== "object") continue;
    for (const name of Object.keys(obj as Record<string, unknown>)) {
      out.push([name, kind]);
    }
  }
  return out;
}
