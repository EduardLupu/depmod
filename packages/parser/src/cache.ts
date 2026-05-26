import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Classification, Edge, Export } from "@depmod/types";

/**
 * Content-addressed cache of per-file analysis slices. Used by `analyze()`
 * to skip the ts-morph AST walks on files whose contents haven't changed;
 * the difference between a 3-second cold re-parse and a 200 ms warm one.
 *
 * Cache lives at `<rootDir>/.depmod-cache/slices.json`. Single file (not
 * one-per-slice) so we don't smear the filesystem with hundreds of tiny IO ops.
 *
 * Invalidation semantics; all whole-cache:
 *   1. `parserVersion` mismatch (we bumped the algorithm)
 *   2. `tsConfigHash` mismatch (module resolution changed underfoot)
 *   3. `fileSetHash` mismatch (a file was renamed / added / removed)
 *
 * Per-file invalidation: `contentHash` mismatch.
 *
 * Slices are versionless (v field on the manifest is enough); add fields to
 * the slice freely; older runs simply re-extract.
 */

const SLICE_DIR = ".depmod-cache";
const SLICE_FILE = "slices.json";
const MANIFEST_VERSION = 1 as const;

/**
 * Everything we extract per source file that depends ONLY on that file's
 * contents and the current tsconfig-resolved module map. Cross-cutting
 * derivations (cycles, metrics, unused-deps) are recomputed from the
 * assembled slices on every run; they're cheap relative to AST parsing.
 */
export interface CacheSlice {
  contentHash: string;
  classification: Classification;
  loc: number;
  bytes: number;
  exports: Export[];
  /** Edges where THIS file is the source. Target ids are project-relative. */
  edges: Edge[];
  externals: string[];
}

interface CacheManifest {
  v: typeof MANIFEST_VERSION;
  parserVersion: string;
  tsConfigHash: string | null;
  fileSetHash: string;
  generatedAt: string;
  /** Keyed by graph node id (relative POSIX path from rootDir). */
  slices: Record<string, CacheSlice>;
}

export interface CacheLoadResult {
  /** Slices keyed by node id. Empty when the cache was invalidated. */
  slices: Map<string, CacheSlice>;
  /** Diagnostic: why the existing cache (if any) was discarded. */
  invalidatedReason: "missing" | "version" | "tsconfig" | "file-set" | "corrupt" | null;
}

export interface CacheLoadOptions {
  rootDir: string;
  parserVersion: string;
  /** Project-relative POSIX ids of every file in this analyze run. Used to detect file-set changes. */
  fileSetIds: readonly string[];
  /** Absolute path to the active tsconfig, or null when running with defaults. */
  tsConfigPath: string | null;
}

export function loadCache(opts: CacheLoadOptions): CacheLoadResult {
  const filePath = sliceFilePath(opts.rootDir);
  if (!existsSync(filePath)) return { slices: new Map(), invalidatedReason: "missing" };
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return { slices: new Map(), invalidatedReason: "corrupt" };
  }
  let parsed: CacheManifest;
  try {
    parsed = JSON.parse(raw) as CacheManifest;
  } catch {
    return { slices: new Map(), invalidatedReason: "corrupt" };
  }
  if (parsed.v !== MANIFEST_VERSION) return { slices: new Map(), invalidatedReason: "version" };
  if (parsed.parserVersion !== opts.parserVersion) {
    return { slices: new Map(), invalidatedReason: "version" };
  }
  const tsHash = hashTsConfig(opts.tsConfigPath);
  if (parsed.tsConfigHash !== tsHash) {
    return { slices: new Map(), invalidatedReason: "tsconfig" };
  }
  const fsHash = hashFileSet(opts.fileSetIds);
  if (parsed.fileSetHash !== fsHash) {
    return { slices: new Map(), invalidatedReason: "file-set" };
  }
  const map = new Map<string, CacheSlice>();
  for (const [id, slice] of Object.entries(parsed.slices ?? {})) {
    if (isValidSlice(slice)) map.set(id, slice);
  }
  return { slices: map, invalidatedReason: null };
}

export interface CacheSaveOptions {
  rootDir: string;
  parserVersion: string;
  fileSetIds: readonly string[];
  tsConfigPath: string | null;
  slices: ReadonlyMap<string, CacheSlice>;
  /** Override clock for deterministic tests. */
  now?: Date;
}

export function saveCache(opts: CacheSaveOptions): void {
  const dir = join(opts.rootDir, SLICE_DIR);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    return; // permission denied / read-only FS; silently skip
  }
  const filePath = join(dir, SLICE_FILE);
  const manifest: CacheManifest = {
    v: MANIFEST_VERSION,
    parserVersion: opts.parserVersion,
    tsConfigHash: hashTsConfig(opts.tsConfigPath),
    fileSetHash: hashFileSet(opts.fileSetIds),
    generatedAt: (opts.now ?? new Date()).toISOString(),
    slices: Object.fromEntries(opts.slices),
  };
  try {
    writeFileSync(filePath, `${JSON.stringify(manifest)}\n`, "utf8");
  } catch {
    // Best-effort; failure to persist just means next run re-parses.
  }
}

/** Stable SHA-256 of a UTF-8 string. Hex-encoded, full 64 chars. */
export function hashContent(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function hashTsConfig(absPath: string | null): string | null {
  if (!absPath || !existsSync(absPath)) return null;
  try {
    const raw = readFileSync(absPath, "utf8");
    return hashContent(raw);
  } catch {
    return null;
  }
}

function hashFileSet(ids: readonly string[]): string {
  const sorted = [...ids].sort();
  return hashContent(sorted.join("\n"));
}

function sliceFilePath(rootDir: string): string {
  return join(rootDir, SLICE_DIR, SLICE_FILE);
}

function isValidSlice(slice: unknown): slice is CacheSlice {
  if (!slice || typeof slice !== "object") return false;
  const s = slice as Partial<CacheSlice>;
  return (
    typeof s.contentHash === "string" &&
    typeof s.classification === "string" &&
    typeof s.loc === "number" &&
    typeof s.bytes === "number" &&
    Array.isArray(s.exports) &&
    Array.isArray(s.edges) &&
    Array.isArray(s.externals)
  );
}

/** Best-effort check: is `path` a file the cache should consider stale? Unused; reserved for hooks. */
export function fileLastModified(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}
