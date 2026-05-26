import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyze } from "../src/parser.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(here, "fixtures", "sample-app");
const FIXED_NOW = new Date("2026-05-17T00:00:00.000Z");

/**
 * Track B.1; verify the new `include` / `exclude` / `respectGitignore`
 * options on `analyze()` actually thread through to the file-filter and
 * change which nodes land in the graph.
 */
describe("analyze(); Track B.1 file-selection options", () => {
  it("default invocation matches the original 10-node sample-app", async () => {
    const g = await analyze(FIXTURE_ROOT, { now: FIXED_NOW, cache: false });
    expect(g.stats.nodes).toBe(10);
  });

  it("--exclude removes a top-level directory", async () => {
    const g = await analyze(FIXTURE_ROOT, {
      now: FIXED_NOW,
      cache: false,
      exclude: ["components/**"],
    });
    const ids = g.nodes.map((n) => n.id);
    expect(ids.some((id) => id.startsWith("components/"))).toBe(false);
    expect(ids).toContain("app/page.tsx");
  });

  it("--include narrows to a subtree only", async () => {
    const g = await analyze(FIXTURE_ROOT, {
      now: FIXED_NOW,
      cache: false,
      include: ["lib/**"],
    });
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toEqual(["lib/api.ts", "lib/utils.ts"]);
  });

  it("--exclude wins over --include", async () => {
    const g = await analyze(FIXTURE_ROOT, {
      now: FIXED_NOW,
      cache: false,
      include: ["app/**"],
      exclude: ["app/api/**"],
    });
    const ids = g.nodes.map((n) => n.id);
    expect(ids.some((id) => id.startsWith("app/api/"))).toBe(false);
    expect(ids).toContain("app/page.tsx");
  });

  it("emits an empty graph when --include matches nothing", async () => {
    const g = await analyze(FIXTURE_ROOT, {
      now: FIXED_NOW,
      cache: false,
      include: ["nope/**"],
    });
    expect(g.stats.nodes).toBe(0);
    expect(g.stats.edges).toBe(0);
  });
});
