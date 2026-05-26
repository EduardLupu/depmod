import type { BenchRow } from "./types.js";

export const CSV_COLUMNS: ReadonlyArray<keyof BenchRow> = [
  "repo",
  "sha",
  "generatedAt",
  "files",
  "nodes",
  "edges",
  "cycles",
  "totalLOC",
  "parseMs",
  "parserMs",
  "p95NodeDegree",
  "maxInstability",
  "hottestNode",
  "unusedDeps",
  "deadModules",
  "workspaces",
] as const;

/**
 * Deterministic CSV writer. Columns are explicit (never reordered by Object key
 * iteration order), instability is fixed at 4 decimal places so diffs across
 * re-runs stay clean, and any value containing a comma, quote, or newline is
 * RFC-4180 quoted.
 */
export function toCsv(rows: readonly BenchRow[]): string {
  const lines: string[] = [];
  lines.push(CSV_COLUMNS.join(","));
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((c) => csvField(row[c])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csvField(value: BenchRow[keyof BenchRow]): string {
  if (typeof value === "number") {
    // Preserve full precision for ints, four decimals for floats; keeps the
    // CSV diff-friendly across runs that produce slightly different timings.
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
