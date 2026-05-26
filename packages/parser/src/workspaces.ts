import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import picomatch from "picomatch";
import { parse as parseYaml } from "yaml";

/**
 * Detected workspaces in a monorepo. Surfaces in `Graph.workspaces` so the UI
 * can offer a "show only X" multi-select sidebar without re-parsing config.
 */
export interface DetectedWorkspace {
  /** Workspace package name (`@scope/foo`) or directory name as a fallback. */
  name: string;
  /**
   * Workspace path *relative to `rootDir`*, POSIX-style. Stable across
   * machines / cwd choices, so it survives a round-trip through `graph.json`.
   */
  path: string;
}

export interface DetectWorkspacesOptions {
  /** Where to start looking. Detection runs *at* `rootDir`, not above. */
  rootDir: string;
}

/**
 * Detect workspaces using the four manifests we care about:
 *
 *  1. `pnpm-workspace.yaml` (`packages: [apps/*, packages/*]`)
 *  2. `package.json#workspaces` (npm/yarn; array, or `{packages: [...]}`)
 *  3. `lerna.json#packages`
 *
 * Globs are expanded against the filesystem at one level deep (the manifest's
 * own conventions, e.g. `apps/*` means "every immediate child of apps/").
 * Returns deterministic order; sorted by `path`; so snapshot tests are stable.
 */
export function detectWorkspaces(options: DetectWorkspacesOptions): DetectedWorkspace[] {
  const rootDir = resolve(options.rootDir);
  const globs = readWorkspaceGlobs(rootDir);
  if (globs.length === 0) return [];

  const matches = expandWorkspaceGlobs(rootDir, globs);
  const out: DetectedWorkspace[] = [];
  const seen = new Set<string>();
  for (const absDir of matches) {
    const rel = relative(rootDir, absDir).split(sep).join("/");
    if (!rel || rel.startsWith("..")) continue;
    if (seen.has(rel)) continue;
    seen.add(rel);
    const name = readPackageName(absDir) ?? basename(absDir);
    out.push({ name, path: rel });
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

function readWorkspaceGlobs(rootDir: string): string[] {
  const fromPnpm = readPnpmWorkspace(join(rootDir, "pnpm-workspace.yaml"));
  if (fromPnpm.length > 0) return fromPnpm;
  const fromPackageJson = readPackageJsonWorkspaces(join(rootDir, "package.json"));
  if (fromPackageJson.length > 0) return fromPackageJson;
  return readLernaWorkspaces(join(rootDir, "lerna.json"));
}

function readPnpmWorkspace(path: string): string[] {
  if (!fileExists(path)) return [];
  try {
    const parsed = parseYaml(readFileSync(path, "utf-8")) as unknown;
    if (parsed && typeof parsed === "object" && "packages" in parsed) {
      const pkgs = (parsed as { packages?: unknown }).packages;
      if (Array.isArray(pkgs)) return pkgs.filter((p): p is string => typeof p === "string");
    }
  } catch {
    // Malformed YAML; pretend there's no workspace config.
  }
  return [];
}

function readPackageJsonWorkspaces(path: string): string[] {
  if (!fileExists(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const ws = (parsed as { workspaces?: unknown }).workspaces;
    if (Array.isArray(ws)) return ws.filter((p): p is string => typeof p === "string");
    if (ws && typeof ws === "object" && "packages" in ws) {
      const pkgs = (ws as { packages?: unknown }).packages;
      if (Array.isArray(pkgs)) return pkgs.filter((p): p is string => typeof p === "string");
    }
  } catch {
    // Ignore; no JSON, no workspaces.
  }
  return [];
}

function readLernaWorkspaces(path: string): string[] {
  if (!fileExists(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (parsed && typeof parsed === "object" && "packages" in parsed) {
      const pkgs = (parsed as { packages?: unknown }).packages;
      if (Array.isArray(pkgs)) return pkgs.filter((p): p is string => typeof p === "string");
    }
  } catch {
    // Ignore.
  }
  return [];
}

function readPackageName(workspaceDir: string): string | null {
  const pkgPath = join(workspaceDir, "package.json");
  if (!fileExists(pkgPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: unknown };
    return typeof parsed.name === "string" && parsed.name.length > 0 ? parsed.name : null;
  } catch {
    return null;
  }
}

/**
 * Expand workspace globs. Workspace manifests use a glob mini-language that
 * is *not* full picomatch; e.g. `apps/*` means one segment deep, not `**`.
 * We handle the two common forms:
 *
 *  - `<dir>` (no glob)       → just that dir if it exists
 *  - `<dir>/*`               → every immediate child dir
 *  - `<dir>/**`              → every dir (recursive)
 *  - everything else         → picomatch fallback
 *
 * Either way, only directories that contain a `package.json` count.
 */
function expandWorkspaceGlobs(rootDir: string, globs: string[]): string[] {
  const out: string[] = [];
  for (const raw of globs) {
    const glob = raw.replace(/\/+$/, "");
    if (!glob.includes("*")) {
      const abs = resolve(rootDir, glob);
      if (isWorkspaceDir(abs)) out.push(abs);
      continue;
    }
    const m = glob.match(/^(.*?)\/(\*\*?)$/);
    if (m) {
      const base = m[1] ?? "";
      const star = m[2];
      const baseAbs = resolve(rootDir, base);
      if (!directoryExists(baseAbs)) continue;
      if (star === "*") {
        for (const entry of listDirs(baseAbs)) {
          if (isWorkspaceDir(entry)) out.push(entry);
        }
      } else {
        for (const entry of walkDirs(baseAbs)) {
          if (isWorkspaceDir(entry)) out.push(entry);
        }
      }
      continue;
    }
    // Generic fallback for unusual globs (`apps/{web,api}` etc.).
    const matcher = picomatch(glob, { dot: false });
    for (const entry of walkDirs(rootDir)) {
      const rel = relative(rootDir, entry).split(sep).join("/");
      if (matcher(rel) && isWorkspaceDir(entry)) out.push(entry);
    }
  }
  return out;
}

function listDirs(parent: string): string[] {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(parent, e.name));
  } catch {
    return [];
  }
}

function walkDirs(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) break;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === "node_modules" || e.name === ".git") continue;
      const abs = join(dir, e.name);
      out.push(abs);
      stack.push(abs);
    }
  }
  return out;
}

function isWorkspaceDir(absPath: string): boolean {
  if (!directoryExists(absPath)) return false;
  return fileExists(join(absPath, "package.json"));
}

function directoryExists(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function fileExists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

// Re-export so the parser can reach for it without an extra import path.
export { dirname };
