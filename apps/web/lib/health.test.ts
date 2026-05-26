import type { Edge, Graph, Node as GraphNode } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { findDeadModules, summarizeHealth } from "./health";

function node(over: Partial<GraphNode> & Pick<GraphNode, "id">): GraphNode {
  return {
    name: over.id.split("/").pop() ?? over.id,
    classification: "lib",
    loc: 10,
    exports: [{ name: "default", type: "function" }],
    metrics: { Ca: 0, Ce: 0, instability: 0 },
    ...over,
  };
}

function graph(nodes: GraphNode[], edges: Edge[] = [], extra: Partial<Graph> = {}): Graph {
  return {
    schemaVersion: 1,
    generatedAt: "2025-01-01T00:00:00.000Z",
    rootDir: "/tmp",
    stats: { files: nodes.length, nodes: nodes.length, edges: edges.length, cycles: 0, parseMs: 0 },
    nodes,
    edges,
    cycles: [],
    ...extra,
  };
}

describe("findDeadModules", () => {
  it("flags Ca = 0 as `unreferenced`", () => {
    expect(findDeadModules(graph([node({ id: "src/lib/orphan.ts" })]))).toEqual([
      { id: "src/lib/orphan.ts", kinds: ["unreferenced"] },
    ]);
  });

  it("flags `runtime-only-type` when only type-only edges point to it", () => {
    // Note: Ca is the precomputed unique-source count; we set it explicitly so
    // the "unreferenced" branch doesn't trip first.
    const g = graph(
      [
        node({ id: "src/lib/t.ts", metrics: { Ca: 1, Ce: 0, instability: 0 } }),
        node({ id: "src/a.ts", metrics: { Ca: 0, Ce: 1, instability: 1 } }),
      ],
      [{ source: "src/a.ts", target: "src/lib/t.ts", kind: "type-only" }],
    );
    expect(findDeadModules(g).find((d) => d.id === "src/lib/t.ts")?.kinds).toContain(
      "runtime-only-type",
    );
  });

  it("stacks `no-exports` and `empty`", () => {
    const g = graph([node({ id: "src/lib/stub.ts", loc: 1, exports: [] })]);
    expect(findDeadModules(g)[0]?.kinds).toEqual(["unreferenced", "no-exports", "empty"]);
  });

  it("never returns pages/apis/config/test nodes", () => {
    const g = graph([
      node({ id: "src/app/page.tsx", classification: "page" }),
      node({ id: "src/app/api/route.ts", classification: "api" }),
      node({ id: "x.config.ts", classification: "config" }),
      node({ id: "src/lib/foo.test.ts", classification: "test" }),
    ]);
    expect(findDeadModules(g)).toEqual([]);
  });

  it("never returns convention files (next.config, layout.tsx, .d.ts)", () => {
    const g = graph([
      node({ id: "next.config.js" }),
      node({ id: "src/app/layout.tsx" }),
      node({ id: "src/types.d.ts" }),
    ]);
    expect(findDeadModules(g)).toEqual([]);
  });
});

describe("summarizeHealth", () => {
  it("passes through unusedDependencies", () => {
    const g = graph([node({ id: "src/x.ts", metrics: { Ca: 1, Ce: 0, instability: 0 } })], [], {
      unusedDependencies: [{ workspace: "", name: "lodash", kind: "dependencies" }],
    });
    expect(summarizeHealth(g).unusedDeps).toEqual([
      { workspace: "", name: "lodash", kind: "dependencies" },
    ]);
  });

  it("defaults unusedDeps to empty when the graph omits the field", () => {
    expect(summarizeHealth(graph([])).unusedDeps).toEqual([]);
  });
});
