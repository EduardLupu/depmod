import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type Graph,
  GraphSchema,
  SCHEMA_VERSION,
  parseGraph,
  safeParseGraph,
} from "../src/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "fixtures", "sample-graph.json");
const fixture: unknown = JSON.parse(readFileSync(fixturePath, "utf-8"));

describe("GraphSchema", () => {
  it("round-trips a hand-written fixture", () => {
    const parsed = parseGraph(fixture);

    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.nodes).toHaveLength(6);
    expect(parsed.edges).toHaveLength(8);
    expect(parsed.cycles).toHaveLength(0);

    expect(parsed.stats).toEqual({
      files: 6,
      nodes: 6,
      edges: 8,
      cycles: 0,
      parseMs: 142,
    });

    const utils = parsed.nodes.find((n) => n.id === "lib/utils.ts");
    expect(utils?.classification).toBe("lib");
    expect(utils?.metrics).toEqual({ Ca: 4, Ce: 0, instability: 0 });

    const page = parsed.nodes.find((n) => n.id === "app/page.tsx");
    expect(page?.classification).toBe("page");
    expect(page?.metrics.instability).toBe(1);
  });

  it("re-emits identical JSON after parse (no field loss)", () => {
    const parsed = parseGraph(fixture);
    // JSON.parse/stringify on both sides normalizes ordering quirks; deepEqual on
    // the parsed object is enough to prove no field is silently dropped.
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(fixture);
  });

  it("accepts a programmatically constructed minimal graph", () => {
    const minimal: Graph = {
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      rootDir: "/tmp/empty",
      stats: { files: 0, nodes: 0, edges: 0, cycles: 0, parseMs: 0 },
      nodes: [],
      edges: [],
      cycles: [],
    };
    expect(parseGraph(minimal)).toEqual(minimal);
  });

  it("accepts an optional metricsRuntimeOnly field (forward-compat)", () => {
    const withRuntime: Graph = {
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      rootDir: "/tmp/x",
      stats: { files: 1, nodes: 1, edges: 0, cycles: 0, parseMs: 1 },
      nodes: [
        {
          id: "a.ts",
          name: "a.ts",
          classification: "lib",
          loc: 1,
          exports: [],
          metrics: { Ca: 2, Ce: 0, instability: 0 },
          metricsRuntimeOnly: { Ca: 1, Ce: 0, instability: 0 },
        },
      ],
      edges: [],
      cycles: [],
    };
    expect(parseGraph(withRuntime)).toEqual(withRuntime);
  });

  it("accepts a v1 graph WITHOUT metricsRuntimeOnly (backward-compat)", () => {
    // Older graphs never wrote this field. They must still validate.
    expect(parseGraph(fixture).nodes[0]?.metricsRuntimeOnly).toBeUndefined();
  });

  it("accepts a graph with a single 2-node cycle", () => {
    const cyclic: Graph = {
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      rootDir: "/tmp/cyclic",
      stats: { files: 2, nodes: 2, edges: 2, cycles: 1, parseMs: 5 },
      nodes: [
        {
          id: "a.ts",
          name: "a.ts",
          classification: "lib",
          loc: 1,
          exports: [],
          metrics: { Ca: 1, Ce: 1, instability: 0.5 },
        },
        {
          id: "b.ts",
          name: "b.ts",
          classification: "lib",
          loc: 1,
          exports: [],
          metrics: { Ca: 1, Ce: 1, instability: 0.5 },
        },
      ],
      edges: [
        { source: "a.ts", target: "b.ts", kind: "import" },
        { source: "b.ts", target: "a.ts", kind: "import" },
      ],
      cycles: [{ nodes: ["a.ts", "b.ts"] }],
    };
    expect(parseGraph(cyclic)).toEqual(cyclic);
  });

  describe("rejects invalid input", () => {
    it("rejects a wrong schema version", () => {
      const result = safeParseGraph({ ...(fixture as object), schemaVersion: 2 });
      expect(result.success).toBe(false);
    });

    it("rejects an unknown classification", () => {
      const bad = structuredClone(fixture) as Graph;
      // biome-ignore lint/suspicious/noExplicitAny: deliberately violating the type for the test
      (bad.nodes[0] as any).classification = "container";
      expect(safeParseGraph(bad).success).toBe(false);
    });

    it("rejects an unknown edge kind", () => {
      const bad = structuredClone(fixture) as Graph;
      // biome-ignore lint/suspicious/noExplicitAny: deliberately violating the type for the test
      (bad.edges[0] as any).kind = "side-effect";
      expect(safeParseGraph(bad).success).toBe(false);
    });

    it("rejects instability outside [0, 1]", () => {
      const bad = structuredClone(fixture) as Graph;
      bad.nodes[0]!.metrics.instability = 1.5;
      expect(safeParseGraph(bad).success).toBe(false);
    });

    it("rejects a non-ISO generatedAt", () => {
      const bad = { ...(fixture as object), generatedAt: "yesterday" };
      expect(safeParseGraph(bad).success).toBe(false);
    });

    it("rejects a cycle with fewer than 2 nodes", () => {
      const bad = structuredClone(fixture) as Graph;
      bad.cycles = [{ nodes: ["a.ts"] }];
      expect(safeParseGraph(bad).success).toBe(false);
    });

    it("rejects a missing required field", () => {
      const bad = structuredClone(fixture) as Partial<Graph>;
      // biome-ignore lint/performance/noDelete: testing schema rejection of missing field
      delete bad.stats;
      expect(safeParseGraph(bad).success).toBe(false);
    });
  });
});
