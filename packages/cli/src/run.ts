import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { type CacheStats, analyze } from "@depmod/parser";
import type { Classification, Cycle, Graph, SCHEMA_VERSION, Stats } from "@depmod/types";
import { type FormatOptions, summarize } from "./format.js";

export interface RunAnalyzeOptions {
  /** Source directory to analyze (relative to cwd or absolute). */
  path: string;
  /** Output path for graph.json. Defaults to `./graph.json` relative to cwd. */
  outGraph?: string;
  /** Output path for metrics.json. Defaults to `<dirname(outGraph)>/metrics.json`. */
  outMetrics?: string;
  /** Suppress all non-error output. */
  quiet?: boolean;
  /** Print only machine-readable result paths (one per line). */
  json?: boolean;
  /** Disable ANSI colours. */
  noColor?: boolean;
  /** Override the timestamp recorded in the Graph (used by tests for stable snapshots). */
  now?: Date;
  /** Stdout sink, defaults to console.log. Injected for testability. */
  stdout?: (line: string) => void;
  /** Track B.1; allow-list of POSIX globs anchored at `path`. Empty = include all. */
  include?: string[];
  /** Track B.1; exclude globs (applied after .gitignore). */
  exclude?: string[];
  /** Track B.1; when false, ignore `.gitignore` files. Defaults to true. */
  respectGitignore?: boolean;
  /** Track B; when false, include test/spec files. Default: exclude. */
  excludeTests?: boolean;
  /** Track I; when true, bypass the incremental slice cache for this run. */
  noCache?: boolean;
}

export interface RunAnalyzeResult {
  graphPath: string;
  metricsPath: string;
  graph: Graph;
  graphBytes: number;
  metricsBytes: number;
}

export interface MetricsReport {
  schemaVersion: typeof SCHEMA_VERSION;
  generatedAt: string;
  rootDir: string;
  stats: Stats;
  nodes: Array<{
    id: string;
    classification: Classification;
    loc: number;
    Ca: number;
    Ce: number;
    instability: number;
  }>;
  cycles: Cycle[];
}

export async function runAnalyze(options: RunAnalyzeOptions): Promise<RunAnalyzeResult> {
  const cwd = process.cwd();
  const absPath = isAbsolute(options.path) ? options.path : resolve(cwd, options.path);
  if (!exists(absPath) || !statSync(absPath).isDirectory()) {
    throw new Error(`analyze: source path is not a directory: ${absPath}`);
  }

  const graphPath = resolveOut(options.outGraph ?? "graph.json", cwd);
  const metricsPath = options.outMetrics
    ? resolveOut(options.outMetrics, cwd)
    : join(dirname(graphPath), "metrics.json");

  const stdout = options.stdout ?? ((line) => console.log(line));
  const formatOpts: FormatOptions = { noColor: options.noColor ?? !isTty() };

  // TS narrows assignments inside a callback as if they never ran, hence the
  // mutable container instead of a plain `let`.
  const cacheStatsRef: { value: CacheStats | null } = { value: null };
  const graph = await analyze(absPath, {
    ...(options.now ? { now: options.now } : {}),
    ...(options.include ? { include: options.include } : {}),
    ...(options.exclude ? { exclude: options.exclude } : {}),
    ...(options.respectGitignore !== undefined
      ? { respectGitignore: options.respectGitignore }
      : {}),
    ...(options.excludeTests === true ? { excludeTests: true } : {}),
    ...(options.noCache ? { cache: false } : {}),
    onCacheStats: (s) => {
      cacheStatsRef.value = s;
    },
  });
  const metrics: MetricsReport = toMetricsReport(graph);

  mkdirSync(dirname(graphPath), { recursive: true });
  mkdirSync(dirname(metricsPath), { recursive: true });

  const graphJson = `${JSON.stringify(graph, null, 2)}\n`;
  const metricsJson = `${JSON.stringify(metrics, null, 2)}\n`;
  writeFileSync(graphPath, graphJson, "utf-8");
  writeFileSync(metricsPath, metricsJson, "utf-8");

  if (!options.quiet) {
    if (options.json) {
      stdout(
        JSON.stringify({
          graphPath,
          metricsPath,
          stats: graph.stats,
          ...(cacheStatsRef.value ? { cache: cacheStatsRef.value } : {}),
        }),
      );
    } else {
      stdout(`depmod-ui analyze ${absPath}`);
      stdout("");
      stdout(summarize(graph, formatOpts));
      if (cacheStatsRef.value && cacheStatsRef.value.enabled) {
        const total = cacheStatsRef.value.hits + cacheStatsRef.value.misses;
        const ratio = total === 0 ? 0 : Math.round((cacheStatsRef.value.hits / total) * 100);
        const reason = cacheStatsRef.value.invalidatedReason
          ? ` (prior cache invalidated: ${cacheStatsRef.value.invalidatedReason})`
          : "";
        stdout(`Cache: ${cacheStatsRef.value.hits}/${total} hits (${ratio}%)${reason}`);
      }
      stdout("");
      stdout(`Wrote ${graphPath} (${formatBytes(graphJson.length)})`);
      stdout(`Wrote ${metricsPath} (${formatBytes(metricsJson.length)})`);
    }
  }

  return {
    graphPath,
    metricsPath,
    graph,
    graphBytes: graphJson.length,
    metricsBytes: metricsJson.length,
  };
}

function toMetricsReport(graph: Graph): MetricsReport {
  return {
    schemaVersion: graph.schemaVersion,
    generatedAt: graph.generatedAt,
    rootDir: graph.rootDir,
    stats: graph.stats,
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      classification: n.classification,
      loc: n.loc,
      Ca: n.metrics.Ca,
      Ce: n.metrics.Ce,
      instability: n.metrics.instability,
    })),
    cycles: graph.cycles,
  };
}

function exists(absPath: string): boolean {
  try {
    statSync(absPath);
    return true;
  } catch {
    return false;
  }
}

function resolveOut(out: string, cwd: string): string {
  return isAbsolute(out) ? out : resolve(cwd, out);
}

function isTty(): boolean {
  return Boolean(process.stdout?.isTTY);
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
