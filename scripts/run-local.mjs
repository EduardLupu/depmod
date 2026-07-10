#!/usr/bin/env node
// Run the workspace build of `depmod-ui` so you're never accidentally testing
// against the globally-installed npm package.
//
// What it does:
//   1. Ensures the workspace packages (types, parser, web, cli) are built.
//      Rebuilds any whose source is newer than its output (cheap mtime
//      check — no `--force`, no full rebuild every run).
//   2. Re-runs `prepare-package` so `packages/cli/web/` mirrors the latest
//      Next.js standalone output (the SPA the local binary serves).
//   3. Invokes `node packages/cli/dist/index.js <argv>` directly, bypassing
//      PATH so a globally-installed `depmod-ui` can't shadow the local one.
//
// Usage:
//   pnpm dev:local <project-path> [--watch] [other flags]
//   pnpm dev:local <path> --skip-build   # rerun without checking freshness

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const cliBin = join(repoRoot, "packages", "cli", "dist", "index.js");

const skipBuild = process.argv.includes("--skip-build");
const argv = process.argv.slice(2).filter((a) => a !== "--skip-build");

function log(msg) {
  process.stdout.write(`[run-local] ${msg}\n`);
}

/**
 * Walk a path and return the newest mtime in the subtree. Skips `node_modules`
 * and any dotfiles to avoid noisy directories (build caches etc.) inflating
 * the "newer than" check.
 */
function newestMtime(p) {
  const s = statSync(p);
  if (s.isFile()) return s.mtimeMs;
  let m = s.mtimeMs;
  for (const entry of readdirSync(p, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const childMtime = newestMtime(join(p, entry.name));
    if (childMtime > m) m = childMtime;
  }
  return m;
}

/** True when `src/` has a newer mtime than `dist/` (or dist is missing). */
function staleByMtime(packageDir, srcSubdir = "src", distSubdir = "dist") {
  const src = join(packageDir, srcSubdir);
  const dist = join(packageDir, distSubdir);
  if (!existsSync(dist)) return true;
  if (!existsSync(src)) return false;
  return newestMtime(src) > newestMtime(dist);
}

function run(cmd, args, { cwd = repoRoot, env = process.env } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!skipBuild) {
  const typesPkg = join(repoRoot, "packages", "types");
  const parserPkg = join(repoRoot, "packages", "parser");
  const cliPkg = join(repoRoot, "packages", "cli");
  const webApp = join(repoRoot, "apps", "web");
  const webStandalone = join(webApp, ".next", "standalone");
  const cliWebMirror = join(cliPkg, "web");

  if (staleByMtime(typesPkg)) {
    log("Rebuilding @depmod/types…");
    run("pnpm", ["--filter", "@depmod/types", "build"]);
  } else {
    log("@depmod/types up to date.");
  }

  if (staleByMtime(parserPkg)) {
    log("Rebuilding @depmod/parser…");
    run("pnpm", ["--filter", "@depmod/parser", "build"]);
  } else {
    log("@depmod/parser up to date.");
  }

  // Web standalone freshness: compare apps/web sources against the standalone
  // output dir (what prepare-package mirrors into the CLI).
  if (!existsSync(webStandalone) || newestMtime(webApp) > newestMtime(webStandalone)) {
    log("Rebuilding apps/web (Next.js standalone)…");
    run("pnpm", ["--filter", "web", "build"]);
  } else {
    log("apps/web standalone up to date.");
  }

  // CLI tsup output.
  if (staleByMtime(cliPkg)) {
    log("Rebuilding depmod-ui (tsup)…");
    run("pnpm", ["--filter", "depmod-ui", "build"]);
  } else {
    log("depmod-ui tsup up to date.");
  }

  // CLI's bundled web mirror — the SPA the binary actually serves. Re-run
  // prepare-package whenever the standalone build is newer than the mirror.
  // DEPMOD_SKIP_WEB_BUILD=1 stops prepare-package re-running the Next build
  // we just finished above.
  if (!existsSync(cliWebMirror) || newestMtime(webStandalone) > newestMtime(cliWebMirror)) {
    log("Mirroring apps/web → packages/cli/web…");
    run("node", ["packages/cli/scripts/prepare-package.mjs"], {
      env: { ...process.env, DEPMOD_SKIP_WEB_BUILD: "1" },
    });
  } else {
    log("packages/cli/web mirror up to date.");
  }
}

if (!existsSync(cliBin)) {
  process.stderr.write(
    "[run-local] ERROR: packages/cli/dist/index.js is missing even after build.\n",
  );
  process.exit(1);
}

log(`Launching local CLI: node ${cliBin} ${argv.join(" ")}`);
const child = spawnSync("node", [cliBin, ...argv], {
  cwd: process.cwd(),
  stdio: "inherit",
});
process.exit(child.status ?? 0);
