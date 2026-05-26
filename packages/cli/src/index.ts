import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PARSER_VERSION, parseGlobList } from "@depmod/parser";
import { Command } from "commander";
import kleur from "kleur";
import updateNotifier from "update-notifier";
import { runCheck as defaultRunCheck, parseFailOn } from "./commands/check.js";
import { runServe as defaultRunServe } from "./commands/serve.js";
import { runAnalyze as defaultRunAnalyze } from "./run.js";

export interface ProgramDeps {
  runAnalyze?: typeof defaultRunAnalyze;
  runServe?: typeof defaultRunServe;
  runCheck?: typeof defaultRunCheck;
  /**
   * Called when the action handler throws; defaults to writing to stderr and
   * setting `process.exitCode = 1`. Override in tests to capture errors without
   * mutating process state.
   */
  onError?: (err: unknown) => void;
  /**
   * Process signal subscription. Defaults to `process.on`. Override in tests
   * so the program doesn't install lingering global listeners.
   */
  onSignal?: (signal: NodeJS.Signals, handler: () => void) => void;
}

/**
 * Build the `depmod-ui` Commander program.
 *
 * Default action: `depmod-ui` (no subcommand) behaves as `depmod-ui .`;
 * the Skott-style "type the binary, the dashboard opens" UX. Explicit
 * `analyze` is the opt-in CI/CD path that writes JSON to disk.
 *
 * `--include`, `--exclude`, `--no-gitignore` file-selection controls are
 * available on the default action, `serve`, and `analyze`.
 */
export function buildProgram(deps: ProgramDeps = {}): Command {
  const runAnalyze = deps.runAnalyze ?? defaultRunAnalyze;
  const runServe = deps.runServe ?? defaultRunServe;
  const runCheck = deps.runCheck ?? defaultRunCheck;
  const onError =
    deps.onError ??
    ((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${kleur.red("depmod-ui:")} ${message}\n`);
      process.exitCode = 1;
    });
  const onSignal = deps.onSignal ?? ((sig, handler) => process.on(sig, handler));

  // Check the registry once per day in a detached background process; on
  // the *next* invocation after a new version lands, print a styled notice.
  // `update-notifier` no-ops automatically in non-TTY contexts and respects
  // NO_UPDATE_NOTIFIER=1 / `--no-update-notifier`, so CI scripts stay quiet.
  notifyOfUpdates();

  const program = new Command();

  program
    .name("depmod-ui")
    .description("Static visualization of frontend software architectures")
    .version(PARSER_VERSION, "-v, --version", "Print the parser version")
    // Parent options must come before a subcommand name. Otherwise commander
    // would eagerly consume `--no-open` / `--quiet` etc. on `depmod-ui
    // --no-open`, leaving the subcommand's own option of the same name unset.
    .enablePositionalOptions();

  attachServeFlags(program);
  program
    .argument("[path]", "Path to the project root (defaults to current directory)", ".")
    .action(async (path: string, opts: ServeLikeFlags) => {
      await invokeServe(runServe, onError, onSignal, path, opts);
    });

  attachServeFlags(
    program
      .command("serve")
      .description("Analyze a project and host the dashboard from a local web server (interactive)")
      .argument("[path]", "Path to the project root (defaults to current directory)", "."),
  ).action(async (path: string, opts: ServeLikeFlags) => {
    await invokeServe(runServe, onError, onSignal, path, opts);
  });

  program
    .command("check")
    .description(
      "Run architectural-fitness checks (cycles, dead code, unused deps, instability). Exits non-zero on failure.",
    )
    .argument("<path>", "Path to the project root")
    .option(
      "--fail-on <rules>",
      "Comma-separated rules: cycles,dead-code,unused-deps,instability[:>N]",
    )
    .option("--json", "Emit a single JSON line with the report instead of the human summary")
    .option("--no-cache", "Bypass the incremental .depmod-cache slice cache for this run")
    .option("--no-color", "Disable ANSI colours")
    .action(async (path: string, opts: CheckFlags) => {
      try {
        const { rules, thresholds } = parseFailOn(opts.failOn);
        const { failed } = await runCheck({
          path,
          failOn: rules,
          thresholds,
          json: opts.json,
          noColor: opts.color === false,
          noCache: opts.cache === false,
        });
        if (failed) process.exitCode = 1;
      } catch (err) {
        onError(err);
      }
    });

  attachFilterFlags(
    program
      .command("analyze")
      .description("Parse a project and write graph.json + metrics.json to disk (CI/CD mode)")
      .argument("<path>", "Path to the project root (directory containing tsconfig.json)")
      .option("-o, --out <file>", "Output path for graph.json", "graph.json")
      .option("--metrics-out <file>", "Output path for metrics.json (defaults next to graph.json)")
      .option("-q, --quiet", "Suppress non-error output")
      .option("--json", "Emit a single JSON line with result paths instead of the summary table")
      .option("--no-cache", "Bypass the incremental .depmod-cache slice cache for this run")
      .option("--no-color", "Disable ANSI colours"),
  ).action(async (path: string, opts: AnalyzeFlags) => {
    try {
      await runAnalyze({
        path,
        outGraph: opts.out,
        outMetrics: opts.metricsOut,
        quiet: opts.quiet,
        json: opts.json,
        noColor: opts.color === false,
        noCache: opts.cache === false,
        ...filterFlagsFromOpts(opts),
      });
    } catch (err) {
      onError(err);
    }
  });

  return program;
}

function filterFlagsFromOpts(opts: FilterFlags) {
  return {
    include: parseGlobList(opts.include),
    exclude: parseGlobList(opts.exclude),
    respectGitignore: opts.gitignore !== false,
    excludeTests: opts.excludeTests ? true : undefined,
  };
}

/**
 * Attach the shared `serve` / default-action flags (port, host, watch, open,
 * quiet, no-color) plus the Track B.1 filter flags. Returned as the same
 * command instance so callers can chain `.action(...)`.
 */
function attachServeFlags(command: Command): Command {
  return attachFilterFlags(
    command
      .option(
        "-p, --port <number>",
        "Port to bind (default: first free at or above 45455)",
        parsePort,
      )
      .option("--host <host>", "Bind host (default 127.0.0.1, loopback only)")
      .option("-w, --watch", "Re-analyze on source-file changes and notify the dashboard")
      .option("--no-open", "Do not auto-open the served URL in your default browser")
      .option("-q, --quiet", "Suppress non-error output")
      .option("--no-cache", "Bypass the incremental .depmod-cache slice cache for this run")
      .option("--no-color", "Disable ANSI colours"),
  );
}

/** Track B.1; file-selection flags. Shared between `serve`, `analyze`, default. */
function attachFilterFlags(command: Command): Command {
  return command
    .option("--include <patterns>", "Comma-separated globs; when set, only matching files are kept")
    .option(
      "--exclude <patterns>",
      "Comma-separated globs; matching files/dirs are dropped (applied after .gitignore)",
    )
    .option("--no-gitignore", "Ignore .gitignore files (default: honour them)")
    .option(
      "--exclude-tests",
      "Omit test/spec files from the graph (default: include them, hidden in the UI)",
    );
}

interface FilterFlags {
  include?: string;
  exclude?: string;
  /** commander's `--no-gitignore` flips this to false; default is true. */
  gitignore?: boolean;
  /** commander's `--exclude-tests`; when true, omit test/spec files at parse time. */
  excludeTests?: boolean;
}

interface ServeLikeFlags extends FilterFlags {
  port?: number;
  host?: string;
  watch?: boolean;
  /** commander's `--no-open` flips this to false; default is true. */
  open?: boolean;
  quiet?: boolean;
  /** commander's `--no-color` flips this to false; default is true. */
  color?: boolean;
  /** commander's `--no-cache` flips this to false. */
  cache?: boolean;
}

interface AnalyzeFlags extends FilterFlags {
  out: string;
  metricsOut?: string;
  quiet?: boolean;
  json?: boolean;
  color?: boolean;
  /** commander's `--no-cache` flips this to false. */
  cache?: boolean;
}

interface CheckFlags {
  failOn?: string;
  json?: boolean;
  /** commander's `--no-color` flips this to false. */
  color?: boolean;
  /** commander's `--no-cache` flips this to false. */
  cache?: boolean;
}

async function invokeServe(
  runServe: typeof defaultRunServe,
  onError: (err: unknown) => void,
  onSignal: (signal: NodeJS.Signals, handler: () => void) => void,
  path: string,
  opts: ServeLikeFlags,
): Promise<void> {
  let handle: Awaited<ReturnType<typeof runServe>> | null = null;
  const shutdown = async () => {
    await handle?.close();
    process.exit(0);
  };
  onSignal("SIGINT", shutdown);
  onSignal("SIGTERM", shutdown);
  try {
    handle = await runServe({
      path,
      port: opts.port,
      host: opts.host,
      watch: opts.watch,
      open: opts.open !== false,
      quiet: opts.quiet,
      noColor: opts.color === false,
      noCache: opts.cache === false,
      ...filterFlagsFromOpts(opts),
    });
  } catch (err) {
    onError(err);
  }
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

// When invoked as the binary (the normal case), parse argv immediately. Tests
// import `buildProgram` and skip this path.
//
// Symlink handling: pnpm sets `process.argv[1]` to the *unresolved* path under
// `node_modules/@depmod/cli/dist/index.js`, while `import.meta.url` is fully
// resolved through symlinks to the pnpm content-addressed store. Compare with
// `realpathSync` on both sides so the two converge and the binary actually
// runs. Without this, `pnpm depmod-ui` exits silently.
if (isMainModule()) {
  await buildProgram().parseAsync(process.argv);
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    const here = realpathSync(fileURLToPath(import.meta.url));
    const entry = realpathSync(process.argv[1]);
    return here === entry;
  } catch {
    return false;
  }
}

/**
 * Fire a daily background check against the npm registry for a newer
 * `depmod-ui` version, and print a one-line notice on the user's next run
 * if one exists. `update-notifier` handles the daily debounce, the
 * detached child process, and the TTY / `NO_UPDATE_NOTIFIER` / `--no-update-notifier`
 * opt-outs — we just need to give it the current package version.
 *
 * Reads `package.json` from disk at runtime instead of importing it: tsup
 * bundles the CLI as ESM and inlining JSON would freeze the version into
 * `dist/index.js` at *build* time, so a `pnpm publish` that bumps the
 * version after the build would ship the old number. Reading at startup
 * keeps the notice accurate.
 */
function notifyOfUpdates(): void {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkgPath = join(here, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      name?: string;
      version?: string;
    };
    if (!pkg.name || !pkg.version) return;
    // 1-day update interval is the package default. Calling `.notify({ defer: true })`
    // (the default) prints on `process.exit`, so the notice lands *after* the user's
    // command output rather than splitting it in two.
    updateNotifier({ pkg: { name: pkg.name, version: pkg.version } }).notify();
  } catch {
    // Network errors, missing config dir, sandboxed installs — none of it
    // should prevent the CLI from running. Swallow.
  }
}
