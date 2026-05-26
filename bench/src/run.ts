import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PARSER_VERSION, analyze } from "@depmod/parser";
import { cloneTarget, targetSubdir } from "./clone.js";
import { CSV_COLUMNS, toCsv } from "./csv.js";
import { median, summariseGraph } from "./metrics.js";
import { histogramDegrees, scatterParserPerf } from "./svg.js";
import { filterTargets, loadTargets } from "./targets.js";
import type { BenchJsonResult, BenchResult, BenchRow, BenchTarget, BenchTier } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const BENCH_DIR = resolve(here, "..");
const DEFAULT_TARGETS = resolve(BENCH_DIR, "targets.json");
const DEFAULT_CACHE = resolve(BENCH_DIR, ".targets-cache");
const DEFAULT_RESULTS = resolve(BENCH_DIR, "results");

interface CliArgs {
  targetsPath: string;
  cacheDir: string;
  resultsDir: string;
  only: Set<string> | null;
  tier: BenchTier | null;
  reuseExisting: boolean;
  update: boolean;
  runs: number;
  listOnly: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    targetsPath: DEFAULT_TARGETS,
    cacheDir: DEFAULT_CACHE,
    resultsDir: DEFAULT_RESULTS,
    only: null,
    tier: null,
    reuseExisting: true,
    update: false,
    runs: 1,
    listOnly: false,
  };
  // `i` lives outside the loop so the `nextArg` helper can advance it
  // without resorting to `!` non-null assertions inside the loop body.
  let i = 0;
  const nextArg = (flag: string): string => {
    const v = argv[++i];
    if (v === undefined) throw new Error(`${flag} requires a value`);
    return v;
  };
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--targets") args.targetsPath = resolve(nextArg(arg));
    else if (arg === "--cache") args.cacheDir = resolve(nextArg(arg));
    else if (arg === "--out") args.resultsDir = resolve(nextArg(arg));
    else if (arg === "--only") {
      const names = nextArg(arg)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      args.only = new Set(names);
    } else if (arg === "--tier") args.tier = nextArg(arg) as BenchTier;
    else if (arg === "--runs") {
      const n = Number.parseInt(nextArg(arg), 10);
      if (!Number.isFinite(n) || n < 1) throw new Error("--runs must be a positive integer");
      args.runs = n;
    } else if (arg === "--fresh") args.reuseExisting = false;
    else if (arg === "--update") args.update = true;
    else if (arg === "--list") args.listOnly = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp(): void {
  process.stdout.write(
    [
      "depmod benchmark harness",
      "",
      "Usage: pnpm bench [options]",
      "",
      "Options:",
      "  --targets <file>   Path to targets.json (default: bench/targets.json)",
      "  --cache <dir>      Clone cache directory (default: bench/.targets-cache)",
      "  --out <dir>        Output directory (default: bench/results)",
      "  --only <names>     Comma-separated target names",
      "  --tier <tier>      Run only primary | medium | stress | stretch",
      "  --runs <n>         Repeat analyze per target; CSV uses median wall time",
      "  --update           git fetch existing clones before analyze",
      "  --fresh            Refuse to reuse cached clones",
      "  --list             Print configured targets and exit",
      "  -h, --help         Show this message",
      "",
      "Examples:",
      "  pnpm bench --only vercel-commerce,shadcn-taxonomy",
      "  pnpm bench --tier primary",
      "  pnpm bench:quick",
      "",
    ].join("\n"),
  );
}

function printTargetList(targets: readonly BenchTarget[]): void {
  const pad = (s: string, n: number) => s.padEnd(n);
  process.stdout.write(`${pad("name", 22)} ${pad("tier", 8)} subdir\n`);
  process.stdout.write(`${"-".repeat(72)}\n`);
  for (const t of targets) {
    const sub = t.subdir ? ` → ${t.subdir}` : "";
    const note = t.description ? `  # ${t.description}` : "";
    process.stdout.write(`${pad(t.name, 22)} ${pad(t.tier, 8)}${sub}${note}\n`);
  }
}

async function analyzeTarget(
  root: string,
  runs: number,
): Promise<{ graph: Awaited<ReturnType<typeof analyze>>; parseMsRuns: number[] }> {
  if (runs < 1) throw new Error("analyzeTarget needs runs >= 1");
  const parseMsRuns: number[] = [];
  // Run once outside the loop to satisfy the type checker without `!`.
  const t0 = performance.now();
  let graph = await analyze(root, { cache: false });
  parseMsRuns.push(Math.round(performance.now() - t0));
  for (let i = 1; i < runs; i++) {
    const tn = performance.now();
    graph = await analyze(root, { cache: false });
    parseMsRuns.push(Math.round(performance.now() - tn));
  }
  return { graph, parseMsRuns };
}

async function runOne(
  target: BenchTarget,
  cacheDir: string,
  options: { reuseExisting: boolean; update: boolean; runs: number },
): Promise<BenchResult> {
  process.stdout.write(`[${target.name}] cloning…\n`);
  const clone = await cloneTarget(target, {
    cacheDir,
    reuseExisting: options.reuseExisting,
    update: options.update,
  });
  process.stdout.write(
    `[${target.name}] ${clone.reused ? "reused" : "cloned"} ${clone.path} @ ${clone.sha.slice(0, 8)}\n`,
  );

  const root = targetSubdir(target, clone.path);
  process.stdout.write(
    `[${target.name}] analyzing ${root}${options.runs > 1 ? ` (${options.runs} runs)` : ""}…\n`,
  );
  const { graph, parseMsRuns } = await analyzeTarget(root, options.runs);
  const parseMs = median(parseMsRuns);
  process.stdout.write(
    `[${target.name}] ${graph.stats.nodes} nodes · ${graph.stats.edges} edges · ${graph.stats.cycles} cycles · ${parseMs}ms wall (parser ${graph.stats.parseMs}ms)\n`,
  );

  const summary = summariseGraph(graph);
  const row: BenchRow = {
    repo: target.name,
    sha: clone.sha,
    generatedAt: graph.generatedAt,
    files: graph.stats.files,
    nodes: graph.stats.nodes,
    edges: graph.stats.edges,
    cycles: graph.stats.cycles,
    totalLOC: summary.totalLOC,
    parseMs,
    parserMs: graph.stats.parseMs,
    p95NodeDegree: summary.p95NodeDegree,
    maxInstability: summary.maxInstability,
    hottestNode: summary.hottestNode,
    unusedDeps: summary.unusedDeps,
    deadModules: summary.deadModules,
    workspaces: summary.workspaces,
  };
  return {
    target,
    row,
    parseMsRuns,
    classification: summary.classification,
    degrees: summary.degrees,
  };
}

function renderIndex(results: readonly BenchResult[]): string {
  const rows = results
    .map(
      (r) => `
      <tr>
        <td>${r.target.name}</td>
        <td>${r.target.tier}</td>
        <td><code>${r.row.sha.slice(0, 8)}</code></td>
        <td class="num">${r.row.files}</td>
        <td class="num">${r.row.nodes}</td>
        <td class="num">${r.row.edges}</td>
        <td class="num">${r.row.cycles}</td>
        <td class="num">${r.row.totalLOC.toLocaleString()}</td>
        <td class="num">${r.row.parseMs} ms</td>
        <td class="num">${r.row.parserMs} ms</td>
        <td class="num">${r.row.unusedDeps}</td>
        <td class="num">${r.row.deadModules}</td>
        <td class="num">${r.row.p95NodeDegree}</td>
        <td class="num">${r.row.maxInstability.toFixed(3)}</td>
      </tr>`,
    )
    .join("\n");

  const histLinks = results
    .map((r) => `<li><a href="./degree-${r.target.name}.svg">degree-${r.target.name}.svg</a></li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>depmod · benchmark results</title>
<style>
  :root { color-scheme: dark; }
  body { background:#0a0a0a; color:#d4d4d4; font-family: ui-sans-serif, system-ui, sans-serif; margin:0; padding:32px; }
  h1 { font-size:1.4rem; margin:0 0 8px; }
  p { color:#8a8a8a; max-width:820px; line-height:1.5; }
  table { border-collapse:collapse; margin:24px 0; font-size:0.8rem; }
  th, td { padding:6px 10px; border-bottom:1px solid #1f1f1f; text-align:left; }
  th { color:#8a8a8a; font-weight:600; text-transform:uppercase; font-size:0.68rem; letter-spacing:0.06em; }
  td.num { text-align:right; font-variant-numeric: tabular-nums; }
  code { font-size:0.85em; }
  object { max-width:100%; display:block; margin:16px 0; }
  ul { line-height:1.6; }
</style>
</head>
<body>
<h1>depmod · benchmark results</h1>
<p>${results.length} target${results.length === 1 ? "" : "s"} · parser ${PARSER_VERSION} · generated ${new Date().toISOString()}. Open <code>results.json</code> for classification breakdowns and per-run timings.</p>

<h2>Summary</h2>
<table>
<thead><tr>
  <th>repo</th><th>tier</th><th>sha</th>
  <th>files</th><th>nodes</th><th>edges</th><th>cycles</th>
  <th>LOC</th><th>wall</th><th>parser</th><th>unused</th><th>dead</th>
  <th>p95 deg</th><th>max I</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>

<h2>Parser performance vs codebase size</h2>
<object type="image/svg+xml" data="./parser-perf.svg"></object>

<h2>Node-degree distribution (per repo)</h2>
<ul>${histLinks}</ul>
</body>
</html>
`;
}

function toJsonOutput(
  results: readonly BenchResult[],
  failures: readonly string[],
): BenchJsonResult {
  return {
    generatedAt: new Date().toISOString(),
    parserVersion: PARSER_VERSION,
    targets: results.map((r) => ({
      target: r.target,
      row: r.row,
      parseMsRuns: r.parseMsRuns,
      classification: r.classification,
      degrees: r.degrees,
    })),
    failures: [...failures],
  };
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);
  const { targets: allTargets } = loadTargets(args.targetsPath);

  if (args.listOnly) {
    printTargetList(allTargets);
    return 0;
  }

  const targets = filterTargets(allTargets, { only: args.only, tier: args.tier });

  if (targets.length === 0) {
    const hint = args.only
      ? `names: ${[...args.only].join(", ")}`
      : args.tier
        ? `tier: ${args.tier}`
        : "no filters";
    process.stderr.write(`No targets in ${args.targetsPath} match (${hint}).\n`);
    return 2;
  }

  process.stdout.write(
    `Running ${targets.length} target${targets.length === 1 ? "" : "s"} (parser ${PARSER_VERSION}, cache off, runs=${args.runs})…\n`,
  );

  const results: BenchResult[] = [];
  const failures: string[] = [];
  for (const target of targets) {
    try {
      results.push(
        await runOne(target, args.cacheDir, {
          reuseExisting: args.reuseExisting,
          update: args.update,
          runs: args.runs,
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[${target.name}] FAILED: ${message}\n`);
      failures.push(target.name);
    }
  }

  if (results.length === 0) {
    process.stderr.write("No successful runs; nothing to write.\n");
    return 1;
  }

  mkdirSync(args.resultsDir, { recursive: true });
  const csvPath = resolve(args.resultsDir, "results.csv");
  writeFileSync(csvPath, toCsv(results.map((r) => r.row)), "utf-8");
  process.stdout.write(
    `Wrote ${csvPath} (${CSV_COLUMNS.length} columns × ${results.length} rows)\n`,
  );

  const jsonPath = resolve(args.resultsDir, "results.json");
  writeFileSync(jsonPath, `${JSON.stringify(toJsonOutput(results, failures), null, 2)}\n`, "utf-8");
  process.stdout.write(`Wrote ${jsonPath}\n`);

  const scatterPath = resolve(args.resultsDir, "parser-perf.svg");
  writeFileSync(scatterPath, scatterParserPerf(results), "utf-8");
  process.stdout.write(`Wrote ${scatterPath}\n`);

  for (const r of results) {
    const histPath = resolve(args.resultsDir, `degree-${r.target.name}.svg`);
    writeFileSync(histPath, histogramDegrees(r), "utf-8");
    process.stdout.write(`Wrote ${histPath}\n`);
  }

  const indexPath = resolve(args.resultsDir, "index.html");
  writeFileSync(indexPath, renderIndex(results), "utf-8");
  process.stdout.write(`Wrote ${indexPath}\n`);

  if (failures.length > 0) {
    process.stderr.write(
      `Note: ${failures.length} target${failures.length === 1 ? "" : "s"} failed: ${failures.join(", ")}\n`,
    );
  }
  return failures.length > 0 ? 1 : 0;
}

// Allow running via `tsx src/run.ts` and also via `node dist/run.js`.
const isMain = (() => {
  if (typeof process === "undefined" || !process.argv[1]) return false;
  const invokedAs = resolve(process.argv[1]);
  const thisFile = fileURLToPath(import.meta.url);
  return invokedAs === thisFile || invokedAs === thisFile.replace(/\.ts$/, ".js");
})();
if (isMain) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(
        `bench: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
      );
      process.exitCode = 1;
    });
}
