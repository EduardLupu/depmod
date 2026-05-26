import chokidar from "chokidar";

export interface WatchOptions {
  /** Absolute path to watch recursively. */
  root: string;
  /** Debounce window for the change handler, in ms. */
  debounceMs?: number;
  /** Globs to ignore (in addition to the standard `node_modules`, `.next`, etc.). */
  extraIgnored?: readonly string[];
  /** Called once per debounced burst. */
  onChange: () => void | Promise<void>;
  /** Called once when chokidar's `ready` event fires. */
  onReady?: () => void;
}

const DEFAULT_IGNORED: readonly string[] = [
  "**/node_modules/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/coverage/**",
  "**/.cache/**",
];

const WATCHED_EXT = /\.(tsx?|jsx?|json|cjs|mjs)$/;

/**
 * Recursively watch a project root for source-file changes.
 * Returns a `close()` function that stops the watcher and resolves when chokidar
 * has released its handles.
 *
 * The debounced handler is called once per burst; saving 30 files in 100ms via
 * a `prettier --write` only triggers a single re-analyse.
 */
export function watchProject(options: WatchOptions): { close: () => Promise<void> } {
  const debounceMs = options.debounceMs ?? 250;
  const ignored = [...DEFAULT_IGNORED, ...(options.extraIgnored ?? [])];

  const watcher = chokidar.watch(options.root, {
    ignored,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 30 },
  });

  let pending: ReturnType<typeof setTimeout> | null = null;
  function schedule(): void {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      void options.onChange();
    }, debounceMs);
  }

  function maybeSchedule(path: string): void {
    if (!WATCHED_EXT.test(path)) return;
    schedule();
  }

  watcher.on("add", maybeSchedule);
  watcher.on("change", maybeSchedule);
  watcher.on("unlink", maybeSchedule);
  watcher.on("ready", () => options.onReady?.());

  return {
    async close() {
      if (pending) clearTimeout(pending);
      pending = null;
      await watcher.close();
    },
  };
}
