import type { Graph } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { summarize } from "../src/format.js";

const baseGraph: Graph = {
  schemaVersion: 1,
  generatedAt: "2026-05-17T00:00:00.000Z",
  rootDir: "/tmp/x",
  stats: { files: 3, nodes: 3, edges: 2, cycles: 0, parseMs: 42 },
  nodes: [
    {
      id: "app/page.tsx",
      name: "page.tsx",
      classification: "page",
      loc: 10,
      exports: [],
      metrics: { Ca: 0, Ce: 2, instability: 1 },
    },
    {
      id: "components/Hello.tsx",
      name: "Hello.tsx",
      classification: "component",
      loc: 5,
      exports: [],
      metrics: { Ca: 1, Ce: 1, instability: 0.5 },
    },
    {
      id: "lib/cn.ts",
      name: "cn.ts",
      classification: "lib",
      loc: 3,
      exports: [],
      metrics: { Ca: 2, Ce: 0, instability: 0 },
    },
  ],
  edges: [
    { source: "app/page.tsx", target: "components/Hello.tsx", kind: "import" },
    { source: "components/Hello.tsx", target: "lib/cn.ts", kind: "import" },
  ],
  cycles: [],
};

describe("summarize", () => {
  it("renders the stats block with file, node, edge, cycle, and parse counts", () => {
    const out = summarize(baseGraph, { noColor: true });
    expect(out).toContain("Files    3");
    expect(out).toContain("Nodes    3");
    expect(out).toContain("Edges    2");
    expect(out).toContain("Cycles   0");
    expect(out).toContain("Parse    42ms");
  });

  it("renders a classification breakdown with all five classes in canonical order", () => {
    const out = summarize(baseGraph, { noColor: true });
    const classificationBlock = out.split("Classification")[1] ?? "";
    const pageIdx = classificationBlock.indexOf("page");
    const apiIdx = classificationBlock.indexOf("api");
    const hookIdx = classificationBlock.indexOf("hook");
    const componentIdx = classificationBlock.indexOf("component");
    const libIdx = classificationBlock.indexOf("lib");
    expect(pageIdx).toBeLessThan(apiIdx);
    expect(apiIdx).toBeLessThan(hookIdx);
    expect(hookIdx).toBeLessThan(componentIdx);
    expect(componentIdx).toBeLessThan(libIdx);
  });

  it("lists top-instability nodes in descending order", () => {
    const out = summarize(baseGraph, { noColor: true });
    const block = out.split("Top instability")[1] ?? "";
    expect(block.indexOf("app/page.tsx")).toBeLessThan(block.indexOf("components/Hello.tsx"));
    expect(block.indexOf("components/Hello.tsx")).toBeLessThan(block.indexOf("lib/cn.ts"));
  });

  it("renders a cycles block in red header when cycles exist", () => {
    const cyclicGraph: Graph = {
      ...baseGraph,
      stats: { ...baseGraph.stats, cycles: 1 },
      cycles: [{ nodes: ["a.ts", "b.ts"] }],
    };
    const out = summarize(cyclicGraph, { noColor: true });
    expect(out).toContain("Cycles (1)");
    expect(out).toContain("a.ts → b.ts → a.ts");
  });

  it("omits the cycles block when there are no cycles", () => {
    const out = summarize(baseGraph, { noColor: true });
    expect(out).not.toContain("Cycles (");
  });

  it("omits the top-afferent block when every node has Ca=0", () => {
    const allUnstable: Graph = {
      ...baseGraph,
      nodes: baseGraph.nodes.map((n) => ({ ...n, metrics: { Ca: 0, Ce: 1, instability: 1 } })),
    };
    const out = summarize(allUnstable, { noColor: true });
    expect(out).not.toContain("Top afferent coupling");
  });
});
