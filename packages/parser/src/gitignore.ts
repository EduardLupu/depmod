import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ignore, { type Ignore } from "ignore";

/**
 * A composed `.gitignore` matcher anchored at `rootDir`. Honours the
 * gitignore inheritance model in the common case:
 *
 *  - Walks up from `rootDir` to the enclosing git root (or filesystem root),
 *    collecting every `.gitignore` along the way. Their patterns are added
 *    as-is; gitignore's "match anywhere below" semantics carry them through
 *    the relocated anchor (so a parent `node_modules` rule still matches
 *    inside `rootDir`).
 *  - Patterns with a leading `/` from an *ancestor* `.gitignore` are dropped,
 *    because `/dist` (anchored to the ancestor dir) doesn't have a sensible
 *    meaning when matched against paths under `rootDir`.
 *  - Nested `.gitignore` files inside `rootDir` are picked up too, with their
 *    patterns rebased relative to `rootDir`.
 *
 * Uses the same `ignore` library ESLint, Prettier, and Skott rely on. Build
 * one of these per `analyze()` call; cheap enough not to need cross-run
 * caching (that's Track I's concern).
 */
export interface GitignoreMatcher {
  /** Absolute path the matcher's patterns are anchored to. */
  readonly anchor: string;
  /**
   * `true` if `absPath` (file or directory) is excluded by some `.gitignore`
   * rule. Paths outside the anchor are treated as not-ignored.
   */
  ignores(absPath: string): boolean;
}

export interface BuildGitignoreOptions {
  /** Directory the matcher is rooted at (typically the parser's `rootDir`). */
  rootDir: string;
  /** Override the file name. Defaults to `.gitignore`. Used by tests. */
  fileName?: string;
  /** Hard-coded baseline patterns added before any file is read. */
  baseline?: string[];
}

const DEFAULT_BASELINE = ["node_modules", ".git"];

export function buildGitignore(options: BuildGitignoreOptions): GitignoreMatcher {
  const anchor = resolve(options.rootDir);
  const fileName = options.fileName ?? ".gitignore";
  const ig = ignore();

  ig.add(options.baseline ?? DEFAULT_BASELINE);

  for (const lines of readAncestorGitignores(anchor, fileName)) {
    ig.add(stripAnchoredPatterns(lines));
  }

  // Ancestor patterns are now active; descend, pulling in nested
  // .gitignore files but skipping branches that are already excluded.
  for (const { dir, lines } of readDescendantGitignores(anchor, fileName, ig)) {
    ig.add(rebaseUnderAnchor(lines, dir, anchor));
  }

  return {
    anchor,
    ignores(absPath: string): boolean {
      const rel = relative(anchor, absPath);
      if (!rel || rel.startsWith("..")) return false;
      const posixRel = rel.split(sep).join("/");
      return ig.ignores(posixRel);
    },
  };
}

/** Lines from each ancestor `.gitignore`, root-most first. */
function readAncestorGitignores(start: string, fileName: string): string[][] {
  const out: string[][] = [];
  let cursor = start;
  while (true) {
    const giPath = join(cursor, fileName);
    if (cursor !== start && fileExists(giPath)) {
      out.unshift(readLines(giPath));
    }
    if (existsSync(join(cursor, ".git"))) break;
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  // The .gitignore at `start` itself is handled by the descendant pass so
  // its rebasing logic stays in one place.
  return out;
}

interface LoadedGitignore {
  dir: string;
  lines: string[];
}

function readDescendantGitignores(
  start: string,
  fileName: string,
  alreadyIgnored: Ignore,
): LoadedGitignore[] {
  const out: LoadedGitignore[] = [];
  const stack: string[] = [start];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) break;
    const giPath = join(dir, fileName);
    if (fileExists(giPath)) {
      out.push({ dir, lines: readLines(giPath) });
    }
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      // Never descend into VCS internals.
      if (name === ".git") continue;
      const childAbs = join(dir, name);
      const rel = relative(start, childAbs).split(sep).join("/");
      if (rel && alreadyIgnored.ignores(`${rel}/`)) continue;
      stack.push(childAbs);
    }
  }
  return out;
}

/**
 * Drop patterns that are anchored to the ancestor's directory (leading `/`).
 * They were meaningful where they lived but are nonsense once we relocate the
 * matcher to a child anchor.
 */
function stripAnchoredPatterns(lines: string[]): string[] {
  return lines.filter((line) => {
    const body = line.startsWith("!") ? line.slice(1) : line;
    return !body.startsWith("/");
  });
}

/**
 * Re-prefix patterns from a nested `.gitignore` so they apply at the anchor's
 * level. Handles negation, leading `/` (path-anchored), trailing `/`, and the
 * "match anywhere below" semantics of unanchored patterns.
 */
function rebaseUnderAnchor(lines: string[], dir: string, anchor: string): string[] {
  const relPrefix = relative(anchor, dir).split(sep).join("/");
  if (!relPrefix) return lines;
  if (relPrefix.startsWith("..")) return [];
  return lines.map((raw) => {
    let line = raw;
    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    }
    const anchored = line.startsWith("/");
    if (anchored) line = line.slice(1);
    const trailingSlash = line.endsWith("/");
    const body = trailingSlash ? line.slice(0, -1) : line;
    const isPathLike = anchored || body.includes("/");
    const rebased = isPathLike ? `${relPrefix}/${body}` : `${relPrefix}/**/${body}`;
    return `${negated ? "!" : ""}${rebased}${trailingSlash ? "/" : ""}`;
  });
}

function fileExists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function readLines(path: string): string[] {
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}
