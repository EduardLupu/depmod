import { describe, expect, it } from "vitest";
import type { Graph } from "@depmod/types";
import { DEFAULT_VIEW_FILTERS, filterGraphView, nodeVisible } from "./view-graph";

const miniGraph: Graph = {
  schemaVersion: 1,
  generatedAt: "2026-01-01T00:00:00.000Z",
  rootDir: "/proj",
  stats: { files: 4, nodes: 4, edges: 2, cycles: 0, parseMs: 1 },
  nodes: [
    {
      id: "src/app/page.tsx",
      name: "page",
      classification: "page",
      loc: 10,
      exports: [],
      metrics: { Ca: 0, Ce: 1, instability: 1 },
      metricsRuntimeOnly: { Ca: 0, Ce: 1, instability: 1 },
    },
    {
      id: "src/lib/util.ts",
      name: "util",
      classification: "lib",
      loc: 5,
      exports: [],
      metrics: { Ca: 1, Ce: 0, instability: 0 },
      metricsRuntimeOnly: { Ca: 1, Ce: 0, instability: 0 },
    },
    {
      id: "src/lib/util.test.ts",
      name: "util.test",
      classification: "test",
      loc: 3,
      exports: [],
      metrics: { Ca: 0, Ce: 0, instability: 0 },
    },
    {
      id: "infra/deploy.ts",
      name: "deploy",
      classification: "lib",
      loc: 8,
      exports: [],
      metrics: { Ca: 0, Ce: 0, instability: 0 },
    },
  ],
  edges: [
    { source: "src/app/page.tsx", target: "src/lib/util.ts", kind: "import" },
    { source: "src/lib/util.test.ts", target: "src/lib/util.ts", kind: "import" },
  ],
  cycles: [],
};

describe("filterGraphView", () => {
  it("keeps all nodes when directory filters are neutral", () => {
    const view = filterGraphView(miniGraph, DEFAULT_VIEW_FILTERS);
    expect(view.nodes).toHaveLength(4);
  });

  it("excludes a directory prefix without re-parsing", () => {
    const view = filterGraphView(miniGraph, {
      directoryByPath: { infra: "excluded" },
    });
    expect(view.nodes.map((n) => n.id)).toEqual([
      "src/app/page.tsx",
      "src/lib/util.ts",
      "src/lib/util.test.ts",
    ]);
  });

  it("restricts to included roots when any included path is set", () => {
    const view = filterGraphView(miniGraph, {
      directoryByPath: { src: "included" },
    });
    expect(view.nodes.every((n) => n.id.startsWith("src/"))).toBe(true);
    expect(view.nodes.map((n) => n.id)).not.toContain("infra/deploy.ts");
  });

  it("recomputes metrics on the visible edge set", () => {
    const view = filterGraphView(miniGraph, {
      directoryByPath: { infra: "excluded" },
    });
    const util = view.nodes.find((n) => n.id === "src/lib/util.ts");
    expect(util?.metrics.Ca).toBe(2);
    expect(util?.metrics.Ce).toBe(0);
  });
});

describe("nodeVisible", () => {
  it("respects excluded paths", () => {
    expect(
      nodeVisible("infra/deploy.ts", {
        directoryByPath: { infra: "excluded" },
      }),
    ).toBe(false);
  });
});
