import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "@depmod/parser";
import kleur from "kleur";
import type { ServeOptions, ServeHandle } from "./commands/serve.js";
import { progressPathForSession, writeParseProgress } from "./session-progress.js";
import { createSessionFilePath, writeGraphSession } from "./session-file.js";
import { watchProject } from "./watch.js";

/** Lowest port we'll try by default. Avoids the usual 3000 / 5173 collisions. */
export const DEFAULT_PORT = 45455;
/** Cap to avoid scanning forever ù 100 simultaneous instances is generous. */
const PORT_SCAN_LIMIT = 100;

export interface NextServeInternals {
  sessionPath: string;
  nextProcess: ChildProcess;
  sessionDir: string;
  port: number;
}

/**
 * Boot mode for the bundled dashboard.
 *
 * - `standalone`: the published tarball layout. `webAppDir` holds
 *   `apps/web/server.js` from Next's `output: "standalone"` build.
 *   No `next` binary is needed ù we spawn `node server.js` directly.
 * - `next-start`: dev fallback. `webAppDir` is a raw `apps/web` with `.next/`
 *   inside; we spawn `next start` from the workspace's `node_modules`.
 */
type ServerMode = "standalone" | "next-start";

interface ResolvedServer {
  mode: ServerMode;
  /** Directory the spawned server runs from. */
  cwd: string;
  /** Description used in error messages. */
  label: string;
}

function resolveServer(webAppDir: string): ResolvedServer | null {
  // Published tarball: packages/cli/web/apps/web/server.js
  const tarballEntry = join(webAppDir, "apps", "web", "server.js");
  if (existsSync(tarballEntry)) {
    return { mode: "standalone", cwd: join(webAppDir, "apps", "web"), label: tarballEntry };
  }
  // Dev: apps/web/.next/standalone/apps/web/server.js
  const devStandalone = join(webAppDir, ".next", "standalone", "apps", "web", "server.js");
  if (existsSync(devStandalone)) {
    return {
      mode: "standalone",
      cwd: join(webAppDir, ".next", "standalone", "apps", "web"),
      label: devStandalone,
    };
  }
  // Dev (raw `next build` output without standalone copy): fall back to
  // `next start` against the live apps/web directory.
  if (existsSync(join(webAppDir, ".next"))) {
    return { mode: "next-start", cwd: webAppDir, label: join(webAppDir, ".next") };
  }
  return null;
}

/**
 * Analyse the target repo, write a session file, and spawn the dashboard
 * with `DEPMOD_SESSION_PATH` set so `/api/graph` serves the freshly-analysed
 * graph.
 *
 * Published tarballs use Next's standalone output (`node server.js`), which
 * has no runtime dependency on a `next` binary. Dev keeps `next start` as a
 * fallback so contributors can iterate without running `prepare-package`.
 */
export async function runServeNext(
  options: ServeOptions,
  webAppDir: string,
): Promise<ServeHandle & { next: NextServeInternals }> {
  const cwd = process.cwd();
  const absPath = isAbsolute(options.path) ? options.path : resolve(cwd, options.path);
  if (!existsSync(absPath)) {
    throw new Error(`depmod-ui: path does not exist: ${absPath}`);
  }
  const server = resolveServer(webAppDir);
  if (!server) {
    throw new Error(
      "depmod-ui: no prebuilt dashboard found under " +
        `${webAppDir}. Expected either a standalone \`apps/web/server.js\` ` +
        "(published tarball) or `.next/` (dev). If you're developing the " +
        "monorepo, run `pnpm --filter web build` first.",
    );
  }

  const stdout = options.stdout ?? ((line) => console.log(line));
  const noColor = options.noColor ?? !process.stdout?.isTTY;
  const colour = (s: string, fn: (s: string) => string) => (noColor ? s : fn(s));
  const log = (line: string) => {
    if (options.quiet) return;
    stdout(line);
  };

  const host = options.host ?? "127.0.0.1";
  // When the user supplies `--port`, trust them exactly (and let the spawn
  // fail loudly if it's taken). Otherwise scan from DEFAULT_PORT upward so
  // the user can open multiple projects at once without juggling flags.
  const port =
    options.port !== undefined
      ? options.port
      : await findFreePort(host, DEFAULT_PORT, PORT_SCAN_LIMIT);

  const analyzeOptions = buildAnalyzeOptions(options);
  const sessionPath = createSessionFilePath();
  const sessionDir = dirname(sessionPath);
  const progressPath = progressPathForSession(sessionPath);

  // ?? Banner ??????????????????????????????????????????????????????????
  log("");
  log(
    `  ${colour("depmod-ui", (s) => kleur.cyan().bold(s))} ${colour(
      `v${packageVersion()}`,
      kleur.dim,
    )}`,
  );
  log(`  ${colour(absPath, kleur.dim)}`);
  log("");

  writeParseProgress(progressPath, {
    phase: "starting",
    message: "Starting dashboardù",
    percent: 0,
  });

  const nextProcess = spawnServer(server, {
    port,
    host,
    sessionPath,
    progressPath,
    targetRoot: absPath,
    quiet: options.quiet === true,
  });
  const nextBoot = { failed: null as Error | null };
  watchNextExit(nextProcess, port, nextBoot);

  const baseUrl = `http://${host}:${port}`;

  writeParseProgress(progressPath, {
    phase: "parsing",
    message: "Analyzing projectù",
    percent: 10,
  });
  log(`  ${colour("?", kleur.dim)} ${colour("Analyzingù", kleur.dim)}`);
  const analyzeStart = Date.now();

  const [initial] = await Promise.all([
    analyze(absPath, analyzeOptions),
    waitForNextReady(baseUrl, 60_000, nextBoot, (line) => log(line)),
  ]);

  writeGraphSession(sessionPath, initial);
  writeParseProgress(progressPath, {
    phase: "ready",
    message: "Graph ready",
    percent: 100,
    nodes: initial.stats.nodes,
    edges: initial.stats.edges,
  });
  const analyzeMs = Date.now() - analyzeStart;
  const cyclesText =
    initial.stats.cycles === 0
      ? colour("no cycles", kleur.dim)
      : colour(
          `${initial.stats.cycles} ${initial.stats.cycles === 1 ? "cycle" : "cycles"}`,
          kleur.yellow,
        );
  log(
    `  ${colour("?", kleur.green)} ` +
      `${colour(initial.stats.nodes.toLocaleString(), kleur.bold)} ${colour("nodes", kleur.dim)} ù ` +
      `${colour(initial.stats.edges.toLocaleString(), kleur.bold)} ${colour("edges", kleur.dim)} ù ` +
      `${cyclesText} ` +
      `${colour(`ù ${formatDuration(analyzeMs)}`, kleur.dim)}`,
  );

  await waitForGraphEndpoint(baseUrl, 15_000);

  log(`  ${colour("?", kleur.green)} ${colour(baseUrl, (s) => kleur.cyan().underline(s))}`);
  if (options.watch) {
    log(`  ${colour("?", kleur.green)} ${colour("Watching for changes", kleur.dim)}`);
  }
  log("");
  log(`  ${colour("Press Ctrl-C to stop.", kleur.dim)}`);
  log("");

  let watcherHandle: { close: () => Promise<void> } | null = null;
  if (options.watch) {
    watcherHandle = watchProject({
      root: absPath,
      onChange: async () => {
        try {
          writeParseProgress(progressPath, {
            phase: "parsing",
            message: "Re-analyzingù",
            percent: 20,
          });
          const next = await analyze(absPath, analyzeOptions);
          writeGraphSession(sessionPath, next);
          writeParseProgress(progressPath, {
            phase: "ready",
            message: "Graph updated",
            percent: 100,
            nodes: next.stats.nodes,
            edges: next.stats.edges,
          });
          if (!options.quiet) {
            log(
              `  ${colour("?", kleur.cyan)} ` +
                `${colour(next.stats.nodes.toLocaleString(), kleur.bold)} ${colour(
                  "nodes",
                  kleur.dim,
                )} ù ` +
                `${colour(next.stats.edges.toLocaleString(), kleur.bold)} ${colour(
                  "edges",
                  kleur.dim,
                )} ù ` +
                (next.stats.cycles === 0
                  ? colour("no cycles", kleur.dim)
                  : colour(
                      `${next.stats.cycles} ${next.stats.cycles === 1 ? "cycle" : "cycles"}`,
                      kleur.yellow,
                    )) +
                ` ${colour(`ù ${formatDuration(next.stats.parseMs)}`, kleur.dim)}`,
            );
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`${colour("depmod-ui:", kleur.red)} re-analyze failed: ${message}\n`);
        }
      },
    });
  }

  if (options.open) {
    openBrowser(baseUrl);
  }

  return {
    url: baseUrl,
    next: { sessionPath, nextProcess, sessionDir, port },
    async close() {
      await watcherHandle?.close();
      if (!nextProcess.killed) {
        nextProcess.kill("SIGTERM");
        await new Promise<void>((resolveClose) => {
          nextProcess.once("exit", () => resolveClose());
          setTimeout(() => {
            if (!nextProcess.killed) nextProcess.kill("SIGKILL");
            resolveClose();
          }, 3000);
        });
      }
    },
  };
}

function buildAnalyzeOptions(options: ServeOptions) {
  return {
    ...(options.include ? { include: options.include } : {}),
    ...(options.exclude ? { exclude: options.exclude } : {}),
    ...(options.respectGitignore !== undefined
      ? { respectGitignore: options.respectGitignore }
      : {}),
    ...(options.excludeTests === true ? { excludeTests: true } : {}),
  };
}

interface SpawnOpts {
  port: number;
  host: string;
  sessionPath: string;
  progressPath: string;
  targetRoot: string;
  quiet: boolean;
}

function readBundledNodePath(webRoot: string): string | undefined {
  const manifest = join(webRoot, "node-path.txt");
  if (!existsSync(manifest)) return undefined;
  const sep = process.platform === "win32" ? ";" : ":";
  const lines = readFileSync(manifest, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines.join(sep) : undefined;
}

function spawnServer(server: ResolvedServer, opts: SpawnOpts): ChildProcess {
  const webRoot = join(server.cwd, "..", "..");
  const bundledNodePath = readBundledNodePath(webRoot);
  const nodePath = bundledNodePath
    ? [bundledNodePath, process.env.NODE_PATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":")
    : process.env.NODE_PATH;
  const env = {
    ...process.env,
    DEPMOD_SESSION_PATH: opts.sessionPath,
    DEPMOD_PROGRESS_PATH: opts.progressPath,
    DEPMOD_TARGET_ROOT: opts.targetRoot,
    PORT: String(opts.port),
    HOSTNAME: opts.host,
    ...(nodePath ? { NODE_PATH: nodePath } : {}),
  };

  let child: ChildProcess;
  if (server.mode === "standalone") {
    // Next.js standalone: a self-contained server.js with its own minimal
    // node_modules. No external `next` binary required, which is the whole
    // point ù published tarballs don't have to bundle the Next CLI.
    child = spawn(process.execPath, ["server.js"], {
      cwd: server.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } else {
    // Dev fallback: invoke `next start` via the workspace-installed binary.
    const nextBin = resolveNextBin(server.cwd);
    child = nextBin
      ? spawn(
          process.execPath,
          [nextBin, "start", "--port", String(opts.port), "--hostname", opts.host],
          { cwd: server.cwd, env, stdio: ["ignore", "pipe", "pipe"] },
        )
      : spawn(
          "npx",
          ["next", "start", "--port", String(opts.port), "--hostname", opts.host],
          { cwd: server.cwd, env, stdio: ["ignore", "pipe", "pipe"] },
        );
  }

  if (!opts.quiet) {
    pipeNextOutput(child.stdout, process.stdout);
    pipeNextOutput(child.stderr, process.stderr);
  }
  return child;
}

/**
 * Lines emitted by `next start` that duplicate (or precede) our own banner;
 * we drop them so the depmod-ui output is the only one the user sees. Match
 * the line *content* (stripped of ANSI) so colour codes don't defeat us.
 */
const NEXT_NOISE_PATTERNS: readonly RegExp[] = [
  /^\s*?\s+Next\.js/i,
  /^\s*-\s*Local:/i,
  /^\s*-\s*Network:/i,
  /^\s*-\s*Environments:/i,
  /^\s*-\s*Experiments\b/i,
  /^\s*?\s+Starting/i,
  /^\s*?\s+Ready in/i,
  /^\s*?\s+Compiled/i,
  /^\s*Used `--port` is /i,
  // Next.js telemetry / collected-data notices.
  /^\s*Attention:/i,
];

function pipeNextOutput(
  source: NodeJS.ReadableStream | null,
  sink: NodeJS.WritableStream,
): void {
  if (!source) return;
  let buffer = "";
  source.setEncoding?.("utf8");
  source.on("data", (chunk: string) => {
    buffer += chunk;
    let idx = buffer.indexOf("\n");
    while (idx !== -1) {
      const rawLine = buffer.slice(0, idx + 1);
      buffer = buffer.slice(idx + 1);
      if (!isNextNoise(rawLine)) sink.write(rawLine);
      idx = buffer.indexOf("\n");
    }
  });
  source.on("end", () => {
    if (buffer.length > 0 && !isNextNoise(buffer)) sink.write(buffer);
  });
}

function isNextNoise(line: string): boolean {
  const stripped = line.replace(/\[[0-9;]*m/g, "").trim();
  if (stripped.length === 0) return true; // drop the blank separator lines too
  return NEXT_NOISE_PATTERNS.some((re) => re.test(stripped));
}

/** Walk up from `webAppDir` looking for `node_modules/.bin/next`. */
function resolveNextBin(webAppDir: string): string | null {
  let dir = webAppDir;
  while (true) {
    const candidate = join(dir, "node_modules", "next", "dist", "bin", "next");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Fail fast when `next start` exits (e.g. EADDRINUSE on the port). */
function watchNextExit(
  child: ChildProcess,
  port: number,
  boot: { failed: Error | null },
): void {
  child.on("exit", (code, signal) => {
    if (code === 0 && !signal) return;
    const hint =
      code === 1
        ? ` Is port ${port} already in use? Stop the other process or pass --port.`
        : "";
    boot.failed = new Error(
      `Next.js exited before ready (code=${code ?? "null"}, signal=${signal ?? "null"}).${hint}`,
    );
  });
}

async function waitForNextReady(
  baseUrl: string,
  timeoutMs: number,
  boot: { failed: Error | null },
  log?: (line: string) => void,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let loggedWait = false;
  while (Date.now() < deadline) {
    if (boot.failed) throw boot.failed;
    try {
      const res = await fetch(`${baseUrl}/api/progress`, { signal: AbortSignal.timeout(4_000) });
      if (res.ok) return;
    } catch {
      // Next still booting or not responding yet.
    }
    if (log && !loggedWait) {
      log(kleur.dim("  ? Booting serverù"));
      loggedWait = true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `depmod-ui: Next.js did not become ready at ${baseUrl} within ${timeoutMs / 1000}s. ` +
      "Check the logs above for the underlying error.",
  );
}

async function waitForGraphEndpoint(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/graph`, {
        method: "HEAD",
        signal: AbortSignal.timeout(4_000),
      });
      if (res.ok) return;
    } catch {
      // route still warming up
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `depmod-ui: /api/graph did not become available at ${baseUrl} within ${timeoutMs / 1000}s`,
  );
}

/**
 * Find the first free TCP port at or above `start` on `host`. Tries up to
 * `limit` consecutive ports; throws if none are available so the user gets
 * a clear error instead of an opaque listen failure.
 */
export async function findFreePort(host: string, start: number, limit: number): Promise<number> {
  for (let port = start; port < start + limit; port++) {
    if (await isPortFree(host, port)) return port;
  }
  throw new Error(
    `depmod-ui: no free port in [${start}, ${start + limit}) on ${host}. ` +
      "Pass --port to pick one explicitly.",
  );
}

function isPortFree(host: string, port: number): Promise<boolean> {
  return new Promise((resolveTry) => {
    const server = createServer();
    server.unref();
    server.once("error", () => {
      resolveTry(false);
    });
    server.listen({ host, port, exclusive: true }, () => {
      server.close(() => resolveTry(true));
    });
  });
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // Best-effort.
  }
}

/**
 * Locate the dashboard's web directory. Returns whatever `resolveServer`
 * will recognise ù either:
 *   - the published tarball's bundled `web/` directory (containing
 *     `apps/web/server.js`), or
 *   - the dev monorepo's `apps/web/` directory (containing `.next/` or its
 *     standalone subtree).
 */
export function findMonorepoWebApp(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Published tarball: packages/cli/web/ (sibling of dist/).
    join(here, "..", "web"),
    // Dev: walk up to monorepo root, then apps/web.
    join(here, "..", "..", "..", "apps", "web"),
    join(process.cwd(), "apps", "web"),
    join(process.cwd(), "code", "apps", "web"),
  ];
  for (const c of candidates) {
    const resolved = resolve(c);
    // Bundled tarball layout: web/apps/web/server.js
    if (existsSync(join(resolved, "apps", "web", "server.js"))) return resolved;
    // Dev source layout: package.json + next.config.ts marker files
    if (existsSync(join(resolved, "package.json")) && existsSync(join(resolved, "next.config.ts"))) {
      return resolved;
    }
  }
  return null;
}

/**
 * Human-friendly duration: `345ms` stays in ms, `2_508ms` renders as `2.5s`,
 * `91_000ms` renders as `1m 31s`. Keeps the banner readable for both fast
 * incremental re-analyses and the first cold parse on a large repo.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** Best-effort read of the CLI package version for the banner. */
function packageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // package.json sits one level up from `dist/`
    const pkgPath = join(here, "..", "package.json");
    const raw = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
    return raw.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
