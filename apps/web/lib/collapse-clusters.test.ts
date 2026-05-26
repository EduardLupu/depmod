import type { Edge, Graph, Node as GraphNode } from "@depmod/types";
import { describe, expect, it } from "vitest";
import {
  type CollapsedEdgeData,
  type CollapsedNodeData,
  toCollapsedElements,
} from "./collapse-clusters";

const node = (id: string, loc = 10): GraphNode => ({
  id,
  name: id.split("/").pop() ?? id,
  classification: "lib",
  loc,
  exports: [],
  metrics: { Ca: 0, Ce: 0, instability: 0 },
});

const edge = (source: string, target: string, kind: Edge["kind"] = "import"): Edge => ({
  source,
  target,
  kind,
});

function graphOf(nodes: GraphNode[], edges: Edge[]): Graph {
  return {
    schemaVersion: 1,
    generatedAt: "2026-05-17T00:00:00.000Z",
    rootDir: "/tmp",
    stats: { files: nodes.length, nodes: nodes.length, edges: edges.length, cycles: 0, parseMs: 0 },
    nodes,
    edges,
    cycles: [],
  };
}

function asNodes(elements: ReturnType<typeof toCollapsedElements>): CollapsedNodeData[] {
  return elements
    .filter((e) => e.group === "nodes")
    .map((e) => e.data as unknown as CollapsedNodeData);
}

function asEdges(elements: ReturnType<typeof toCollapsedElements>): CollapsedEdgeData[] {
  return elements
    .filter((e) => e.group === "edges")
    .map((e) => e.data as unknown as CollapsedEdgeData);
}

describe("toCollapsedElements", () => {
  it("returns an empty list for an empty graph", () => {
    expect(toCollapsedElements(graphOf([], []))).toEqual([]);
  });

  it("buckets files into top-2 directory super-nodes", () => {
    const g = graphOf(
      [
        node("apps/web/page.tsx", 30),
        node("apps/web/layout.tsx", 20),
        node("packages/parser/src/p.ts", 15),
      ],
      [],
    );
    const nodes = asNodes(toCollapsedElements(g));
    expect(nodes.map((n) => n.id).sort()).toEqual(["apps/web", "packages/parser"]);
    const appsWeb = nodes.find((n) => n.id === "apps/web");
    expect(appsWeb).toBeDefined();
    expect(appsWeb?.isCluster).toBe(true);
    expect(appsWeb?.fileCount).toBe(2);
    expect(appsWeb?.loc).toBe(50);
    expect(appsWeb?.label).toBe("web");
  });

  it("passes repo-root files through as their own non-cluster nodes", () => {
    const g = graphOf([node("README.ts"), node("apps/web/page.tsx")], []);
    const nodes = asNodes(toCollapsedElements(g));
    const readme = nodes.find((n) => n.id === "README.ts");
    expect(readme).toBeDefined();
    expect(readme?.isCluster).toBe(false);
    expect(readme?.fileCount).toBe(1);
    expect(readme?.label).toBe("README.ts");
  });

  it("aggregates inter-cluster edges with cumulative weight", () => {
    const g = graphOf(
      [
        node("apps/web/page.tsx"),
        node("apps/web/layout.tsx"),
        node("packages/parser/src/p.ts"),
        node("packages/parser/src/q.ts"),
      ],
      [
        edge("apps/web/page.tsx", "packages/parser/src/p.ts"),
        edge("apps/web/layout.tsx", "packages/parser/src/q.ts"),
      ],
    );
    const edges = asEdges(toCollapsedElements(g));
    expect(edges).toHaveLength(1);
    expect(edges[0]).toEqual({
      id: "apps/web|packages/parser",
      source: "apps/web",
      target: "packages/parser",
      weight: 2,
    });
  });

  it("drops intra-cluster edges entirely", () => {
    const g = graphOf(
      [node("apps/web/page.tsx"), node("apps/web/layout.tsx")],
      [edge("apps/web/page.tsx", "apps/web/layout.tsx")],
    );
    expect(asEdges(toCollapsedElements(g))).toEqual([]);
  });

  it("preserves multi-edge contributions to the weight", () => {
    // Two separate (source, target) value AND type-only edges in the underlying
    // graph each add 1 to the inter-cluster weight.
    const g = graphOf(
      [node("a/x.ts"), node("b/y.ts")],
      [edge("a/x.ts", "b/y.ts", "import"), edge("a/x.ts", "b/y.ts", "type-only")],
    );
    const edges = asEdges(toCollapsedElements(g));
    expect(edges).toHaveLength(1);
    expect(edges[0]?.weight).toBe(2);
  });

  it("produces deterministic output ordering", () => {
    const g = graphOf(
      [node("z/last.ts"), node("a/first.ts"), node("m/mid.ts")],
      [edge("z/last.ts", "a/first.ts"), edge("m/mid.ts", "z/last.ts")],
    );
    const elements = toCollapsedElements(g);
    const nodes = asNodes(elements);
    expect(nodes.map((n) => n.id)).toEqual(["a", "m", "z"]);
    const edges = asEdges(elements);
    expect(edges.map((e) => `${e.source}->${e.target}`)).toEqual(["m->z", "z->a"]);
  });

  it("captures every underlying child id in childIds", () => {
    const g = graphOf([node("apps/web/a.ts"), node("apps/web/b.ts"), node("apps/web/c.ts")], []);
    const nodes = asNodes(toCollapsedElements(g));
    expect(nodes[0]?.childIds).toEqual(["apps/web/a.ts", "apps/web/b.ts", "apps/web/c.ts"]);
  });
});
