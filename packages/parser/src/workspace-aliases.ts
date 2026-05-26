import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve as resolvePath, sep } from "node:path";
import ts from "typescript";

/**
 * A `paths` mapping pulled from a tsconfig.json. We resolve these manually
 * because the parser instantiates a single ts-morph Project rooted at the
 * monorepo root, which only sees the root tsconfig — any per-workspace
 * aliases declared in `apps/<name>/tsconfig.json` would otherwise be invisible
 * and every `@/...` import from that workspace would silently fail to
 * resolve, polluting the dead-code report.
 */
export interface AliasPattern {
  /** Absolute path of the directory containing the tsconfig that declared this alias. */
  workspaceDir: string;
  /** Substring of the source-specifier before the wildcard (`@/` for `@/*`), or the full pattern when no wildcard. */
  prefix: string;
  /** Whether the pattern contains `*`. */
  hasWildcard: boolean;
  /** Substitution templates from the `paths` value. */
  targets: ReadonlyArray<{ prefix: string; suffix: string; hasWildcard: boolean }>;
  /** `baseUrl` (defaults to the tsconfig's directory) — anchors relative targets. */
  baseDir: string;
}

/**
 * Read `compilerOptions.paths` from the tsconfig at each workspace root
 * (plus the project root). Honours `extends` because `ts.parseJsonConfigFileContent`
 * already walks the chain.
 */
export function loadAliasPatterns(
  rootDir: string,
  workspacePaths: readonly string[],
): AliasPattern[] {
  const dirs = new Set<string>();
  dirs.add(resolvePath(rootDir));
  for (const wp of workspacePaths) {
    dirs.add(resolvePath(rootDir, wp));
  }

  const out: AliasPattern[] = [];
  const seenConfigs = new Set<string>();
  for (const dir of dirs) {
    const tsconfigPath = join(dir, "tsconfig.json");
    if (!existsSync(tsconfigPath)) continue;
    if (seenConfigs.has(tsconfigPath)) continue;
    seenConfigs.add(tsconfigPath);
    out.push(...parseAliases(tsconfigPath));
  }
  return out;
}

function parseAliases(tsconfigPath: string): AliasPattern[] {
  const read = ts.readConfigFile(tsconfigPath, (p) => {
    try {
      return readFileSync(p, "utf-8");
    } catch {
      return "";
    }
  });
  if (read.error || !read.config) return [];
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(tsconfigPath));
  const paths = parsed.options.paths;
  if (!paths) return [];
  const baseDir = parsed.options.baseUrl
    ? isAbsolute(parsed.options.baseUrl)
      ? parsed.options.baseUrl
      : resolvePath(dirname(tsconfigPath), parsed.options.baseUrl)
    : dirname(tsconfigPath);

  const out: AliasPattern[] = [];
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets)) continue;
    const wildIdx = pattern.indexOf("*");
    const hasWildcard = wildIdx !== -1;
    const prefix = hasWildcard ? pattern.slice(0, wildIdx) : pattern;
    out.push({
      workspaceDir: dirname(tsconfigPath),
      prefix,
      hasWildcard,
      baseDir,
      targets: targets
        .filter((t): t is string => typeof t === "string")
        .map((t) => {
          const i = t.indexOf("*");
          if (i === -1) return { prefix: t, suffix: "", hasWildcard: false };
          return { prefix: t.slice(0, i), suffix: t.slice(i + 1), hasWildcard: true };
        }),
    });
  }
  return out;
}

/**
 * Try to resolve `specifier` (from a file at `fromFileAbs`) against one of the
 * collected alias patterns. Returns the absolute path of the resolved file, or
 * `undefined` if no pattern matched. The first pattern whose workspace contains
 * the source file wins, mirroring how TypeScript scopes `paths` to the nearest
 * tsconfig.
 */
export function resolveAliasSpecifier(
  fromFileAbs: string,
  specifier: string,
  patterns: readonly AliasPattern[],
): string | undefined {
  for (const alias of patterns) {
    if (!isInside(alias.workspaceDir, fromFileAbs)) continue;
    if (alias.hasWildcard) {
      if (!specifier.startsWith(alias.prefix)) continue;
      const tail = specifier.slice(alias.prefix.length);
      for (const t of alias.targets) {
        if (!t.hasWildcard) continue;
        const candidate = resolvePath(alias.baseDir, t.prefix + tail + t.suffix);
        const found = tryExtensions(candidate);
        if (found) return found;
      }
    } else {
      if (specifier !== alias.prefix) continue;
      for (const t of alias.targets) {
        const candidate = resolvePath(alias.baseDir, t.prefix);
        const found = tryExtensions(candidate);
        if (found) return found;
      }
    }
  }
  return undefined;
}

function isInside(parent: string, child: string): boolean {
  if (child === parent) return true;
  const prefix = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(prefix);
}

function tryExtensions(path: string): string | undefined {
  if (existsSync(path)) return path;
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) {
    if (existsSync(path + ext)) return path + ext;
  }
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
    const idx = join(path, `index${ext}`);
    if (existsSync(idx)) return idx;
  }
  return undefined;
}
