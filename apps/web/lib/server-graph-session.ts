import { readFileSync, watch, type FSWatcher } from "node:fs";

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

/**
 * Watch the session file for writes from `depmod-ui`. Returns an unsubscribe
 * function. No-op when the env var is unset (plain `next dev` without the CLI).
 */
export function watchGraphSession(onChange: () => void): () => void {
  const path = getSessionFilePath();
  if (!path) return () => {};
  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(path, () => onChange());
  } catch {
    return () => {};
  }
  return () => watcher?.close();
}
