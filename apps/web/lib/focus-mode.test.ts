import type { Edge, Graph, Node as GraphNode } from "@depmod/types";
import { describe, expect, it } from "vitest";
import {
  FOCUS_MODE_MAX_DEPTH,
  FOCUS_MODE_MIN_DEPTH,
  clampFocusDepth,
  computeFocusNeighborhood,
} from "./focus-mode";

const node = (id: string): GraphNode => ({
  id,
  name: id,
  classification: "lib",
  loc: 1,
  exports: [],
  metrics: { Ca: 0, Ce: 0, instability: 0 },
});

const edge = (source: string, target: string, kind: Edge["kind"] = "import"): Edge => ({
  source,
  target,
  kind,
});

function graph(nodes: GraphNode[], edges: Edge[]): Graph {
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

describe("computeFocusNeighborhood", () => {
  it("returns an empty neighborhood for an unknown root", () => {
    const out = computeFocusNeighborhood(graph([node("a")], []), "ghost");
    expect(out.size).toBe(0);
    expect(out.depthByNode.size).toBe(0);
  });

  it("includes the root at depth 0 even with no edges", () => {
    const out = computeFocusNeighborhood(graph([node("solo")], []), "solo");
    expect(out.depthByNode.get("solo")).toBe(0);
    expect(out.size).toBe(1);
    expect(out.maxObservedDepth).toBe(0);
  });

  it("traverses BOTH outgoing and incoming edges as one hop", () => {
    // c → b → a → d.  Focus on `a` at depth 1 should include {a, b, d}.
    const g = graph(
      [node("a"), node("b"), node("c"), node("d")],
      [edge("b", "a"), edge("c", "b"), edge("a", "d")],
    );
    const out = computeFocusNeighborhood(g, "a", 1);
    expect(out.depthByNode.get("a")).toBe(0);
    expect(out.depthByNode.get("b")).toBe(1);
    expect(out.depthByNode.get("d")).toBe(1);
    expect(out.depthByNode.has("c")).toBe(false);
    expect(out.size).toBe(3);
  });

  it("reaches further hops at higher depth", () => {
    const g = graph(
      [node("a"), node("b"), node("c"), node("d")],
      [edge("b", "a"), edge("c", "b"), edge("a", "d")],
    );
    const out = computeFocusNeighborhood(g, "a", 2);
    expect(out.depthByNode.get("c")).toBe(2);
    expect(out.size).toBe(4);
    expect(out.maxObservedDepth).toBe(2);
  });

  it("collapses multi-edges between the same pair to one hop", () => {
    // Header imports utils both as value AND as type-only. Should not double
    // the depth count.
    const g = graph(
      [node("Header"), node("utils")],
      [edge("Header", "utils", "import"), edge("Header", "utils", "type-only")],
    );
    const out = computeFocusNeighborhood(g, "Header", 1);
    expect(out.depthByNode.get("utils")).toBe(1);
    expect(out.size).toBe(2);
  });

  it("clamps depth to the legal range", () => {
    const g = graph([node("a"), node("b"), node("c")], [edge("a", "b"), edge("b", "c")]);
    // depth = 0 floors to FOCUS_MODE_MIN_DEPTH = 1
    expect(computeFocusNeighborhood(g, "a", 0).size).toBe(2);
    // depth = 999 caps to FOCUS_MODE_MAX_DEPTH = 6, but graph only has 3 nodes
    expect(computeFocusNeighborhood(g, "a", 999).size).toBe(3);
  });

  it("treats every edge kind as a real hop", () => {
    const g = graph(
      [node("a"), node("b"), node("c")],
      [edge("a", "b", "type-only"), edge("b", "c", "dynamic")],
    );
    const out = computeFocusNeighborhood(g, "a", 2);
    expect(out.size).toBe(3);
  });
});

describe("clampFocusDepth", () => {
  it("clamps below the minimum", () => {
    expect(clampFocusDepth(-5)).toBe(FOCUS_MODE_MIN_DEPTH);
    expect(clampFocusDepth(0)).toBe(FOCUS_MODE_MIN_DEPTH);
  });

  it("clamps above the maximum", () => {
    expect(clampFocusDepth(99)).toBe(FOCUS_MODE_MAX_DEPTH);
  });

  it("truncates non-integer input", () => {
    expect(clampFocusDepth(2.7)).toBe(2);
  });

  it("falls back to the default on non-finite input", () => {
    // Both NaN and ±Infinity are treated as "garbage in → safe default" so a
    // bug elsewhere can't silently push the canvas into a degenerate state.
    expect(clampFocusDepth(Number.NaN)).toBe(2);
    expect(clampFocusDepth(Number.POSITIVE_INFINITY)).toBe(2);
    expect(clampFocusDepth(Number.NEGATIVE_INFINITY)).toBe(2);
  });
});
