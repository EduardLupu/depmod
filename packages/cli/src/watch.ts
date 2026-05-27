import type { Stats } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { type GitignoreMatcher, buildGitignore } from "@depmod/parser";
import chokidar from "chokidar";

export interface WatchOptions {
  /** Absolute path to watch recursively. */
  root: string;
  /** Debounce window for the change handler, in ms. */
  debounceMs?: number;
  /** Honour `.gitignore` (same rules as `analyze()`). Default: true. */
  respectGitignore?: boolean;
  /** Globs to ignore (in addition to gitignore and built-in heavy dirs). */
  extraIgnored?: readonly string[];
  /** Called once per debounced burst. */
  onChange: () => void | Promise<void>;
  /** Called once when chokidar's `ready` event fires. */
  onReady?: () => void;
}

const WATCHED_EXT = /\.(tsx?|jsx?|json|cjs|mjs)$/;

/**
 * Directory name segments we never descend into. Matched anywhere in the path
 * (e.g. `node_modules`, nested `.pnpm` stores). Globs alone are unreliable on
 * macOS fsevents and can exhaust the OS watch limit (EMFILE).
 */
const HEAVY_DIR_SEGMENTS = new Set([
  "node_modules",
  ".pnpm",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".depmod-cache",
  ".targets-cache",
  "out",
  ".output",
  ".vercel",
  ".idea",
]);

export interface CreateWatchIgnoredOptions {
  respectGitignore?: boolean;
  extraIgnored?: readonly string[];
}

/**
 * Build the chokidar `ignored` predicate: gitignore + heavy dirs + non-source
 * files. Returning `true` skips the path (and prunes directories).
 */
export function createWatchIgnored(
  root: string,
  options: CreateWatchIgnoredOptions = {},
): (watchPath: string, stats?: Stats) => boolean {
  const rootAbs = resolve(root);
  const gitignore: GitignoreMatcher | null =
    options.respectGitignore !== false ? buildGitignore({ rootDir: rootAbs }) : null;
  const extra = options.extraIgnored ?? [];

  return (watchPath: string, stats?: Stats) => {
    const abs = isAbsolute(watchPath) ? watchPath : resolve(rootAbs, watchPath);
    if (!abs.startsWith(rootAbs)) return true;

    const relToRoot = relative(rootAbs, abs);
    if (relToRoot === "" || relToRoot === ".") return false;

    if (pathHasHeavySegment(abs, rootAbs)) return true;
    if (gitignore?.ignores(abs)) return true;

    for (const pattern of extra) {
      const needle = pattern
        .replace(/^\*\*\//, "")
        .replace(/\/\*\*$/, "")
        .replace(/\*\*/g, "");
      if (needle && abs.includes(needle)) return true;
    }

    // Only filter by extension when we know it's a file. During directory
    // traversal chokidar often omits `stats`; treating those paths as ignored
    // would prune entire subtrees (e.g. `src/`).
    if (stats && !stats.isDirectory() && !WATCHED_EXT.test(abs)) return true;
    return false;
  };
}

function pathHasHeavySegment(absPath: string, rootAbs: string): boolean {
  const rel = relative(rootAbs, absPath);
  // `relative(root, root)` is `""` — must remain watchable or chokidar skips the tree.
  if (rel === "" || rel === ".") return false;
  if (rel.startsWith("..")) return true;
  for (const segment of rel.split(sep)) {
    if (HEAVY_DIR_SEGMENTS.has(segment)) return true;
  }
  return false;
}

/**
 * Recursively watch a project root for source-file changes.
 * Returns a `close()` function that stops the watcher and resolves when chokidar
 * has released its handles.
 */
export function watchProject(options: WatchOptions): { close: () => Promise<void> } {
  const debounceMs = options.debounceMs ?? 250;
  const rootAbs = resolve(options.root);
  const ignored = createWatchIgnored(rootAbs, {
    respectGitignore: options.respectGitignore,
    extraIgnored: options.extraIgnored,
  });

  const watcher = chokidar.watch(rootAbs, {
    ignored,
    ignoreInitial: true,
    persistent: true,
    followSymlinks: false,
    ignorePermissionErrors: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });

  let pending: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  function schedule(): void {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      void runChange();
    }, debounceMs);
  }

  async function runChange(): Promise<void> {
    if (running) {
      schedule();
      return;
    }
    running = true;
    try {
      await options.onChange();
    } finally {
      running = false;
    }
  }

  function maybeSchedule(path: string): void {
    const abs = isAbsolute(path) ? path : resolve(rootAbs, path);
    if (!WATCHED_EXT.test(abs)) return;
    schedule();
  }

  watcher.on("add", maybeSchedule);
  watcher.on("change", maybeSchedule);
  watcher.on("unlink", maybeSchedule);
  watcher.on("ready", () => options.onReady?.());
  watcher.on("error", (err) => {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "EMFILE") {
      process.stderr.write(
        "depmod-ui: too many files to watch (EMFILE). Try running without -w, or raise your fd limit: ulimit -n 10240\n",
      );
      void watcher.close();
      return;
    }
    process.stderr.write(
      `depmod-ui: watcher error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  });

  return {
    async close() {
      if (pending) clearTimeout(pending);
      pending = null;
      await watcher.close();
    },
  };
}
