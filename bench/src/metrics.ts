import { findDeadCode } from "@depmod/parser";
import type { Classification, Graph } from "@depmod/types";

export interface BenchSummary {
  totalLOC: number;
  p95NodeDegree: number;
  maxInstability: number;
  hottestNode: string;
  unusedDeps: number;
  deadModules: number;
  workspaces: number;
  classification: Record<string, number>;
  /** Per-node degree (Ca + Ce); preserved for the degree-distribution plot. */
  degrees: number[];
}

const CLASSIFICATIONS: readonly Classification[] = [
  "page",
  "component",
  "hook",
  "api",
  "lib",
  "test",
  "config",
];

/**
 * Derive bench-specific summary values from a Graph. Pure function; no I/O.
 */
export function summariseGraph(graph: Graph): BenchSummary {
  const totalLOC = graph.nodes.reduce((sum, n) => sum + n.loc, 0);
  const degrees = graph.nodes.map((n) => n.metrics.Ca + n.metrics.Ce);
  const p95NodeDegree = percentile(degrees, 0.95);

  let maxInstability = 0;
  let hottestNode = "";
  let topCa = -1;
  for (const node of graph.nodes) {
    if (node.metrics.instability > maxInstability) {
      maxInstability = node.metrics.instability;
    }
    if (node.metrics.Ca > topCa) {
      topCa = node.metrics.Ca;
      hottestNode = node.id;
    }
  }

  const classification = Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<
    string,
    number
  >;
  for (const node of graph.nodes) {
    classification[node.classification] = (classification[node.classification] ?? 0) + 1;
  }

  return {
    totalLOC,
    p95NodeDegree,
    maxInstability,
    hottestNode,
    unusedDeps: graph.unusedDependencies?.length ?? 0,
    deadModules: findDeadCode(graph).length,
    workspaces: graph.workspaces?.length ?? 0,
    classification,
    degrees,
  };
}

/**
 * Nearest-rank percentile on an unsorted numeric sample. Returns 0 for an empty
 * sample. Matches the convention used in most academic perf papers (P95 is the
 * value at index ⌈0.95 · n⌉ - 1 of the sorted ascending list).
 */
export function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  if (q <= 0) return Math.min(...values);
  if (q >= 1) return Math.max(...values);
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(0, Math.ceil(q * sorted.length) - 1);
  // `rank` is bounded to [0, sorted.length); narrowing for biome.
  return sorted[rank] ?? 0;
}

/** Median of a non-empty numeric sample (even length uses lower-middle convention). */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  const lo = sorted[mid - 1] ?? 0;
  const hi = sorted[mid] ?? 0;
  return Math.round((lo + hi) / 2);
}

/**
 * Bin a degree sequence into log-2 buckets: [0,0], [1,1], [2,3], [4,7], [8,15], …
 * Useful for the degree-distribution plot, which is naturally long-tailed.
 */
export function logHistogram(degrees: readonly number[]): Array<{
  label: string;
  lo: number;
  hi: number;
  count: number;
}> {
  if (degrees.length === 0) return [];
  const max = Math.max(...degrees);
  const bins: Array<{ label: string; lo: number; hi: number; count: number }> = [
    { label: "0", lo: 0, hi: 0, count: 0 },
  ];
  let lo = 1;
  while (lo <= max) {
    const hi = Math.min(lo * 2 - 1, Number.MAX_SAFE_INTEGER);
    bins.push({ label: lo === hi ? `${lo}` : `${lo}-${hi}`, lo, hi, count: 0 });
    lo = hi + 1;
  }
  for (const d of degrees) {
    for (const bin of bins) {
      if (d >= bin.lo && d <= bin.hi) {
        bin.count++;
        break;
      }
    }
  }
  return bins;
}
