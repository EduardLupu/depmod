import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { Graph } from "@depmod/types";
import { getSessionFilePath } from "./server-graph-session";

export interface GraphSessionPayload {
  graph: Graph;
  updatedAt: string;
}

export function writeGraphSessionFile(graph: Graph): boolean {
  const sessionPath = getSessionFilePath();
  if (!sessionPath) return false;
  const payload: GraphSessionPayload = {
    graph,
    updatedAt: new Date().toISOString(),
  };
  mkdirSync(dirname(sessionPath), { recursive: true });
  const body = JSON.stringify(payload);
  const tmpPath = join(dirname(sessionPath), `.${basename(sessionPath)}.tmp`);
  writeFileSync(tmpPath, body, "utf8");
  renameSync(tmpPath, sessionPath);
  return true;
}
