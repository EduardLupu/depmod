#!/usr/bin/env node
// Assemble `packages/cli/web/` from the standalone Next.js build, plus copy
// repo-root README/LICENSE into the package. Runs as `prepack`, so any
// `npm pack` / `npm publish` produces a self-contained tarball.
//
// Layout produced:
//   packages/cli/web/
//     apps/web/server.js   (standalone entry, run with `node server.js`)
//     apps/web/.next/      (compiled chunks + static + public)
//     apps/web/public/     (public assets, if present)
//
// The bundled `node_modules` from Next's standalone output is intentionally
// stripped. We declare `next`, `react`, `react-dom`, `sharp` etc. as runtime
// `dependencies` of `depmod-ui` instead, so npm installs the correct
// platform binaries per-user (Windows x64, Linux x64, macOS arm64, …).
// Node's module resolution walks up from `server.js` and finds them in
// `depmod-ui`'s own `node_modules` at install time.
//
// Why we stopped bundling them: the prior approach shipped macOS arm64
// binaries (`@img/sharp-darwin-arm64`, `@swc/core-darwin-arm64`) baked into
// the tarball, which broke installs on every other platform. It also hit
// Windows MAX_PATH limits on the deeply nested pnpm-style paths.

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, "..");
const monorepoRoot = resolve(cliRoot, "..", "..");
const webApp = join(monorepoRoot, "apps", "web");
const standalone = join(webApp, ".next", "standalone");
const targetWeb = join(cliRoot, "web");

function log(msg) {
  process.stdout.write(`[prepare-package] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[prepare-package] ERROR: ${msg}\n`);
  process.exit(1);
}

function dirSize(p) {
  let bytes = 0;
  let files = 0;
  const walk = (cur) => {
    for (const entry of readdirSync(cur, { withFileTypes: true })) {
      const next = join(cur, entry.name);
      if (entry.isDirectory()) walk(next);
      else {
        files += 1;
        try {
          bytes += statSync(next).size;
        } catch {
          // race with concurrent writes — ignore.
        }
      }
    }
  };
  walk(p);
  return { bytes, files };
}

// ── 1. Build the web app (unless caller signals it's already fresh) ──────
if (process.env.DEPMOD_SKIP_WEB_BUILD === "1") {
  log("DEPMOD_SKIP_WEB_BUILD=1 — skipping `pnpm --filter web build`.");
} else {
  log("Building apps/web (Next.js standalone)…");
  // `shell: true` is required on Windows because there's no `pnpm`
  // executable on PATH — only `pnpm.cmd`. Without it, Node's spawnSync
  // can't find the binary and the child exits with code `null` (killed
  // before launch). The shell flag also resolves `pnpm.ps1` / `pnpm.cmd`
  // properly via cmd.exe. POSIX systems are unaffected since `pnpm` is
  // a real binary there; using shell mode is a tiny overhead.
  const r = spawnSync("pnpm", ["--filter", "web", "build"], {
    cwd: monorepoRoot,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
  if (r.status !== 0) {
    const errPart = r.error ? ` error=${r.error.message}` : "";
    fail(
      `pnpm --filter web build exited with status=${r.status} signal=${r.signal ?? "none"}${errPart}`,
    );
  }
}

if (!existsSync(standalone)) {
  fail(
    `expected standalone output at ${standalone} — is \`output: "standalone"\` set in next.config?`,
  );
}

// ── 2. Recreate `packages/cli/web/` ──────────────────────────────────────
log(`Recreating ${relative(monorepoRoot, targetWeb)}/`);
rmSync(targetWeb, { recursive: true, force: true });
mkdirSync(targetWeb, { recursive: true });

// ── 3. Copy the standalone tree, then strip the bundled node_modules ────
// Next.js standalone lays files out under `standalone/<workspace-path>/`.
// We mirror that whole tree so server.js's relative requires resolve
// internally, then delete the bundled `node_modules` so the tarball stays
// portable. The runtime dependencies are declared in `package.json` and
// installed per-platform by npm.
log("Copying .next/standalone → web/");
cpSync(standalone, targetWeb, { recursive: true, dereference: true });

// Strip every `node_modules/` anywhere under the standalone tree. Walks
// the tree once and removes them in place — there are usually two:
//   web/node_modules                  (Next's runtime resolves)
//   web/apps/web/node_modules         (workspace-specific resolves)
function stripNodeModules(root) {
  let count = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = join(dir, entry.name);
      if (entry.name === "node_modules") {
        rmSync(p, { recursive: true, force: true });
        count++;
        continue;
      }
      walk(p);
    }
  };
  walk(root);
  return count;
}
const stripped = stripNodeModules(targetWeb);
log(`Stripped ${stripped} bundled node_modules tree(s) — runtime deps come from npm install.`);

// ── 4. Copy README + LICENSE next to the package ────────────────────────
for (const f of ["README.md", "LICENSE"]) {
  const src = join(monorepoRoot, f);
  const dst = join(cliRoot, f);
  if (!existsSync(src)) {
    log(`WARN: ${f} not found at repo root; skipping.`);
    continue;
  }
  copyFileSync(src, dst);
  log(`Copied ${f}`);
}

// ── 5. Summary ──────────────────────────────────────────────────────────
const { bytes, files } = dirSize(targetWeb);
const mb = (bytes / 1024 / 1024).toFixed(1);
log(`web/ contains ${files} files (${mb} MB on disk)`);
log("Ready to pack.");
