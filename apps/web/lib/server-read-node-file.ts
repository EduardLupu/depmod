import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { type Graph, safeParseGraph } from "@depmod/types";
import { resolveNodeFilePath } from "./resolve-node-file-path";
import { readGraphSessionJson } from "./server-graph-session";

export interface NodeFilePayload {
  nodeId: string;
  path: string;
  language: string;
  content: string;
}

export type ReadNodeFileResult =
  | { ok: true; file: NodeFilePayload }
  | { ok: false; status: number; error: string };

function languageForPath(nodeId: string): string {
  const name = basename(nodeId);
  if (name.endsWith(".tsx")) return "typescript";
  if (name.endsWith(".ts")) return "typescript";
  if (name.endsWith(".jsx")) return "javascript";
  if (name.endsWith(".js")) return "javascript";
  if (name.endsWith(".mjs") || name.endsWith(".cjs")) return "javascript";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".md")) return "markdown";
  return "plaintext";
}

function loadServeGraph(): Graph | null {
  const raw = readGraphSessionJson();
  if (!raw) return null;
  try {
    const wrapper = JSON.parse(raw) as { graph?: unknown };
    if (wrapper && typeof wrapper === "object" && wrapper.graph) {
      const result = safeParseGraph(wrapper.graph);
      if (result.success) return result.data;
    }
  } catch {
    // fall through; raw may be a bare Graph JSON
  }
  try {
    const parsed = safeParseGraph(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // invalid JSON
  }
  return null;
}

/** Read source for a graph node id during `depmod-ui`. */
export function readNodeSourceFile(nodeIdSegments: string[]): ReadNodeFileResult {
  const nodeId = nodeIdSegments.map((s) => decodeURIComponent(s)).join("/");
  if (!nodeId) {
    return { ok: false, status: 400, error: "Missing node id" };
  }

  const graph = loadServeGraph();
  if (!graph) {
    return { ok: false, status: 404, error: "No serve session; run depmod-ui on this project" };
  }

  if (!graph.nodes.some((n) => n.id === nodeId)) {
    return { ok: false, status: 404, error: `Unknown node: ${nodeId}` };
  }

  const absPath = resolveNodeFilePath(graph.rootDir, nodeId);
  if (!absPath) {
    return { ok: false, status: 400, error: "Invalid node path" };
  }

  try {
    const st = statSync(absPath);
    if (!st.isFile()) {
      return { ok: false, status: 404, error: "Not a file" };
    }
    const content = readFileSync(absPath, "utf8");
    return {
      ok: true,
      file: {
        nodeId,
        path: absPath,
        language: languageForPath(nodeId),
        content,
      },
    };
  } catch {
    return { ok: false, status: 404, error: "File not found on disk" };
  }
}
