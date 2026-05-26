import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Edge, Graph, Node as GraphNode } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { DEFAULT_DETAIL_DEPTH, extractSubtree } from "./subtree";

const here = dirname(fileURLToPath(import.meta.url));
const sampleAppGraph: Graph = JSON.parse(
  readFileSync(join(here, "..", "public", "samples", "sample-app.json"), "utf-8"),
);

const node = (id: string, classification: GraphNode["classification"] = "lib"): GraphNode => ({
  id,
  name: id,
  classification,
  loc: 1,
  exports: [],
  metrics: { Ca: 0, Ce: 0, instability: 0 },
});

const edge = (source: string, target: string, kind: Edge["kind"] = "import"): Edge => ({
  source,
  target,
  kind,
});

function makeGraph(nodes: GraphNode[], edges: Edge[]): Graph {
  return {
    schemaVersion: 1,
    generatedAt: "2026-05-17T00:00:00.000Z",
    rootDir: "/tmp/x",
    stats: { files: nodes.length, nodes: nodes.length, edges: edges.length, cycles: 0, parseMs: 0 },
    nodes,
    edges,
    cycles: [],
  };
}

describe("extractSubtree", () => {
  it("returns just the root for an isolated node", () => {
    const g = makeGraph([node("solo")], []);
    const sub = extractSubtree(g, "solo");
    expect(sub.nodes.map((n) => n.id)).toEqual(["solo"]);
    expect(sub.edges).toEqual([]);
    expect(sub.depthByNode.get("solo")).toBe(0);
    expect(sub.truncated).toBe(false);
  });

  it("walks outgoing edges only (a depends on b, not the reverse)", () => {
    const g = makeGraph([node("a"), node("b")], [edge("a", "b")]);
    const fromA = extractSubtree(g, "a");
    expect(fromA.nodes.map((n) => n.id).sort()).toEqual(["a", "b"]);
    const fromB = extractSubtree(g, "b");
    expect(fromB.nodes.map((n) => n.id).sort()).toEqual(["b"]);
  });

  it("BFS depths are correct on a linear chain", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"].map((id) => node(id)),
      [edge("a", "b"), edge("b", "c"), edge("c", "d")],
    );
    const sub = extractSubtree(g, "a");
    expect(sub.depthByNode.get("a")).toBe(0);
    expect(sub.depthByNode.get("b")).toBe(1);
    expect(sub.depthByNode.get("c")).toBe(2);
    expect(sub.depthByNode.get("d")).toBe(3);
  });

  it("truncates at maxDepth and reports truncated=true", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"].map((id) => node(id)),
      [edge("a", "b"), edge("b", "c"), edge("c", "d")],
    );
    const sub = extractSubtree(g, "a", 2);
    expect(sub.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
    expect(sub.truncated).toBe(true);
  });

  it("does not mark truncated when the BFS finishes within the depth cap", () => {
    const g = makeGraph([node("a"), node("b")], [edge("a", "b")]);
    expect(extractSubtree(g, "a", 4).truncated).toBe(false);
  });

  it("includes only edges whose endpoints are both in the subtree", () => {
    const g = makeGraph(
      ["root", "a", "b", "outside"].map((id) => node(id)),
      [edge("root", "a"), edge("a", "b"), edge("outside", "root")],
    );
    const sub = extractSubtree(g, "root");
    // "outside" reaches root but root's subtree is descendants only.
    expect(sub.nodes.map((n) => n.id).sort()).toEqual(["a", "b", "root"]);
    expect(sub.edges).toHaveLength(2);
    expect(sub.edges.every((e) => sub.nodes.some((n) => n.id === e.source))).toBe(true);
  });

  it("dedupes diamond paths (a→b, a→c, b→d, c→d) without revisiting d", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"].map((id) => node(id)),
      [edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")],
    );
    const sub = extractSubtree(g, "a");
    expect(sub.nodes).toHaveLength(4);
    expect(sub.depthByNode.get("d")).toBe(2); // shortest BFS distance, not 3
  });

  it("collapses multi-edge variants between the same pair into one descent", () => {
    const g = makeGraph(
      [node("a"), node("b")],
      [edge("a", "b", "import"), edge("a", "b", "type-only")],
    );
    const sub = extractSubtree(g, "a");
    expect(sub.nodes).toHaveLength(2);
    // Both edges still appear in the returned edge list; the dedupe only affects
    // graph traversal, not the rendered detail edges.
    expect(sub.edges).toHaveLength(2);
  });

  it("throws when the rootId is not in the graph", () => {
    const g = makeGraph([node("a")], []);
    expect(() => extractSubtree(g, "ghost")).toThrow(/not in graph/);
  });

  it("descends app/page.tsx in the bundled sample-app to its full Phase F fixture subtree", () => {
    const sub = extractSubtree(sampleAppGraph, "app/page.tsx", DEFAULT_DETAIL_DEPTH);
    const ids = new Set(sub.nodes.map((n) => n.id));
    expect(ids).toContain("app/page.tsx");
    expect(ids).toContain("components/Header.tsx");
    expect(ids).toContain("components/Footer.tsx");
    expect(ids).toContain("components/LazyModal.tsx");
    expect(ids).toContain("hooks/useUser.ts");
    expect(ids).toContain("lib/api.ts");
    expect(ids).toContain("lib/utils.ts");
    expect(sub.truncated).toBe(false);
  });
});
