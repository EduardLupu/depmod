#!/usr/bin/env node
// Next.js's standalone output ships `server.js` + a minimal `node_modules`,
// but deliberately does NOT copy `.next/static` or `public/` next to it —
// the docs say the deployer is responsible. The CLI spawns `node server.js`
// from inside the standalone tree, so the static assets need to be there
// or the dashboard 404s every chunk.
//
// This runs as `apps/web`'s postbuild step so dev (`pnpm --filter web build`
// + `pnpm depmod-ui`) and the published-tarball assemble (`prepare-package`)
// both produce a complete standalone tree.

import { existsSync, mkdirSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = dirname(here);

// Tracing root is the monorepo, so the server lands at:
//   .next/standalone/apps/web/server.js
const standaloneAppDir = join(webRoot, ".next", "standalone", "apps", "web");
const staticSrc = join(webRoot, ".next", "static");
const publicSrc = join(webRoot, "public");

if (!existsSync(standaloneAppDir)) {
  console.error(
    `[finalize-standalone] standalone tree not found at ${standaloneAppDir}.\n` +
      'Is `output: "standalone"` set in next.config?',
  );
  process.exit(1);
}

if (existsSync(staticSrc)) {
  const staticDst = join(standaloneAppDir, ".next", "static");
  mkdirSync(dirname(staticDst), { recursive: true });
  cpSync(staticSrc, staticDst, { recursive: true });
  console.log(`[finalize-standalone] copied .next/static → ${staticDst}`);
}

if (existsSync(publicSrc)) {
  const publicDst = join(standaloneAppDir, "public");
  cpSync(publicSrc, publicDst, { recursive: true });
  console.log(`[finalize-standalone] copied public/ → ${publicDst}`);
}
