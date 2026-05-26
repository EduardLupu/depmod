import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const PROGRESS_FILENAME = "progress.json";

export type ParsePhase = "starting" | "discovering" | "parsing" | "metrics" | "ready" | "error";

export interface ParseProgressPayload {
  phase: ParsePhase;
  message: string;
  /** 0–100 when known. */
  percent?: number;
  filesFound?: number;
  nodes?: number;
  edges?: number;
  error?: string;
}

export function progressPathForSession(sessionPath: string): string {
  return join(dirname(sessionPath), PROGRESS_FILENAME);
}

export function writeParseProgress(progressPath: string, payload: ParseProgressPayload): void {
  writeFileSync(
    progressPath,
    JSON.stringify({ ...payload, updatedAt: new Date().toISOString() }),
    "utf8",
  );
}
