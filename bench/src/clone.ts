import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { type SimpleGit, simpleGit } from "simple-git";
import type { BenchTarget } from "./types.js";

export interface CloneOptions {
  /** Absolute path to the directory that will hold per-target clones. */
  cacheDir: string;
  /** If true, skip re-cloning targets whose directory already exists. */
  reuseExisting?: boolean;
  /**
   * When reusing an existing clone, run `git fetch` + checkout the requested ref
   * (or fast-forward the default branch for unpinned targets).
   */
  update?: boolean;
}

export interface CloneResult {
  /** Absolute path to the working tree for this target. */
  path: string;
  /** Resolved HEAD SHA after clone (or checkout, if `target.ref` was set). */
  sha: string;
  /** True iff this run reused a pre-existing clone. */
  reused: boolean;
}

/**
 * Shallow-clone (depth 1) a target into `cacheDir/<name>`. Idempotent: re-uses an
 * existing clone if present unless `reuseExisting` is false. When `target.ref`
 * is non-null, the clone is full-depth and the ref is checked out so the run is
 * reproducible.
 */
export async function cloneTarget(
  target: BenchTarget,
  options: CloneOptions,
): Promise<CloneResult> {
  mkdirSync(options.cacheDir, { recursive: true });
  const path = resolve(options.cacheDir, target.cacheName ?? target.name);

  const reuseExisting = options.reuseExisting ?? true;
  if (existsSync(path) && reuseExisting) {
    const git = simpleGit(path);
    if (options.update) {
      await refreshClone(git, target);
    } else if (target.ref) {
      await ensureRef(git, target.ref);
    }
    return { path, sha: await currentSha(git), reused: true };
  }

  if (existsSync(path)) {
    // Caller asked for a fresh clone but the directory exists. Refuse rather than
    // silently `rm -rf` someone's working tree.
    throw new Error(
      `cloneTarget: path already exists, refusing to delete: ${path}. Omit --fresh to reuse.`,
    );
  }

  const git = simpleGit();
  const cloneArgs = target.ref ? ["--no-tags"] : ["--depth", "1", "--single-branch", "--no-tags"];
  await git.clone(target.repo, path, cloneArgs);

  const inside = simpleGit(path);
  if (target.ref) {
    await inside.checkout(target.ref);
  }
  return { path, sha: await currentSha(inside), reused: false };
}

async function refreshClone(git: SimpleGit, target: BenchTarget): Promise<void> {
  if (target.ref) {
    await git.fetch(["origin", "--tags", "--force"]);
    await ensureRef(git, target.ref);
    return;
  }
  // Unpinned: deepen shallow clones enough to fast-forward default branch.
  await git.fetch(["origin", "--depth", "1"]);
  const branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();
  if (branch !== "HEAD") {
    await git.reset(["--hard", `origin/${branch}`]);
  }
}

async function ensureRef(git: SimpleGit, ref: string): Promise<void> {
  await git.checkout(ref);
}

async function currentSha(git: SimpleGit): Promise<string> {
  return (await git.revparse(["HEAD"])).trim();
}

export function targetSubdir(target: BenchTarget, clonePath: string): string {
  return target.subdir ? join(clonePath, target.subdir) : clonePath;
}
