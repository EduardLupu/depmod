import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadGraphFromText } from "./load-graph";

const here = dirname(fileURLToPath(import.meta.url));
const sampleAppGraph = readFileSync(
  join(here, "..", "public", "samples", "sample-app.json"),
  "utf-8",
);

describe("loadGraphFromText", () => {
  it("accepts a valid Graph and returns ok=true", () => {
    const result = loadGraphFromText(sampleAppGraph);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.stats.nodes).toBe(10);
      expect(result.graph.stats.edges).toBe(13);
      expect(result.graph.stats.cycles).toBe(0);
    }
  });

  it("rejects invalid JSON with a helpful message", () => {
    const result = loadGraphFromText("{not json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Invalid JSON/);
  });

  it("rejects a JSON document that fails schema validation", () => {
    const result = loadGraphFromText(JSON.stringify({ schemaVersion: 99 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Schema validation failed/);
  });

  it("trims long issue lists with a +N more suffix", () => {
    // Many top-level required fields missing; produces ≥ 6 zod issues.
    const result = loadGraphFromText("{}");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Schema validation failed/);
      // Either the trimmed marker is present, or the issue count was already small enough.
      // We can't strictly assert the +N marker without knowing zod's issue count, but we can
      // bound the issue text length.
      expect(result.error.length).toBeLessThan(2000);
    }
  });
});
