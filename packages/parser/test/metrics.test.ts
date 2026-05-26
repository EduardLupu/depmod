import type { Edge } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { computeMetrics } from "../src/metrics.js";

const edge = (source: string, target: string, kind: Edge["kind"] = "import"): Edge => ({
  source,
  target,
  kind,
});

describe("computeMetrics", () => {
  it("returns zero metrics for an empty graph", () => {
    expect(computeMetrics([], [])).toEqual(new Map());
  });

  it("returns zero metrics for isolated nodes", () => {
    const out = computeMetrics(["a", "b"], []);
    expect(out.get("a")).toEqual({ Ca: 0, Ce: 0, instability: 0 });
    expect(out.get("b")).toEqual({ Ca: 0, Ce: 0, instability: 0 });
  });

  it("computes Ca, Ce, and instability for a simple chain", () => {
    // a -> b -> c
    const out = computeMetrics(["a", "b", "c"], [edge("a", "b"), edge("b", "c")]);
    expect(out.get("a")).toEqual({ Ca: 0, Ce: 1, instability: 1 });
    expect(out.get("b")).toEqual({ Ca: 1, Ce: 1, instability: 0.5 });
    expect(out.get("c")).toEqual({ Ca: 1, Ce: 0, instability: 0 });
  });

  it("collapses multi-edges between the same (source, target) pair", () => {
    // Header has BOTH a value import AND a type-only import of utils.
    const out = computeMetrics(
      ["Header", "utils"],
      [edge("Header", "utils", "import"), edge("Header", "utils", "type-only")],
    );
    expect(out.get("Header")).toEqual({ Ca: 0, Ce: 1, instability: 1 });
    expect(out.get("utils")).toEqual({ Ca: 1, Ce: 0, instability: 0 });
  });

  it("treats dynamic imports as real dependencies", () => {
    const out = computeMetrics(["page", "lazy"], [edge("page", "lazy", "dynamic")]);
    expect(out.get("page")?.Ce).toBe(1);
    expect(out.get("lazy")?.Ca).toBe(1);
  });

  it("ignores edges that reference unknown nodes", () => {
    const out = computeMetrics(["a"], [edge("a", "ghost"), edge("ghost", "a")]);
    expect(out.get("a")).toEqual({ Ca: 0, Ce: 0, instability: 0 });
  });

  it("ignores self-edges", () => {
    const out = computeMetrics(["a"], [edge("a", "a")]);
    expect(out.get("a")).toEqual({ Ca: 0, Ce: 0, instability: 0 });
  });

  it("uses instability = 0 when Ca + Ce = 0 (avoids NaN)", () => {
    const out = computeMetrics(["solo"], []);
    expect(out.get("solo")?.instability).toBe(0);
    expect(Number.isNaN(out.get("solo")?.instability)).toBe(false);
  });

  describe("excludeEdgeKinds", () => {
    it("filters type-only edges by default", () => {
      // A imports B at runtime; A only imports C's *type* (erased at compile time).
      const out = computeMetrics(
        ["A", "B", "C"],
        [edge("A", "B", "import"), edge("A", "C", "type-only")],
      );
      // Default excludes "type-only", so C is not a real dependency of A.
      expect(out.get("A")).toEqual({ Ca: 0, Ce: 1, instability: 1 });
      expect(out.get("B")).toEqual({ Ca: 1, Ce: 0, instability: 0 });
      expect(out.get("C")).toEqual({ Ca: 0, Ce: 0, instability: 0 });
    });

    it("counts type-only edges when excludeEdgeKinds is empty", () => {
      // Same graph, but the caller asks for the full (include-type-only) view.
      const out = computeMetrics(
        ["A", "B", "C"],
        [edge("A", "B", "import"), edge("A", "C", "type-only")],
        { excludeEdgeKinds: [] },
      );
      expect(out.get("A")).toEqual({ Ca: 0, Ce: 2, instability: 1 });
      expect(out.get("C")).toEqual({ Ca: 1, Ce: 0, instability: 0 });
    });

    it("honours an arbitrary exclusion set", () => {
      // Exclude both dynamic and type-only → only the static value import survives.
      const out = computeMetrics(
        ["A", "B", "C", "D"],
        [edge("A", "B", "import"), edge("A", "C", "dynamic"), edge("A", "D", "type-only")],
        { excludeEdgeKinds: ["dynamic", "type-only"] },
      );
      expect(out.get("A")?.Ce).toBe(1);
      expect(out.get("B")?.Ca).toBe(1);
      expect(out.get("C")?.Ca).toBe(0);
      expect(out.get("D")?.Ca).toBe(0);
    });

    it("preserves multi-edge collapse when a value import shadows the same target", () => {
      // Header has BOTH a value import AND a type-only import of utils.
      // Default (filter type-only): the value import keeps the dependency → Ce=1.
      // Empty exclusion list: multi-edge collapses → Ce=1 either way.
      const collapsed = computeMetrics(
        ["Header", "utils"],
        [edge("Header", "utils", "import"), edge("Header", "utils", "type-only")],
      );
      expect(collapsed.get("Header")).toEqual({ Ca: 0, Ce: 1, instability: 1 });

      const full = computeMetrics(
        ["Header", "utils"],
        [edge("Header", "utils", "import"), edge("Header", "utils", "type-only")],
        { excludeEdgeKinds: [] },
      );
      expect(full.get("Header")).toEqual({ Ca: 0, Ce: 1, instability: 1 });
    });
  });

  it("matches the proposal: I=0 for stable cores, I=1 for unstable consumers", () => {
    //          page
    //        /  |   \
    //   Header Foot  hook
    //      \    |    /
    //       \   |   /
    //         utils
    const out = computeMetrics(
      ["page", "Header", "Footer", "hook", "utils"],
      [
        edge("page", "Header"),
        edge("page", "Footer"),
        edge("page", "hook"),
        edge("Header", "utils"),
        edge("Footer", "utils"),
        edge("hook", "utils"),
      ],
    );
    expect(out.get("page")).toEqual({ Ca: 0, Ce: 3, instability: 1 });
    expect(out.get("utils")).toEqual({ Ca: 3, Ce: 0, instability: 0 });
    expect(out.get("Header")).toEqual({ Ca: 1, Ce: 1, instability: 0.5 });
  });
});
