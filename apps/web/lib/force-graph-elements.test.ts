import type { Edge, Graph, Node as GraphNode } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { DEFAULT_CLASSIFICATION_MODES } from "./classification-filters";
import { toForceGraphData } from "./force-graph-elements";
import { parsePathMask } from "./path-mask";
import { DEFAULT_VIEW_FILTERS } from "./view-graph";

function node(over: Partial<GraphNode> & Pick<GraphNode, "id">): GraphNode {
  return {
    name: over.id.split("/").pop() ?? over.id,
    classification: "lib",
    loc: 20,
    exports: [],
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

const baseline = () => ({
  classificationModes: { ...DEFAULT_CLASSIFICATION_MODES },
  pathMask: parsePathMask(""),
  viewFilters: { ...DEFAULT_VIEW_FILTERS },
});

describe("toForceGraphData", () => {
  it("returns one node per visible source", () => {
    const g = graph([node({ id: "a.ts" }), node({ id: "b.ts" })]);
    const out = toForceGraphData({ graph: g, ...baseline() });
    expect(out.nodes.map((n) => n.id).sort()).toEqual(["a.ts", "b.ts"]);
  });

  it("drops links whose endpoints were hidden", () => {
    const g = graph(
      [node({ id: "a.ts" }), node({ id: "b.ts" })],
      [{ source: "a.ts", target: "b.ts", kind: "import" }],
    );
    const out = toForceGraphData({
      graph: g,
      ...baseline(),
      pathMask: parsePathMask("!b.*"),
    });
    expect(out.nodes.map((n) => n.id)).toEqual(["a.ts"]);
    expect(out.links).toEqual([]);
  });

  it("marks cycle edges with inCycle = true", () => {
    const g = graph(
      [node({ id: "a.ts" }), node({ id: "b.ts" })],
      [
        { source: "a.ts", target: "b.ts", kind: "import" },
        { source: "b.ts", target: "a.ts", kind: "import" },
      ],
      [{ nodes: ["a.ts", "b.ts"] }],
    );
    const out = toForceGraphData({ graph: g, ...baseline() });
    expect(out.links).toHaveLength(2);
    expect(out.links.every((l) => l.inCycle)).toBe(true);
  });

  it("flags `dimmed` classifications as dimmed (still visible)", () => {
    const g = graph([
      node({ id: "src/lib/x.ts", classification: "lib" }),
      node({ id: "src/components/Y.tsx", classification: "component" }),
    ]);
    const out = toForceGraphData({
      graph: g,
      ...baseline(),
      classificationModes: { ...DEFAULT_CLASSIFICATION_MODES, lib: "dimmed" },
    });
    const lib = out.nodes.find((n) => n.id === "src/lib/x.ts");
    expect(lib?.dimmed).toBe(true);
    const comp = out.nodes.find((n) => n.id === "src/components/Y.tsx");
    expect(comp?.dimmed).toBe(false);
  });

  it("excludes classifications set to 'excluded'", () => {
    const g = graph([
      node({ id: "src/lib/x.ts", classification: "lib" }),
      node({ id: "src/components/Y.tsx", classification: "component" }),
    ]);
    const out = toForceGraphData({
      graph: g,
      ...baseline(),
      classificationModes: { ...DEFAULT_CLASSIFICATION_MODES, lib: "excluded" },
    });
    expect(out.nodes.map((n) => n.id)).toEqual(["src/components/Y.tsx"]);
  });

  it("respects solo: keeps only the soloed classification", () => {
    const g = graph([
      node({ id: "a.ts", classification: "lib" }),
      node({ id: "b.tsx", classification: "component" }),
    ]);
    const out = toForceGraphData({
      graph: g,
      ...baseline(),
      classificationModes: { ...DEFAULT_CLASSIFICATION_MODES, lib: "solo" },
    });
    expect(out.nodes.map((n) => n.id)).toEqual(["a.ts"]);
  });

  it("clamps very large LOC values into the visual range", () => {
    const g = graph([node({ id: "huge.ts", loc: 10_000 })]);
    const out = toForceGraphData({ graph: g, ...baseline() });
    expect(out.nodes[0]?.val).toBeLessThanOrEqual(250);
  });
});
