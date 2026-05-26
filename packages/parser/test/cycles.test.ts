import type { Edge } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { findCycles } from "../src/cycles.js";

const edge = (source: string, target: string): Pick<Edge, "source" | "target"> => ({
  source,
  target,
});

describe("findCycles", () => {
  it("finds no cycles in an empty graph", () => {
    expect(findCycles([], [])).toEqual([]);
  });

  it("finds no cycles in a DAG", () => {
    expect(
      findCycles(["a", "b", "c", "d"], [edge("a", "b"), edge("a", "c"), edge("b", "d")]),
    ).toEqual([]);
  });

  it("finds a simple 2-node cycle", () => {
    expect(findCycles(["a", "b"], [edge("a", "b"), edge("b", "a")])).toEqual([
      { nodes: ["a", "b"] },
    ]);
  });

  it("finds a 3-node cycle and sorts node ids alphabetically", () => {
    expect(findCycles(["a", "b", "c"], [edge("a", "b"), edge("b", "c"), edge("c", "a")])).toEqual([
      { nodes: ["a", "b", "c"] },
    ]);
  });

  it("finds multiple disjoint cycles, sorted deterministically", () => {
    const cycles = findCycles(
      ["a", "b", "c", "x", "y", "solo"],
      [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("x", "y"), edge("y", "x")],
    );
    expect(cycles).toEqual([{ nodes: ["a", "b", "c"] }, { nodes: ["x", "y"] }]);
  });

  it("does not report SCCs of size 1 as cycles", () => {
    // gateway -> cycle, but gateway itself is not in any SCC
    const cycles = findCycles(
      ["gateway", "a", "b"],
      [edge("gateway", "a"), edge("a", "b"), edge("b", "a")],
    );
    expect(cycles).toEqual([{ nodes: ["a", "b"] }]);
  });

  it("ignores self-edges (parser already filters them, but be defensive)", () => {
    expect(findCycles(["a"], [edge("a", "a")])).toEqual([]);
  });

  it("collapses multi-edges into one adjacency", () => {
    // Two import flavours between the same pair shouldn't create a phantom cycle.
    expect(findCycles(["a", "b"], [edge("a", "b"), edge("a", "b")])).toEqual([]);
  });

  it("handles a SCC that contains a non-cycle SCC neighbour", () => {
    //   feeder -> a <-> b
    const cycles = findCycles(
      ["feeder", "a", "b"],
      [edge("feeder", "a"), edge("a", "b"), edge("b", "a")],
    );
    expect(cycles).toEqual([{ nodes: ["a", "b"] }]);
  });

  it("scales without stack overflow on a long chain", () => {
    // 5000-node chain: no cycle, no stack overflow.
    const n = 5000;
    const nodes = Array.from({ length: n }, (_, i) => `n${String(i).padStart(5, "0")}`);
    const edges = nodes.slice(1).map((id, i) => edge(nodes[i]!, id));
    expect(findCycles(nodes, edges)).toEqual([]);
  });

  it("scales: detects a single long cycle on a 1000-node ring", () => {
    const n = 1000;
    const nodes = Array.from({ length: n }, (_, i) => `r${String(i).padStart(4, "0")}`);
    const edges = nodes.map((id, i) => edge(id, nodes[(i + 1) % n]!));
    const cycles = findCycles(nodes, edges);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.nodes).toHaveLength(n);
  });
});
