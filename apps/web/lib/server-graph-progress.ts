import { type FSWatcher, readFileSync, watch } from "node:fs";
import { basename, dirname } from "node:path";
import { writeAtomicUtf8 } from "@/lib/atomic-write";

export type ParsePhase = "starting" | "discovering" | "parsing" | "metrics" | "ready" | "error";

export interface ParseProgressPayload {
  phase: ParsePhase;
  message: string;
  percent?: number;
  filesFound?: number;
  nodes?: number;
  edges?: number;
  error?: string;
  updatedAt?: string;
}

export function getProgressPath(): string | null {
  const p = process.env.DEPMOD_PROGRESS_PATH;
  return p && p.length > 0 ? p : null;
}

export function writeParseProgress(progressPath: string, payload: ParseProgressPayload): void {
  writeAtomicUtf8(
    progressPath,
    JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }),
  );
}

export function readParseProgress(): ParseProgressPayload | null {
  const path = getProgressPath();
  if (!path) return null;
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as ParseProgressPayload;
  } catch {
    return null;
  }
}

export function watchParseProgress(onChange: () => void): (() => void) | null {
  const path = getProgressPath();
  if (!path) return null;

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
      if (name == null) {
        schedule();
        return;
      }
      if (name === fileName) schedule();
      if (String(name).endsWith(".tmp")) return;
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      watcher?.close();
    };
  } catch {
    return null;
  }
}
