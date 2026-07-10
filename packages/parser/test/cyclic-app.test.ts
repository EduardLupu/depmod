import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GraphSchema } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { analyze } from "../src";

// @ts-ignore
const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(here, "fixtures", "cyclic-app");
const FIXED_NOW = new Date("2026-05-17T00:00:00.000Z");

describe("analyze(cyclic-app)", () => {
  it("produces a graph that validates against GraphSchema", async () => {
    const graph = await analyze(FIXTURE_ROOT, { now: FIXED_NOW, cache: false });
    expect(() => GraphSchema.parse(graph)).not.toThrow();
  });

  it("detects the 3-cycle {a, b, c} and the 2-cycle {x, y}", async () => {
    const graph = await analyze(FIXTURE_ROOT, { now: FIXED_NOW, cache: false });
    expect(graph.cycles).toEqual([
      { nodes: ["a.ts", "b.ts", "c.ts"] },
      { nodes: ["x.ts", "y.ts"] },
    ]);
    expect(graph.stats.cycles).toBe(2);
  });

  it("computes metrics that reflect cycle membership", async () => {
    const graph = await analyze(FIXTURE_ROOT, { now: FIXED_NOW, cache: false });
    const by = new Map(graph.nodes.map((n) => [n.id, n.metrics]));

    // a.ts: imported by c.ts (cycle) and gateway.ts → Ca=2; imports b.ts → Ce=1 → I=1/3
    expect(by.get("a.ts")).toEqual({ Ca: 2, Ce: 1, instability: 1 / 3 });
    // b.ts: Ca=1 (a.ts), Ce=1 (c.ts) → I=0.5
    expect(by.get("b.ts")).toEqual({ Ca: 1, Ce: 1, instability: 0.5 });
    // c.ts: Ca=1 (b.ts), Ce=1 (a.ts) → I=0.5
    expect(by.get("c.ts")).toEqual({ Ca: 1, Ce: 1, instability: 0.5 });
    // x.ts and y.ts: each Ca=1, Ce=1 → I=0.5
    expect(by.get("x.ts")).toEqual({ Ca: 1, Ce: 1, instability: 0.5 });
    expect(by.get("y.ts")).toEqual({ Ca: 1, Ce: 1, instability: 0.5 });
    // gateway.ts: Ca=0, Ce=1 → I=1 (sits outside any SCC)
    expect(by.get("gateway.ts")).toEqual({ Ca: 0, Ce: 1, instability: 1 });
    // solo.ts: no imports, no dependents → I=0
    expect(by.get("solo.ts")).toEqual({ Ca: 0, Ce: 0, instability: 0 });
  });

  it("emits every cycle node within a `cycles[]` entry that the schema accepts", async () => {
    const graph = await analyze(FIXTURE_ROOT, { now: FIXED_NOW, cache: false });
    for (const cycle of graph.cycles) {
      expect(cycle.nodes.length).toBeGreaterThanOrEqual(2);
      for (const id of cycle.nodes) {
        expect(graph.nodes.some((n) => n.id === id)).toBe(true);
      }
    }
  });
});
