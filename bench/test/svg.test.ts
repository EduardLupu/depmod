import { describe, expect, it } from "vitest";
import { histogramDegrees, scatterParserPerf } from "../src/svg.js";
import type { BenchResult } from "../src/types.js";

const result = (overrides: Partial<BenchResult> = {}): BenchResult => ({
  target: { name: "demo", repo: "https://example/demo.git", ref: null, tier: "primary" },
  row: {
    repo: "demo",
    sha: "deadbeef",
    generatedAt: "2026-05-17T00:00:00.000Z",
    files: 10,
    nodes: 10,
    edges: 13,
    cycles: 0,
    totalLOC: 1234,
    parseMs: 87,
    p95NodeDegree: 6,
    maxInstability: 1,
    hottestNode: "lib/utils.ts",
  },
  degrees: [0, 1, 1, 2, 2, 3, 5, 5, 8, 14],
  ...overrides,
});

describe("scatterParserPerf", () => {
  it("returns a self-contained SVG document", () => {
    const svg = scatterParserPerf([result()]);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("labels every target by name", () => {
    const svg = scatterParserPerf([
      result({ target: { name: "alpha", repo: "u", ref: null, tier: "primary" } }),
      result({ target: { name: "bravo", repo: "u", ref: null, tier: "medium" } }),
    ]);
    expect(svg).toContain(">alpha<");
    expect(svg).toContain(">bravo<");
  });

  it("includes the chart title", () => {
    const svg = scatterParserPerf([result()]);
    expect(svg).toContain("Parser wall-clock vs codebase size");
  });

  it("does not crash on a single-target run", () => {
    expect(() => scatterParserPerf([result()])).not.toThrow();
  });
});

describe("histogramDegrees", () => {
  it("returns a self-contained SVG document", () => {
    const svg = histogramDegrees(result());
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("includes the target name in the title", () => {
    const svg = histogramDegrees(
      result({ target: { name: "alpha", repo: "u", ref: null, tier: "medium" } }),
    );
    expect(svg).toContain("Node-degree distribution");
    expect(svg).toContain("alpha");
  });

  it("renders a bar (rect) for at least one bin", () => {
    const svg = histogramDegrees(result());
    expect(svg).toMatch(/<rect[^>]*fill=/);
  });

  it("survives a zero-degree-only graph (no max, no NaN viewport)", () => {
    const svg = histogramDegrees(result({ degrees: [0, 0, 0] }));
    expect(svg).toContain("</svg>");
    expect(svg).not.toContain("NaN");
  });
});
