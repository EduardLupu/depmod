import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildProgram } from "../src/index.js";

/**
 * Track A; `depmod-ui` defaults to server-first. These tests exercise the
 * command wiring without actually starting a server: `runServe` is replaced
 * with a spy.
 */

interface CallCapture {
  runServe: ReturnType<typeof vi.fn>;
  runAnalyze: ReturnType<typeof vi.fn>;
  errors: unknown[];
}

function makeProgram(): CallCapture & { program: ReturnType<typeof buildProgram> } {
  const runServe = vi.fn(async () => ({
    url: "http://127.0.0.1:0",
    server: {} as never,
    close: async () => {},
  }));
  const runAnalyze = vi.fn(async () => ({
    graphPath: "/tmp/graph.json",
    metricsPath: "/tmp/metrics.json",
    graph: {} as never,
    graphBytes: 0,
    metricsBytes: 0,
  }));
  const errors: unknown[] = [];
  const program = buildProgram({
    runServe,
    runAnalyze,
    onError: (err) => errors.push(err),
    onSignal: () => {},
  });
  // Make commander throw instead of exiting on parse errors so we can assert.
  program.exitOverride();
  for (const c of program.commands) c.exitOverride();
  return { program, runServe, runAnalyze, errors };
}

async function parse(cap: ReturnType<typeof makeProgram>, argv: string[]): Promise<void> {
  await cap.program.parseAsync(["node", "depmod-ui", ...argv]);
}

/** Returns the first arg passed to the first call of a vi mock, narrowed to T. */
function firstArg<T>(mock: ReturnType<typeof vi.fn>): T {
  const call = mock.mock.calls[0];
  if (!call) throw new Error("mock was not called");
  return call[0] as T;
}

describe("buildProgram; default action (Track A)", () => {
  it("`depmod-ui` with no args invokes runServe with path '.'", async () => {
    const cap = makeProgram();
    await parse(cap, []);
    expect(cap.runAnalyze).not.toHaveBeenCalled();
    expect(cap.runServe).toHaveBeenCalledTimes(1);
    expect(firstArg(cap.runServe)).toMatchObject({ path: ".", open: true });
  });

  it("`depmod-ui <path>` (no subcommand) routes to runServe with that path", async () => {
    const cap = makeProgram();
    await parse(cap, ["/tmp/project"]);
    expect(cap.runServe).toHaveBeenCalledTimes(1);
    expect(firstArg(cap.runServe)).toMatchObject({ path: "/tmp/project" });
  });

  it("`--no-open` flips the default open=true to false", async () => {
    const cap = makeProgram();
    await parse(cap, ["--no-open"]);
    expect(firstArg(cap.runServe)).toMatchObject({ open: false });
  });

  it("passes through --port, --host, --watch", async () => {
    const cap = makeProgram();
    await parse(cap, ["--port", "6000", "--host", "0.0.0.0", "--watch"]);
    expect(firstArg(cap.runServe)).toMatchObject({
      port: 6000,
      host: "0.0.0.0",
      watch: true,
    });
  });

  it("--no-color sets noColor=true", async () => {
    const cap = makeProgram();
    await parse(cap, ["--no-color"]);
    expect(firstArg(cap.runServe)).toMatchObject({ noColor: true });
  });
});

describe("buildProgram; `serve` subcommand", () => {
  it("`depmod-ui` (no path) defaults to '.'", async () => {
    const cap = makeProgram();
    await parse(cap, ["serve"]);
    expect(cap.runServe).toHaveBeenCalledTimes(1);
    expect(firstArg(cap.runServe)).toMatchObject({ path: ".", open: true });
  });

  it("`depmod-ui <path>` routes to runServe with that path", async () => {
    const cap = makeProgram();
    await parse(cap, ["serve", "/repo"]);
    expect(firstArg(cap.runServe)).toMatchObject({ path: "/repo" });
  });

  it("`depmod-ui --no-open` keeps the browser closed", async () => {
    const cap = makeProgram();
    await parse(cap, ["serve", "--no-open"]);
    expect(firstArg(cap.runServe)).toMatchObject({ open: false });
  });
});

describe("buildProgram; `analyze` subcommand", () => {
  it("`depmod-ui analyze <path>` routes to runAnalyze, never to runServe", async () => {
    const cap = makeProgram();
    await parse(cap, ["analyze", "/repo"]);
    expect(cap.runServe).not.toHaveBeenCalled();
    expect(cap.runAnalyze).toHaveBeenCalledTimes(1);
    expect(firstArg(cap.runAnalyze)).toMatchObject({
      path: "/repo",
      outGraph: "graph.json",
    });
  });

  it("`depmod-ui analyze` (no path) rejects via commander", async () => {
    const cap = makeProgram();
    await expect(parse(cap, ["analyze"])).rejects.toThrow();
    expect(cap.runAnalyze).not.toHaveBeenCalled();
  });

  it("passes --out and --metrics-out through", async () => {
    const cap = makeProgram();
    await parse(cap, ["analyze", "/repo", "--out", "/tmp/g.json", "--metrics-out", "/tmp/m.json"]);
    expect(firstArg(cap.runAnalyze)).toMatchObject({
      outGraph: "/tmp/g.json",
      outMetrics: "/tmp/m.json",
    });
  });

  it("passes --json and --quiet through", async () => {
    const cap = makeProgram();
    await parse(cap, ["analyze", "/repo", "--json", "--quiet"]);
    expect(firstArg(cap.runAnalyze)).toMatchObject({ json: true, quiet: true });
  });

  it("calls onError when runAnalyze throws", async () => {
    const cap = makeProgram();
    cap.runAnalyze.mockRejectedValueOnce(new Error("boom"));
    await parse(cap, ["analyze", "/repo"]);
    expect(cap.errors).toHaveLength(1);
    expect((cap.errors[0] as Error).message).toBe("boom");
  });
});

describe("buildProgram; Track B.1 file-selection flags", () => {
  it("`depmod-ui . --include a/**,b/**` parses into runServe.include", async () => {
    const cap = makeProgram();
    await parse(cap, [".", "--include", "apps/**, packages/types/**"]);
    expect(firstArg(cap.runServe)).toMatchObject({
      include: ["apps/**", "packages/types/**"],
    });
  });

  it("`depmod-ui . --exclude` parses into runServe.exclude", async () => {
    const cap = makeProgram();
    await parse(cap, [".", "--exclude", "infrastructure/**,.kiro/**"]);
    expect(firstArg(cap.runServe)).toMatchObject({
      exclude: ["infrastructure/**", ".kiro/**"],
    });
  });

  it("`--no-gitignore` flips respectGitignore to false (default true)", async () => {
    const cap = makeProgram();
    await parse(cap, [".", "--no-gitignore"]);
    expect(firstArg(cap.runServe)).toMatchObject({ respectGitignore: false });
  });

  it("default action (no filter flags) keeps respectGitignore=true and empty lists", async () => {
    const cap = makeProgram();
    await parse(cap, []);
    expect(firstArg(cap.runServe)).toMatchObject({
      respectGitignore: true,
      include: [],
      exclude: [],
    });
  });

  it("`depmod-ui . --exclude X` forwards to runServe", async () => {
    const cap = makeProgram();
    await parse(cap, ["serve", ".", "--exclude", "build/**"]);
    expect(firstArg(cap.runServe)).toMatchObject({ exclude: ["build/**"] });
  });

  it("`depmod-ui analyze <p> --include X --no-gitignore` forwards to runAnalyze", async () => {
    const cap = makeProgram();
    await parse(cap, ["analyze", "/repo", "--include", "src/**", "--no-gitignore"]);
    expect(firstArg(cap.runAnalyze)).toMatchObject({
      include: ["src/**"],
      respectGitignore: false,
    });
  });
});

describe("buildProgram; help text", () => {
  it("describes the new command hierarchy in --help", () => {
    const cap = makeProgram();
    const help = cap.program.helpInformation();
    expect(help).toMatch(/analyze[\s\S]*CI\/CD/);
    expect(help).toMatch(/serve[\s\S]*interactive/i);
    expect(help).toMatch(/Path to the project root \(defaults to current/);
  });
});

/**
 * Regression for the silent-exit bug: the compiled binary at
 * `dist/index.js` is invoked through pnpm's bin shim, which sets
 * `process.argv[1]` to a *symlinked* path under
 * `node_modules/@depmod/cli/...`. The original main-module guard
 * compared `import.meta.url` (symlink-resolved) against
 * `pathToFileURL(process.argv[1])` (not resolved), so `parseAsync`
 * never ran and `pnpm depmod-ui --help` printed nothing. Verify the
 * compiled binary actually responds.
 */
describe("compiled binary main-module detection", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const dist = join(here, "..", "dist", "index.js");

  it.skipIf(!existsSync(dist))("`node dist/index.js --help` prints the usage banner", () => {
    const out = execFileSync(process.execPath, [dist, "--help"], {
      encoding: "utf-8",
    });
    expect(out).toContain("Usage: depmod-ui");
    expect(out).toContain("[path]");
  });
});
