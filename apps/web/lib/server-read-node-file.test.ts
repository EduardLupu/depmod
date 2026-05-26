import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Graph } from "@depmod/types";

const sessionModule = vi.hoisted(() => ({
  readGraphSessionJson: vi.fn<() => string | null>(),
}));

vi.mock("./server-graph-session", () => ({
  readGraphSessionJson: sessionModule.readGraphSessionJson,
}));

import { readNodeSourceFile } from "./server-read-node-file";

let root: string;
let sessionPath: string;

const miniGraph: Graph = {
  schemaVersion: 1,
  generatedAt: "2026-05-17T00:00:00.000Z",
  rootDir: "",
  stats: { files: 1, nodes: 1, edges: 0, cycles: 0, parseMs: 1 },
  nodes: [
    {
      id: "src/a.ts",
      name: "a.ts",
      classification: "lib",
      loc: 1,
      exports: [],
      metrics: { Ca: 0, Ce: 0, instability: 1 },
    },
  ],
  edges: [],
  cycles: [],
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "depmod-serve-read-"));
  sessionPath = join(root, "session.json");
  miniGraph.rootDir = root;
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/a.ts"), "export const x = 1;\n");
  sessionModule.readGraphSessionJson.mockReturnValue(
    JSON.stringify({ graph: miniGraph, updatedAt: new Date().toISOString() }),
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("readNodeSourceFile", () => {
  it("returns file content for a known node", () => {
    const result = readNodeSourceFile(["src", "a.ts"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.content).toContain("export const x");
    expect(result.file.language).toBe("typescript");
  });

  it("rejects unknown nodes", () => {
    const result = readNodeSourceFile(["missing.ts"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it("rejects when no session exists", () => {
    sessionModule.readGraphSessionJson.mockReturnValue(null);
    const result = readNodeSourceFile(["src", "a.ts"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });
});
