import type { Edge, Graph, Node as GraphNode } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { buildCycleMembership, buildOutgoingIndex, estimateBundleSize } from "./node-metrics";

function node(over: Partial<GraphNode> & Pick<GraphNode, "id">): GraphNode {
  return {
    name: over.id.split("/").pop() ?? over.id,
    classification: "lib",
    loc: 10,
    bytes: 1000,
    exports: [{ name: "default", type: "function" }],
    metrics: { Ca: 0, Ce: 0, instability: 0 },
    ...over,
  };
}

function graph(nodes: GraphNode[], edges: Edge[] = [], cycles: { nodes: string[] }[] = []): Graph {
  return {
    schemaVersion: 1,
    generatedAt: "2025-01-01T00:00:00.000Z",
    rootDir: "/tmp",
    stats: {
      files: nodes.length,
      nodes: nodes.length,
      edges: edges.length,
      cycles: cycles.length,
      parseMs: 0,
    },
    nodes,
    edges,
    cycles,
  };
}

describe("buildOutgoingIndex", () => {
  it("indexes by source id", () => {
    const idx = buildOutgoingIndex([
      { source: "a", target: "b", kind: "import" },
      { source: "a", target: "c", kind: "import" },
      { source: "b", target: "c", kind: "import" },
    ]);
    expect(idx.byId.get("a")?.sort()).toEqual(["b", "c"]);
    expect(idx.byId.get("b")).toEqual(["c"]);
  });

  it("skips type-only edges by default (runtime view)", () => {
    const idx = buildOutgoingIndex([
      { source: "a", target: "b", kind: "import" },
      { source: "a", target: "c", kind: "type-only" },
    ]);
    expect(idx.byId.get("a")).toEqual(["b"]);
  });

  it("keeps type-only edges when excludeTypeOnly=false", () => {
    const idx = buildOutgoingIndex(
      [
        { source: "a", target: "b", kind: "import" },
        { source: "a", target: "c", kind: "type-only" },
      ],
      { excludeTypeOnly: false },
    );
    expect(idx.byId.get("a")?.sort()).toEqual(["b", "c"]);
  });
});

describe("estimateBundleSize", () => {
  it("returns self-only when the root has no outgoing edges", () => {
    const g = graph([node({ id: "a", bytes: 500 })]);
    const idx = buildOutgoingIndex(g.edges);
    expect(estimateBundleSize(g, "a", idx)).toEqual({
      modules: 1,
      bytes: 500,
      bytesKnown: true,
    });
  });

  it("sums bytes across the transitive runtime closure", () => {
    const g = graph(
      [node({ id: "a", bytes: 100 }), node({ id: "b", bytes: 200 }), node({ id: "c", bytes: 300 })],
      [
        { source: "a", target: "b", kind: "import" },
        { source: "b", target: "c", kind: "import" },
      ],
    );
    const idx = buildOutgoingIndex(g.edges);
    expect(estimateBundleSize(g, "a", idx)).toEqual({
      modules: 3,
      bytes: 600,
      bytesKnown: true,
    });
  });

  it("excludes type-only descendants from the bundle (they're erased at compile time)", () => {
    const g = graph(
      [
        node({ id: "a", bytes: 100 }),
        node({ id: "b", bytes: 200 }),
        node({ id: "c", bytes: 9999 }), // would dominate if included
      ],
      [
        { source: "a", target: "b", kind: "import" },
        { source: "b", target: "c", kind: "type-only" },
      ],
    );
    const idx = buildOutgoingIndex(g.edges);
    expect(estimateBundleSize(g, "a", idx)).toEqual({
      modules: 2,
      bytes: 300,
      bytesKnown: true,
    });
  });

  it("dedupes nodes reached through multiple paths", () => {
    const g = graph(
      [node({ id: "a", bytes: 50 }), node({ id: "b", bytes: 70 }), node({ id: "c", bytes: 90 })],
      [
        { source: "a", target: "b", kind: "import" },
        { source: "a", target: "c", kind: "import" },
        { source: "b", target: "c", kind: "import" },
      ],
    );
    const idx = buildOutgoingIndex(g.edges);
    // c reached via a→c and a→b→c, but counted once.
    expect(estimateBundleSize(g, "a", idx).modules).toBe(3);
    expect(estimateBundleSize(g, "a", idx).bytes).toBe(210);
  });

  it("is cycle-safe", () => {
    const g = graph(
      [node({ id: "a", bytes: 10 }), node({ id: "b", bytes: 20 })],
      [
        { source: "a", target: "b", kind: "import" },
        { source: "b", target: "a", kind: "import" },
      ],
    );
    const idx = buildOutgoingIndex(g.edges);
    expect(estimateBundleSize(g, "a", idx)).toEqual({
      modules: 2,
      bytes: 30,
      bytesKnown: true,
    });
  });

  it("flags bytesKnown=false when any reachable node lacks bytes", () => {
    const g = graph(
      [
        node({ id: "a", bytes: 100 }),
        node({ id: "b", bytes: undefined as unknown as number }), // legacy graph
      ],
      [{ source: "a", target: "b", kind: "import" }],
    );
    const idx = buildOutgoingIndex(g.edges);
    const out = estimateBundleSize(g, "a", idx);
    expect(out.modules).toBe(2);
    expect(out.bytes).toBe(100);
    expect(out.bytesKnown).toBe(false);
  });

  it("returns zero for an unknown rootId (no crash)", () => {
    const g = graph([node({ id: "a" })]);
    const idx = buildOutgoingIndex(g.edges);
    expect(estimateBundleSize(g, "nope", idx)).toEqual({
      modules: 0,
      bytes: 0,
      bytesKnown: false,
    });
  });
});

describe("buildCycleMembership", () => {
  it("returns an empty map for no cycles", () => {
    expect(buildCycleMembership([]).size).toBe(0);
  });

  it("maps each node to the cycles it belongs to", () => {
    const map = buildCycleMembership([{ nodes: ["a", "b"] }, { nodes: ["b", "c", "d"] }]);
    expect(map.get("a")).toEqual([0]);
    expect(map.get("b")).toEqual([0, 1]);
    expect(map.get("c")).toEqual([1]);
    expect(map.get("d")).toEqual([1]);
  });

  it("does not include nodes that aren't in any cycle", () => {
    const map = buildCycleMembership([{ nodes: ["a", "b"] }]);
    expect(map.has("z")).toBe(false);
  });
});
