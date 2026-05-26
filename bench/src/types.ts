/** Tier groups bench targets by intended scale. Used to bucket plots and tables. */
export type BenchTier = "primary" | "medium" | "stress" | "stretch";

export interface BenchTarget {
  /** Stable short id used in result filenames and CSV rows. */
  name: string;
  /** Clone URL (https or git@). */
  repo: string;
  /** Pinned git ref (commit SHA or tag). `null` ⇒ default branch HEAD at clone time. */
  ref: string | null;
  tier: BenchTier;
  /**
   * Optional sub-directory inside the cloned repo to feed to the parser.
   * Useful for monorepos where the interesting Next.js app isn't the repo root.
   */
  subdir?: string;
  /** Human-readable note shown in `bench/README.md` and `pnpm bench --list`. */
  description?: string;
  /**
   * Directory name under `.targets-cache/` (defaults to `name`).
   * Use when multiple targets share one clone (e.g. monorepo root vs app subdir).
   */
  cacheName?: string;
}

export interface TargetsFile {
  targets: BenchTarget[];
}

/** One row of `results/results.csv`; corresponds to a single (target, run) tuple. */
export interface BenchRow {
  /** Target name from `bench/targets.json`. */
  repo: string;
  /** Resolved commit SHA at the time of the run. */
  sha: string;
  /** When the analysis completed (ISO datetime). */
  generatedAt: string;
  /** Total source files seen by the parser. */
  files: number;
  /** Graph nodes (one per source file). */
  nodes: number;
  /** Graph edges (incl. import / type-only / dynamic kinds). */
  edges: number;
  /** Cycles (SCCs of size ≥ 2). */
  cycles: number;
  /** Sum of `loc` across all nodes. */
  totalLOC: number;
  /** Median end-to-end `analyze()` wall-clock in milliseconds (see `--runs`). */
  parseMs: number;
  /** Parser-reported timing from `graph.stats.parseMs` (excludes harness overhead). */
  parserMs: number;
  /** 95th-percentile node degree (Ca + Ce). */
  p95NodeDegree: number;
  /** Maximum `instability` observed across nodes. */
  maxInstability: number;
  /** Node id with the highest afferent coupling (Ca). */
  hottestNode: string;
  /** Count of `graph.unusedDependencies` entries. */
  unusedDeps: number;
  /** Modules flagged by `findDeadCode()`. */
  deadModules: number;
  /** Monorepo workspaces detected (`graph.workspaces`). */
  workspaces: number;
}

/** Full JSON artifact written beside the CSV (includes breakdowns not in the flat file). */
export interface BenchJsonResult {
  generatedAt: string;
  parserVersion: string;
  targets: Array<{
    target: BenchTarget;
    row: BenchRow;
    /** Per-run wall times when `--runs` > 1. */
    parseMsRuns: number[];
    classification: Record<string, number>;
    degrees: number[];
  }>;
  failures: string[];
}

/** Result for a single target run; carries the row plus plot inputs. */
export interface BenchResult {
  target: BenchTarget;
  row: BenchRow;
  parseMsRuns: number[];
  classification: Record<string, number>;
  /** Degree-by-node, retained so the harness can render the degree-distribution plot. */
  degrees: number[];
}
