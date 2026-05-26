import type { Graph, Node as GraphNode } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { logHistogram, median, percentile, summariseGraph } from "../src/metrics.js";

const node = (id: string, loc: number, Ca: number, Ce: number): GraphNode => ({
  id,
  name: id,
  classification: "lib",
  loc,
  exports: [],
  metrics: { Ca, Ce, instability: Ca + Ce === 0 ? 0 : Ce / (Ca + Ce) },
});

const graph = (nodes: GraphNode[], extra: Partial<Graph> = {}): Graph => ({
  schemaVersion: 1,
  generatedAt: "2026-05-17T00:00:00.000Z",
  rootDir: "/tmp",
  stats: { files: nodes.length, nodes: nodes.length, edges: 0, cycles: 0, parseMs: 0 },
  nodes,
  edges: [],
  cycles: [],
  ...extra,
});

describe("percentile", () => {
  it("returns 0 on an empty sample", () => {
    expect(percentile([], 0.95)).toBe(0);
  });

  it("returns the max at q=1 and min at q=0", () => {
    expect(percentile([1, 5, 9, 3], 0)).toBe(1);
    expect(percentile([1, 5, 9, 3], 1)).toBe(9);
  });

  it("uses nearest-rank for arbitrary q", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(values, 0.95)).toBe(95);
  });

  it("does not mutate the input array", () => {
    const input = [3, 1, 2];
    percentile(input, 0.5);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe("median", () => {
  it("returns 0 for an empty sample", () => {
    expect(median([])).toBe(0);
  });

  it("picks the middle value for odd lengths", () => {
    expect(median([9, 1, 5])).toBe(5);
  });

  it("averages the two middle values for even lengths", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe("summariseGraph", () => {
  it("returns zeros for an empty graph", () => {
    const s = summariseGraph(graph([]));
    expect(s.totalLOC).toBe(0);
    expect(s.p95NodeDegree).toBe(0);
    expect(s.maxInstability).toBe(0);
    expect(s.hottestNode).toBe("");
    expect(s.unusedDeps).toBe(0);
    expect(s.deadModules).toBe(0);
    expect(s.workspaces).toBe(0);
    expect(s.degrees).toEqual([]);
    expect(s.classification.lib).toBe(0);
  });

  it("sums LOC and emits one degree per node", () => {
    const s = summariseGraph(graph([node("a", 10, 0, 2), node("b", 20, 1, 0), node("c", 5, 4, 0)]));
    expect(s.totalLOC).toBe(35);
    expect(s.degrees.sort()).toEqual([1, 2, 4].sort());
  });

  it("counts unused deps and workspaces from the graph", () => {
    const s = summariseGraph(
      graph([node("a", 1, 0, 0)], {
        unusedDependencies: [{ workspace: "", name: "lodash", kind: "dependencies" }],
        workspaces: [{ name: "web", path: "apps/web" }],
      }),
    );
    expect(s.unusedDeps).toBe(1);
    expect(s.workspaces).toBe(1);
  });

  it("hottestNode picks the highest Ca (afferent coupling)", () => {
    const s = summariseGraph(
      graph([node("page", 1, 0, 5), node("hub", 1, 7, 0), node("leaf", 1, 1, 0)]),
    );
    expect(s.hottestNode).toBe("hub");
  });

  it("maxInstability is the highest I observed", () => {
    const s = summariseGraph(
      graph([node("page", 1, 0, 3), node("middle", 1, 2, 2), node("leaf", 1, 4, 0)]),
    );
    expect(s.maxInstability).toBe(1);
  });

  it("p95NodeDegree lands on the hub when ≥ 5% of nodes are outliers", () => {
    const nodes: GraphNode[] = [];
    for (let i = 0; i < 9; i++) nodes.push(node(`a${i}`, 1, 0, 1));
    nodes.push(node("hub", 1, 50, 0));
    const s = summariseGraph(graph(nodes));
    expect(s.p95NodeDegree).toBe(50);
  });
});

describe("logHistogram", () => {
  it("returns an empty array on no degrees", () => {
    expect(logHistogram([])).toEqual([]);
  });

  it("places single-degree samples in the right bins", () => {
    const bins = logHistogram([0, 1, 2, 3, 4, 7, 8, 15, 16]);
    const byLabel = new Map(bins.map((b) => [b.label, b.count]));
    expect(byLabel.get("0")).toBe(1);
    expect(byLabel.get("1")).toBe(1);
    expect(byLabel.get("2-3")).toBe(2);
    expect(byLabel.get("4-7")).toBe(2);
    expect(byLabel.get("8-15")).toBe(2);
    expect(byLabel.get("16-31")).toBe(1);
  });
});
