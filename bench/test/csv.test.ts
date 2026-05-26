import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, toCsv } from "../src/csv.js";
import type { BenchRow } from "../src/types.js";

const row = (overrides: Partial<BenchRow> = {}): BenchRow => ({
  repo: "demo",
  sha: "deadbeef",
  generatedAt: "2026-05-17T00:00:00.000Z",
  files: 10,
  nodes: 10,
  edges: 13,
  cycles: 0,
  totalLOC: 1234,
  parseMs: 87,
  parserMs: 80,
  p95NodeDegree: 6,
  maxInstability: 1,
  hottestNode: "lib/utils.ts",
  unusedDeps: 2,
  deadModules: 1,
  workspaces: 3,
  ...overrides,
});

describe("toCsv", () => {
  it("emits the canonical column header in declared order", () => {
    const out = toCsv([row()]);
    const header = out.split("\n")[0];
    expect(header).toBe(CSV_COLUMNS.join(","));
  });

  it("ends with a trailing newline", () => {
    const out = toCsv([row()]);
    expect(out.endsWith("\n")).toBe(true);
  });

  it("emits one data line per row", () => {
    const out = toCsv([row({ repo: "a" }), row({ repo: "b" }), row({ repo: "c" })]);
    expect(out.trim().split("\n")).toHaveLength(4); // header + 3
  });

  it("fixes float precision to 4 decimal places (diff-stable across runs)", () => {
    const out = toCsv([row({ maxInstability: 0.6666666666666666 })]);
    expect(out).toContain("0.6667");
  });

  it("RFC-4180 quotes commas in string fields", () => {
    const out = toCsv([row({ hottestNode: "lib/utils, with comma.ts" })]);
    expect(out).toContain('"lib/utils, with comma.ts"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    const out = toCsv([row({ hottestNode: 'lib/with"quote.ts' })]);
    expect(out).toContain('"lib/with""quote.ts"');
  });

  it("does not quote plain identifiers", () => {
    const out = toCsv([row({ hottestNode: "lib/utils.ts" })]);
    expect(out).toContain("lib/utils.ts");
    expect(out).not.toContain('"lib/utils.ts"');
  });

  it("preserves integer precision (no .0000 suffix on ints)", () => {
    const out = toCsv([row({ files: 100, parseMs: 87 })]);
    expect(out).toMatch(/,100,/);
    expect(out).toMatch(/,87,/);
    expect(out).not.toContain("100.0000");
  });
});
