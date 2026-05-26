import { relative, resolve, sep } from "node:path";
import picomatch from "picomatch";
import { TEST_EXCLUDE_GLOBS } from "@depmod/types";
import { type GitignoreMatcher, buildGitignore } from "./gitignore.js";

/**
 * Decides which paths under `rootDir` belong in the graph. Layered model:
 *
 *  1. Hard baseline: `node_modules/**`, `.git/**`, `*.d.ts`, plus the legacy
 *     fixed list (`.next`, `.turbo`, `dist`, `build`, `out`, `coverage`). These
 *     never end up in the graph regardless of user config.
 *  2. `.gitignore` (default on, opt-out via `respectGitignore: false`).
 *  3. User `exclude` globs; applied next, so excludes win over later includes.
 *  4. User `include` globs; when present, the set of *kept* paths is restricted
 *     to ones matching at least one include pattern. When absent, everything
 *     not excluded by (1)-(3) is included.
 *
 * Globs follow `picomatch` semantics (POSIX, `**` matches across directories,
 * `?` matches one char, brace expansion supported). Paths are normalised to
 * POSIX form before matching.
 */
export interface FileFilter {
  /** Absolute path that the filter is anchored to. */
  readonly rootDir: string;
  /**
   * `true` if `absPath` should be included in the graph. Pass either a file
   * or a directory path; directories are tested with the same predicate so
   * the caller can skip an entire subtree on a single `false`.
   */
  includesPath(absPath: string): boolean;
  /**
   * `true` if `absPath` is a directory the walker should skip outright (i.e.
   * excluded by gitignore / explicit exclude / baseline). Same semantics as
   * `includesPath` returning false, except this is named for the descender's
   * loop and ignores `--include` patterns (a not-yet-matched include is *not*
   * a reason to prune; included files may live deeper).
   */
  skipsDirectory(absPath: string): boolean;
}

export interface BuildFileFilterOptions {
  /** Absolute path or cwd-relative directory. Required. */
  rootDir: string;
  /**
   * `false` = ignore the user's `.gitignore` files. Default: `true` (honour
   * them, just like Skott / ESLint).
   */
  respectGitignore?: boolean;
  /**
   * Inclusive allow-list of globs. When non-empty, only matching files are
   * kept in the graph. Anchored at `rootDir`, POSIX form.
   */
  include?: string[];
  /**
   * Exclude globs. Applied *after* gitignore and *before* `include`, so users
   * can carve out an explicitly-tracked directory.
   */
  exclude?: string[];
  /**
   * Override the legacy baseline. Default:
   * `.next`, `.turbo`, `dist`, `build`, `out`, `coverage`.
   */
  baselineExcludeDirs?: string[];
  /**
   * Override the file extensions considered. Default: `.ts`, `.tsx`, `.js`,
   * `.jsx`. (`.d.ts` is always rejected.)
   */
  sourceExtensions?: string[];
  /**
   * When true (default), test/spec files and `__tests__` trees are excluded at
   * parse time. Default false; set true via CLI `--exclude-tests`.
   */
  excludeTests?: boolean;
}

const DEFAULT_BASELINE_DIRS = [".next", ".turbo", "dist", "build", "out", "coverage"];
const DEFAULT_SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

export function buildFileFilter(options: BuildFileFilterOptions): FileFilter {
  const rootDir = resolve(options.rootDir);
  const respectGitignore = options.respectGitignore ?? true;
  const excludeTests = options.excludeTests ?? false;
  const include = (options.include ?? []).map(normalisePattern);
  const userExclude = (options.exclude ?? []).map(normalisePattern);
  const exclude = excludeTests
    ? [...userExclude, ...TEST_EXCLUDE_GLOBS.map(normalisePattern)]
    : userExclude;
  const baselineDirs = options.baselineExcludeDirs ?? DEFAULT_BASELINE_DIRS;
  const sourceExtensions = options.sourceExtensions ?? DEFAULT_SOURCE_EXTENSIONS;

  const baselineMatcher = picomatch(
    baselineDirs.flatMap((d) => [d, `${d}/**`, `**/${d}/**`, `**/${d}`]),
    { dot: true },
  );
  const includeMatcher = include.length > 0 ? picomatch(include, { dot: true }) : null;
  const excludeMatcher = exclude.length > 0 ? picomatch(exclude, { dot: true }) : null;
  const gitignore: GitignoreMatcher | null = respectGitignore ? buildGitignore({ rootDir }) : null;

  const isExcludedForAnyReason = (absPath: string, isDir: boolean): boolean => {
    const rel = toPosixRel(rootDir, absPath);
    if (rel === "") return false;
    if (rel === "..") return true; // outside the anchor; refuse.
    if (baselineMatcher(rel)) return true;
    if (gitignore?.ignores(absPath)) return true;
    if (excludeMatcher?.(rel)) return true;
    // Honour leaf-level "match anywhere below" patterns for directories.
    if (isDir && excludeMatcher?.(`${rel}/anything`)) return true;
    return false;
  };

  return {
    rootDir,
    includesPath(absPath: string): boolean {
      const rel = toPosixRel(rootDir, absPath);
      if (rel === "") return true;
      if (isExcludedForAnyReason(absPath, /*isDir=*/ false)) return false;
      // Reject non-source extensions and `.d.ts` declarations outright.
      const lower = rel.toLowerCase();
      if (lower.endsWith(".d.ts")) return false;
      if (!sourceExtensions.some((ext) => lower.endsWith(ext))) return false;
      if (includeMatcher && !includeMatcher(rel)) return false;
      return true;
    },
    skipsDirectory(absPath: string): boolean {
      return isExcludedForAnyReason(absPath, /*isDir=*/ true);
    },
  };
}

function toPosixRel(rootDir: string, absPath: string): string {
  const rel = relative(rootDir, absPath);
  if (rel === "") return "";
  if (rel.startsWith("..")) return "..";
  return rel.split(sep).join("/");
}

function normalisePattern(pat: string): string {
  // Drop a leading `./` for friendly UX; `./apps/**` == `apps/**`.
  return pat.startsWith("./") ? pat.slice(2) : pat;
}

/** Split a comma-separated CLI flag value into a clean list of globs. */
export function parseGlobList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
