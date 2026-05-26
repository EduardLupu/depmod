import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GraphSchema } from "@depmod/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type MetricsReport, runAnalyze } from "../src/run.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(here, "fixtures", "mini");
const FIXED_NOW = new Date("2026-05-17T00:00:00.000Z");

let tmp: string;
const captured: string[] = [];
const stdout = (line: string) => captured.push(line);

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "depmod-cli-"));
  captured.length = 0;
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("runAnalyze(mini)", () => {
  it("writes graph.json and metrics.json into the requested location", async () => {
    const graphPath = join(tmp, "out", "graph.json");
    const result = await runAnalyze({
      path: FIXTURE_ROOT,
      noCache: true,
      outGraph: graphPath,
      now: FIXED_NOW,
      stdout,
      noColor: true,
    });

    expect(result.graphPath).toBe(graphPath);
    expect(result.metricsPath).toBe(join(tmp, "out", "metrics.json"));
    expect(statSync(result.graphPath).isFile()).toBe(true);
    expect(statSync(result.metricsPath).isFile()).toBe(true);
  });

  it("emits a Graph that validates against GraphSchema", async () => {
    const graphPath = join(tmp, "graph.json");
    await runAnalyze({
      path: FIXTURE_ROOT,
      noCache: true,
      outGraph: graphPath,
      now: FIXED_NOW,
      stdout,
      noColor: true,
    });
    const onDisk = JSON.parse(readFileSync(graphPath, "utf-8"));
    expect(() => GraphSchema.parse(onDisk)).not.toThrow();
  });

  it("emits a MetricsReport with one node entry per Graph node", async () => {
    const graphPath = join(tmp, "graph.json");
    const { graph } = await runAnalyze({
      path: FIXTURE_ROOT,
      noCache: true,
      outGraph: graphPath,
      now: FIXED_NOW,
      stdout,
      noColor: true,
    });
    const metrics: MetricsReport = JSON.parse(readFileSync(join(tmp, "metrics.json"), "utf-8"));

    expect(metrics.schemaVersion).toBe(1);
    expect(metrics.stats).toEqual(graph.stats);
    expect(metrics.nodes).toHaveLength(graph.nodes.length);

    const cn = metrics.nodes.find((n) => n.id === "lib/cn.ts");
    expect(cn).toBeDefined();
    expect(cn?.classification).toBe("lib");
    expect(cn?.Ca).toBe(1);
    expect(cn?.Ce).toBe(0);
    expect(cn?.instability).toBe(0);
  });

  it("respects an explicit --metrics-out path", async () => {
    const graphPath = join(tmp, "graph.json");
    const metricsPath = join(tmp, "elsewhere", "m.json");
    const result = await runAnalyze({
      path: FIXTURE_ROOT,
      noCache: true,
      outGraph: graphPath,
      outMetrics: metricsPath,
      now: FIXED_NOW,
      stdout,
      noColor: true,
    });
    expect(result.metricsPath).toBe(metricsPath);
    expect(statSync(metricsPath).isFile()).toBe(true);
  });

  it("prints a summary table by default (header, stats, classification)", async () => {
    await runAnalyze({
      path: FIXTURE_ROOT,
      noCache: true,
      outGraph: join(tmp, "graph.json"),
      now: FIXED_NOW,
      stdout,
      noColor: true,
    });
    const out = captured.join("\n");
    expect(out).toContain("depmod-ui analyze");
    expect(out).toContain("Stats");
    expect(out).toContain("Classification");
    expect(out).toContain("Wrote ");
  });

  it("suppresses the summary table when quiet=true", async () => {
    await runAnalyze({
      path: FIXTURE_ROOT,
      noCache: true,
      outGraph: join(tmp, "graph.json"),
      quiet: true,
      now: FIXED_NOW,
      stdout,
      noColor: true,
    });
    expect(captured).toHaveLength(0);
  });

  it("emits a single JSON line when json=true", async () => {
    await runAnalyze({
      path: FIXTURE_ROOT,
      noCache: true,
      outGraph: join(tmp, "graph.json"),
      json: true,
      now: FIXED_NOW,
      stdout,
      noColor: true,
    });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toBeDefined();
    const parsed = JSON.parse(captured[0] ?? "");
    expect(parsed.graphPath).toBe(join(tmp, "graph.json"));
    expect(parsed.metricsPath).toBe(join(tmp, "metrics.json"));
    expect(parsed.stats.nodes).toBeGreaterThan(0);
  });

  it("rejects a non-existent source path", async () => {
    await expect(
      runAnalyze({
        path: join(FIXTURE_ROOT, "does-not-exist"),
        outGraph: join(tmp, "graph.json"),
        stdout,
        noColor: true,
      }),
    ).rejects.toThrow(/is not a directory/);
  });
});
