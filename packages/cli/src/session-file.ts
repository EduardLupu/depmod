import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Graph } from "@depmod/types";
import { writeAtomicUtf8 } from "./atomic-write.js";

export const SESSION_FILENAME = "session.json";

export interface GraphSessionPayload {
  graph: Graph;
  updatedAt: string;
}

/** Create a fresh temp directory and return the absolute session file path. */
export function createSessionFilePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "depmod-session-"));
  return join(dir, SESSION_FILENAME);
}

export function writeGraphSession(sessionPath: string, graph: Graph): void {
  const payload: GraphSessionPayload = {
    graph,
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(sessionPath), { recursive: true });
  writeAtomicUtf8(sessionPath, JSON.stringify(payload));
}
