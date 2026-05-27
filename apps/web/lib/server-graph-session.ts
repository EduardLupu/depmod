import { type FSWatcher, readFileSync, watch } from "node:fs";
import { basename, dirname } from "node:path";

const SESSION_ENV = "DEPMOD_SESSION_PATH";

export function getSessionFilePath(): string | null {
  const path = process.env[SESSION_ENV];
  return path && path.length > 0 ? path : null;
}

export function readGraphSessionJson(): string | null {
  const path = getSessionFilePath();
  if (!path) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** Read `updatedAt` from the session envelope (for poll-based reload fallback). */
export function readGraphSessionUpdatedAt(): string | null {
  const raw = readGraphSessionJson();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    return typeof parsed.updatedAt === "string" ? parsed.updatedAt : null;
  } catch {
    return null;
  }
}

/**
 * Watch the session directory for writes from `depmod-ui`. Returns an unsubscribe
 * function. No-op when the env var is unset (plain `next dev` without the CLI).
 *
 * We watch the *directory* (not the file inode) and debounce, because in-place
 * overwrites and atomic renames are both surfaced reliably that way.
 */
export function watchGraphSession(onChange: () => void): () => void {
  const path = getSessionFilePath();
  if (!path) return () => {};

  const dir = dirname(path);
  const fileName = basename(path);
  let watcher: FSWatcher | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      onChange();
    }, 50);
  };

  try {
    watcher = watch(dir, (event, name) => {
      // Linux: `rename` on atomic replace; macOS: `change` / `rename`.
      if (name == null) {
        schedule();
        return;
      }
      if (name === fileName) schedule();
      // Ignore in-flight atomic tmp files.
      if (String(name).endsWith(".tmp")) return;
    });
  } catch {
    return () => {};
  }

  return () => {
    if (debounce) clearTimeout(debounce);
    watcher?.close();
  };
}
