import { existsSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  type Edge,
  type ExternalDependencies,
  type Graph,
  type Node as GraphNode,
  SCHEMA_VERSION,
} from "@depmod/types";
import { Project, type SourceFile, ts } from "ts-morph";
import { type CacheSlice, hashContent, loadCache, saveCache } from "./cache.js";
import { classify } from "./classify.js";
import { findCycles } from "./cycles.js";
import { extractExports } from "./exports.js";
import { type FileFilter, buildFileFilter } from "./file-filter.js";
import { extractEdges } from "./imports.js";
import { PARSER_VERSION } from "./index.js";
import { computeMetrics } from "./metrics.js";
import { findUnusedDependencies } from "./unused-deps.js";
import { loadAliasPatterns } from "./workspace-aliases.js";
import { detectWorkspaces } from "./workspaces.js";

export interface AnalyzeOptions {
  /** Override the `generatedAt` timestamp; used by tests for stable snapshots. */
  now?: Date;
  /** Override the auto-detected tsconfig path. */
  tsConfigFilePath?: string;
  /**
   * Track B.1; file-selection options. When omitted, the legacy behaviour
   * is preserved: gitignore is honoured, the historical baseline dirs are
   * excluded, no extra include/exclude is applied.
   */
  /** Allow-list of POSIX globs anchored at `rootDir`. Empty = include everything. */
  include?: string[];
  /** Exclude globs anchored at `rootDir`. Applied after gitignore, before include. */
  exclude?: string[];
  /** Honour `.gitignore` files. Default: `true`. */
  respectGitignore?: boolean;
  /** Exclude test/spec files at parse time. Default: `false` (tests in graph; hide via UI). */
  excludeTests?: boolean;
  /**
   * Track I; incremental cache. Default `true`. When on, reads any existing
   * `.depmod-cache/slices.json` under `rootDir` and reuses per-file slices
   * for unchanged sources; writes a fresh cache after parsing.
   */
  cache?: boolean;
  /** Receive cache statistics; useful for CLI verbose output / status bar. */
  onCacheStats?: (stats: CacheStats) => void;
}

/** Diagnostics exposed by `analyze()` when the cache is engaged. */
export interface CacheStats {
  /** Whether the cache was consulted on this run. */
  enabled: boolean;
  /** Files whose slice was reused from disk (no AST walk). */
  hits: number;
  /** Files whose slice was extracted via ts-morph (AST walk). */
  misses: number;
  /** Reason the prior cache (if any) was discarded; null on a clean hit-or-miss split. */
  invalidatedReason: "missing" | "version" | "tsconfig" | "file-set" | "corrupt" | null;
}

const DECLARATION_EXTENSION = /\.d\.ts$/;

/**
 * Statically analyze a Next.js / React / monorepo project rooted at `rootDir`.
 * Gitignore-aware, `--include` / `--exclude`-aware, monorepo-workspace-aware.
 * Source-file discovery is layered into a `FileFilter` whose layers can be
 * inspected.
 *
 * Produces a `Graph` conforming to `@depmod/types`. Optional `workspaces`
 * field surfaces detected monorepo packages (see `detectWorkspaces`).
 */
export async function analyze(rootDir: string, options: AnalyzeOptions = {}): Promise<Graph> {
  const absRoot = resolve(rootDir);
  if (!existsSync(absRoot) || !statSync(absRoot).isDirectory()) {
    throw new Error(`analyze: rootDir does not exist or is not a directory: ${absRoot}`);
  }

  const started = performance.now();

  const filter = buildFileFilter({
    rootDir: absRoot,
    respectGitignore: options.respectGitignore ?? true,
    include: options.include,
    exclude: options.exclude,
    excludeTests: options.excludeTests ?? false,
  });

  const tsConfigFilePath = resolveTsConfig(absRoot, options.tsConfigFilePath);
  const project = new Project(
    tsConfigFilePath
      ? { tsConfigFilePath, skipAddingFilesFromTsConfig: true }
      : { compilerOptions: defaultCompilerOptions() },
  );

  // Monorepos commonly declare their `@/*` alias in each workspace's own
  // tsconfig.json, not the root one. ts-morph honours only the single root
  // config, so we collect `compilerOptions.paths` from every detected
  // workspace ourselves and let `extractEdges` fall back to manual
  // resolution. Without this, every `@/components/...` import from
  // `apps/web` would silently fail to resolve and the targets would all
  // appear as dead modules.
  const workspaces = detectWorkspaces({ rootDir: absRoot });
  const aliasPatterns = loadAliasPatterns(
    absRoot,
    workspaces.map((w) => w.path),
  );

  // ts-morph's `addSourceFilesAtPaths` still uses its own glob layer; feed it
  // a broad source-extension glob and let the filter prune afterwards. This is
  // cheap because the post-filter rejects whole subtrees by directory.
  project.addSourceFilesAtPaths([
    `${absRoot}/**/*.ts`,
    `${absRoot}/**/*.tsx`,
    `${absRoot}/**/*.js`,
    `${absRoot}/**/*.jsx`,
    `!${absRoot}/**/node_modules/**`,
    `!${absRoot}/**/.git/**`,
    `!${absRoot}/**/*.d.ts`,
  ]);

  const internal = project
    .getSourceFiles()
    .filter((sf) => isInsideRoot(String(sf.getFilePath()), absRoot))
    .filter((sf) => !DECLARATION_EXTENSION.test(String(sf.getFilePath())))
    .filter((sf) => filter.includesPath(String(sf.getFilePath())));

  const toId = makeIdResolver(internal, absRoot);

  // Track I; load any existing slice cache. Defaults to ON; tests can disable
  // via { cache: false }. The fileSetHash inside `loadCache` invalidates the
  // entire cache on add/rename/delete so cached edges (which carry node ids
  // from the previous run) stay correct.
  const cacheEnabled = options.cache !== false;
  const fileSetIds: string[] = [];
  for (const sf of internal) {
    const id = toId(String(sf.getFilePath()));
    if (id) fileSetIds.push(id);
  }
  const cachedLoad = cacheEnabled
    ? loadCache({
        rootDir: absRoot,
        parserVersion: PARSER_VERSION,
        fileSetIds,
        tsConfigPath: tsConfigFilePath ?? null,
      })
    : ({
        slices: new Map<string, CacheSlice>(),
        invalidatedReason: null,
      } as const satisfies { slices: Map<string, CacheSlice>; invalidatedReason: null });

  const nodes: GraphNode[] = [];
  const edges: Edge[] = [];
  const externalDependencies: ExternalDependencies = {};
  const nextSlices = new Map<string, CacheSlice>();
  let cacheHits = 0;
  let cacheMisses = 0;

  for (const sourceFile of internal) {
    const id = toId(String(sourceFile.getFilePath()));
    if (!id) continue;

    // Read the file content via ts-morph (already in memory after addSourceFilesAtPaths).
    // Hash it and try the cache before forcing an AST walk via extractEdges/extractExports.
    const text = sourceFile.getFullText();
    const contentHash = hashContent(text);
    const cached = cachedLoad.slices.get(id);
    const reused = cached && cached.contentHash === contentHash ? cached : null;

    let slice: CacheSlice;
    if (reused) {
      cacheHits++;
      slice = reused;
    } else {
      cacheMisses++;
      const classification = classify(id, sourceFile);
      const exports = extractExports(sourceFile);
      const loc = countLines(text);
      const bytes = fileBytes(String(sourceFile.getFilePath()), text);
      const extracted = extractEdges(sourceFile, project, toId, aliasPatterns);
      slice = {
        contentHash,
        classification,
        loc,
        bytes,
        exports,
        edges: extracted.edges,
        externals: extracted.externals,
      };
    }
    nextSlices.set(id, slice);

    nodes.push({
      id,
      name: basename(id),
      classification: slice.classification,
      loc: slice.loc,
      bytes: slice.bytes,
      exports: slice.exports,
      // Filled in below by computeMetrics(). Zeros are valid per GraphSchema
      // and serve as the no-edges fallback.
      metrics: { Ca: 0, Ce: 0, instability: 0 },
    });

    edges.push(...slice.edges);
    if (slice.externals.length > 0) {
      externalDependencies[id] = slice.externals;
    }
  }

  if (cacheEnabled) {
    saveCache({
      rootDir: absRoot,
      parserVersion: PARSER_VERSION,
      fileSetIds,
      tsConfigPath: tsConfigFilePath ?? null,
      slices: nextSlices,
      now: options.now,
    });
  }
  options.onCacheStats?.({
    enabled: cacheEnabled,
    hits: cacheHits,
    misses: cacheMisses,
    invalidatedReason: cachedLoad.invalidatedReason,
  });

  // Deterministic ordering (stable across runs).
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  edges.sort((a, b) => {
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    if (a.target !== b.target) return a.target < b.target ? -1 : 1;
    return a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
  });

  const nodeIds = nodes.map((n) => n.id);
  // Two views:
  //   - `metrics`            counts every edge kind, preserves the v1 disk format.
  //   - `metricsRuntimeOnly` excludes type-only edges, since `import type` is
  //                          erased at compile time.
  const allEdgeMetrics = computeMetrics(nodeIds, edges, { excludeEdgeKinds: [] });
  const runtimeOnlyMetrics = computeMetrics(nodeIds, edges);
  for (const node of nodes) {
    const all = allEdgeMetrics.get(node.id);
    if (all) node.metrics = all;
    const runtime = runtimeOnlyMetrics.get(node.id);
    if (runtime) node.metricsRuntimeOnly = runtime;
  }

  const cycles = findCycles(nodeIds, edges);

  const parseMs = Math.round(performance.now() - started);
  const generatedAt = (options.now ?? new Date()).toISOString();

  const partial: Graph = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    rootDir: absRoot,
    stats: {
      files: nodes.length,
      nodes: nodes.length,
      edges: edges.length,
      cycles: cycles.length,
      parseMs,
    },
    nodes,
    edges,
    cycles,
    ...(workspaces.length > 0 ? { workspaces } : {}),
    ...(Object.keys(externalDependencies).length > 0 ? { externalDependencies } : {}),
  };

  // Compute unused dependencies once at analyze-time so the web UI can render
  // the Health panel without filesystem access. Skipped when no external
  // imports were captured (nothing to compare against).
  const unusedDependencies =
    Object.keys(externalDependencies).length > 0 ? findUnusedDependencies(partial) : [];
  if (unusedDependencies.length > 0) {
    partial.unusedDependencies = unusedDependencies;
  }

  return partial;
}

function resolveTsConfig(rootDir: string, override?: string): string | undefined {
  if (override) {
    const abs = isAbsolute(override) ? override : resolve(rootDir, override);
    return existsSync(abs) ? abs : undefined;
  }
  const candidates = ["tsconfig.json", "tsconfig.base.json"];
  for (const name of candidates) {
    const abs = resolve(rootDir, name);
    if (existsSync(abs)) return abs;
  }
  return undefined;
}

function defaultCompilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    esModuleInterop: true,
    skipLibCheck: true,
    isolatedModules: true,
    resolveJsonModule: true,
  };
}

function isInsideRoot(absPath: string, absRoot: string): boolean {
  const rel = relative(absRoot, absPath);
  return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
}

function makeIdResolver(files: SourceFile[], absRoot: string) {
  const cache = new Map<string, string>();
  const allowed = new Set<string>(files.map((f) => String(f.getFilePath())));
  return (absPath: string): string | undefined => {
    if (!allowed.has(absPath)) return undefined;
    const cached = cache.get(absPath);
    if (cached !== undefined) return cached;
    const rel = relative(absRoot, absPath).split(sep).join("/");
    cache.set(absPath, rel);
    return rel;
  };
}

function basename(posixPath: string): string {
  const idx = posixPath.lastIndexOf("/");
  return idx === -1 ? posixPath : posixPath.slice(idx + 1);
}

function fileBytes(absPath: string, fallbackText: string): number {
  // Prefer the real on-disk size; fall back to the UTF-8 byte length of the
  // ts-morph text buffer if the stat fails (e.g. virtual / in-memory file).
  try {
    return statSync(absPath).size;
  } catch {
    return Buffer.byteLength(fallbackText, "utf8");
  }
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  // Trailing newline shouldn't add a phantom blank line.
  if (text.charCodeAt(text.length - 1) === 10) count--;
  return count;
}

/** Re-export so callers can use `FileFilter` from a single entry point. */
export type { FileFilter };
