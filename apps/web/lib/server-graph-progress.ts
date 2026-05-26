import { readFileSync, watch, writeFileSync } from "node:fs";

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
  writeFileSync(
    progressPath,
    JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }),
    "utf8",
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
  try {
    const watcher = watch(path, () => onChange());
    return () => watcher.close();
  } catch {
    return null;
  }
}
