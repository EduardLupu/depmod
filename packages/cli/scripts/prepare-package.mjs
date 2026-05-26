#!/usr/bin/env node
// Assemble `packages/cli/web/` from the standalone Next.js build, plus copy
// repo-root README/LICENSE into the package. Runs as `prepack`, so any
// `npm pack` / `npm publish` produces a self-contained tarball.
//
// Layout produced:
//   packages/cli/web/
//     apps/web/server.js         (standalone entry, run with `node server.js`)
//     apps/web/.next/            (compiled chunks + static)
//     apps/web/public/           (public assets, if present)
//     node_modules/              (only deps the trace actually used)
//
// Why pure-Node: this runs at publish-time on machines that may not have
// rsync or specific shells; avoiding shell deps keeps the script portable.

import {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  readdirSync,
  copyFileSync,
  cpSync,
  realpathSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { writeNodePathManifest } from "./write-node-path-manifest.mjs";

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

/** npm pack drops symlink entries; replace top-level hoists with real directories. */
function materializeHoists(nmDir) {
  if (!existsSync(nmDir)) return;
  for (const entry of readdirSync(nmDir, { withFileTypes: true })) {
    if (!entry.isSymbolicLink()) continue;
    const p = join(nmDir, entry.name);
    const target = realpathSync(p);
    rmSync(p, { recursive: true, force: true });
    cpSync(target, p, { recursive: true, dereference: true });
  }
}

/** Copy Next's virtual-store peers (styled-jsx, etc.) next to the hoisted `next`. */
function hoistNextVirtualStore(bundleRoot) {
  const pnpmDir = join(bundleRoot, "node_modules", ".pnpm");
  const appNm = join(bundleRoot, "apps", "web", "node_modules");
  if (!existsSync(pnpmDir) || !existsSync(appNm)) return;
  const nextStore = readdirSync(pnpmDir).find((d) => d.startsWith("next@"));
  if (!nextStore) return;
  const virt = join(pnpmDir, nextStore, "node_modules");
  for (const pkg of readdirSync(virt)) {
    const dst = join(appNm, pkg);
    if (existsSync(dst)) continue;
    cpSync(join(virt, pkg), dst, { recursive: true, dereference: true });
  }
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
  const r = spawnSync("pnpm", ["--filter", "web", "build"], {
    cwd: monorepoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) fail(`pnpm --filter web build exited with code ${r.status}`);
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

// ── 3. Copy standalone tree ──────────────────────────────────────────────
// Next puts the *app* under standalone/<workspace-path>/, mirroring the
// `outputFileTracingRoot` layout. The web app's postbuild step
// (`apps/web/scripts/finalize-standalone.mjs`) has already populated
// `.next/static` and `public/` next to the server, so we only need to copy
// the whole tree verbatim.
// Dereference all symlinks so `npm pack` ships real files (pnpm links break on install).
log("Copying .next/standalone → web/ (dereferencing symlinks)…");
cpSync(standalone, targetWeb, { recursive: true, dereference: true });
materializeHoists(join(targetWeb, "apps", "web", "node_modules"));
hoistNextVirtualStore(targetWeb);

// npm pack omits scoped packages under nested `node_modules/` (e.g. `@swc/*`).
// Flatten hoisted deps to `web/standalone-deps/` and resolve via NODE_PATH at runtime.
const standaloneDeps = join(targetWeb, "standalone-deps");
const appNm = join(targetWeb, "apps", "web", "node_modules");
rmSync(standaloneDeps, { recursive: true, force: true });
cpSync(appNm, standaloneDeps, { recursive: true, dereference: true });
log(`Flattened runtime deps → ${relative(monorepoRoot, standaloneDeps)}/`);
writeNodePathManifest(targetWeb);

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
