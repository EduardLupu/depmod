import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  type DeadModule,
  analyze,
  deadKindLabel,
  findDeadCode,
  findUnusedDependencies,
} from "@depmod/parser";
import type { Cycle, Graph, UnusedDependency } from "@depmod/types";
import kleur from "kleur";

export type CheckRule = "cycles" | "dead-code" | "unused-deps" | "instability";

export interface CheckThresholds {
  /** Maximum allowed instability (0..1). Modules above this fail the check. */
  instabilityMax?: number;
}

export interface RunCheckOptions {
  /** Project root to analyze. */
  path: string;
  /** Rules that should cause the command to exit non-zero. */
  failOn: readonly CheckRule[];
  /** Numeric thresholds for parameterised rules. */
  thresholds?: CheckThresholds;
  /** Emit a single JSON line instead of a human report. */
  json?: boolean;
  /** Disable ANSI colours in the human report. */
  noColor?: boolean;
  /** Stdout sink. Defaults to console.log. Injected for testability. */
  stdout?: (line: string) => void;
  /** Stderr sink. Defaults to console.error. */
  stderr?: (line: string) => void;
  /** Bypass the incremental slice cache for this run. */
  noCache?: boolean;
}

export interface CheckReport {
  cycles: Cycle[];
  deadModules: DeadModule[];
  unusedDeps: UnusedDependency[];
  instabilityViolations: Array<{ id: string; instability: number }>;
  failed: CheckRule[];
}

export interface RunCheckResult {
  report: CheckReport;
  /** True when at least one fail-on rule produced violations. */
  failed: boolean;
}

const DEFAULT_FAIL_ON: readonly CheckRule[] = ["cycles", "dead-code", "unused-deps"];

/**
 * Run architectural-fitness checks against the project at `options.path`.
 * Returns a structured report. Caller decides whether to `process.exit`;
 * `runCheck` itself only sets the result's `failed` flag.
 */
export async function runCheck(options: RunCheckOptions): Promise<RunCheckResult> {
  const cwd = process.cwd();
  const absPath = isAbsolute(options.path) ? options.path : resolve(cwd, options.path);
  if (!exists(absPath) || !statSync(absPath).isDirectory()) {
    throw new Error(`check: source path is not a directory: ${absPath}`);
  }

  const failOnSet = new Set(options.failOn);
  const graph = await analyze(absPath, options.noCache ? { cache: false } : undefined);

  const deadModules = findDeadCode(graph);
  const unusedDeps = findUnusedDependencies(graph);
  const instabilityMax = options.thresholds?.instabilityMax;
  const instabilityViolations =
    instabilityMax !== undefined
      ? graph.nodes
          .filter((n) => n.metrics.instability > instabilityMax)
          .map((n) => ({ id: n.id, instability: n.metrics.instability }))
      : [];

  const failed: CheckRule[] = [];
  if (failOnSet.has("cycles") && graph.cycles.length > 0) failed.push("cycles");
  if (failOnSet.has("dead-code") && deadModules.length > 0) failed.push("dead-code");
  if (failOnSet.has("unused-deps") && unusedDeps.length > 0) failed.push("unused-deps");
  if (failOnSet.has("instability") && instabilityViolations.length > 0) failed.push("instability");

  const report: CheckReport = {
    cycles: graph.cycles,
    deadModules,
    unusedDeps,
    instabilityViolations,
    failed,
  };

  const stdout = options.stdout ?? ((line) => console.log(line));
  const stderr = options.stderr ?? ((line) => console.error(line));
  if (options.json) {
    stdout(JSON.stringify(report));
  } else {
    printHumanReport(report, graph, instabilityMax, !options.noColor, stdout, stderr);
  }

  return { report, failed: failed.length > 0 };
}

export function parseFailOn(value: string | undefined): {
  rules: CheckRule[];
  thresholds: CheckThresholds;
} {
  if (!value || value.trim() === "") {
    return { rules: [...DEFAULT_FAIL_ON], thresholds: {} };
  }
  const rules: CheckRule[] = [];
  const thresholds: CheckThresholds = {};
  for (const raw of value.split(",")) {
    const token = raw.trim();
    if (token === "") continue;
    if (token === "cycles" || token === "dead-code" || token === "unused-deps") {
      rules.push(token);
      continue;
    }
    if (token.startsWith("instability:>")) {
      const max = Number.parseFloat(token.slice("instability:>".length));
      if (!Number.isFinite(max) || max < 0 || max > 1) {
        throw new Error(`Invalid instability threshold: ${token} (must be a number in [0,1])`);
      }
      rules.push("instability");
      thresholds.instabilityMax = max;
      continue;
    }
    if (token === "instability") {
      rules.push("instability");
      thresholds.instabilityMax = 0.9;
      continue;
    }
    throw new Error(`Unknown check rule: "${token}"`);
  }
  if (rules.length === 0) {
    return { rules: [...DEFAULT_FAIL_ON], thresholds };
  }
  return { rules, thresholds };
}

function printHumanReport(
  report: CheckReport,
  graph: Graph,
  instabilityMax: number | undefined,
  color: boolean,
  stdout: (line: string) => void,
  stderr: (line: string) => void,
): void {
  const c = color ? kleur : kleurNoOp();
  stdout(`${c.bold("depmod-ui check")} ${graph.rootDir}`);
  stdout("");

  // Cycles
  if (report.cycles.length === 0) {
    stdout(`  ${c.green("✓")} cycles            0`);
  } else {
    stdout(`  ${c.red("✗")} cycles            ${report.cycles.length}`);
    for (const cycle of report.cycles) {
      stderr(`      ${cycle.nodes.join(" → ")} → ${cycle.nodes[0]}`);
    }
  }

  // Dead modules
  if (report.deadModules.length === 0) {
    stdout(`  ${c.green("✓")} dead modules      0`);
  } else {
    stdout(`  ${c.red("✗")} dead modules      ${report.deadModules.length}`);
    for (const d of report.deadModules) {
      const tags = d.kinds.map(deadKindLabel).join(", ");
      stderr(`      ${d.id} [${tags}]`);
    }
  }

  // Unused deps
  if (report.unusedDeps.length === 0) {
    stdout(`  ${c.green("✓")} unused deps       0`);
  } else {
    stdout(`  ${c.red("✗")} unused deps       ${report.unusedDeps.length}`);
    for (const u of report.unusedDeps) {
      stderr(`      ${u.workspace || "."} :: ${u.name} (${u.kind})`);
    }
  }

  // Instability; only printed when a threshold was given
  if (instabilityMax !== undefined) {
    if (report.instabilityViolations.length === 0) {
      stdout(`  ${c.green("✓")} instability ≤ ${instabilityMax.toFixed(2)}  0`);
    } else {
      stdout(
        `  ${c.red("✗")} instability > ${instabilityMax.toFixed(2)}  ${report.instabilityViolations.length}`,
      );
      for (const v of report.instabilityViolations) {
        stderr(`      ${v.id} (${v.instability.toFixed(3)})`);
      }
    }
  }

  stdout("");
  if (report.failed.length === 0) {
    stdout(c.green("All checks passed."));
  } else {
    stdout(c.red(`Failed: ${report.failed.join(", ")}`));
  }
}

interface ColorFns {
  bold: (s: string) => string;
  red: (s: string) => string;
  green: (s: string) => string;
}

function kleurNoOp(): ColorFns {
  const id = (s: string) => s;
  return { bold: id, red: id, green: id };
}

function exists(absPath: string): boolean {
  try {
    statSync(absPath);
    return true;
  } catch {
    return false;
  }
}
