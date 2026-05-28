#!/usr/bin/env node
// Build the dashboard as a static export for GitHub Pages. Temporarily hides
// `app/api/` (route handlers are incompatible with `output: "export"`), then
// restores it so the standalone CLI build path is unaffected.

import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = dirname(here);
const apiDir = join(webRoot, "app", "api");
const apiHidden = join(webRoot, ".standalone-api-backup");
const demoGraph = join(webRoot, "public", "demo", "graph.json");

if (!existsSync(demoGraph)) {
  console.error(`[build-static] missing ${demoGraph}.\nRun \`pnpm build:pages-demo\` first.`);
  process.exit(1);
}

let apiMoved = false;

function restoreApiDir() {
  if (apiMoved && existsSync(apiHidden)) {
    renameSync(apiHidden, apiDir);
    apiMoved = false;
  }
}

process.on("exit", restoreApiDir);
process.on("SIGINT", () => {
  restoreApiDir();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restoreApiDir();
  process.exit(143);
});

if (existsSync(apiDir)) {
  if (existsSync(apiHidden)) {
    console.error(`[build-static] stale ${apiHidden} exists; remove it manually`);
    process.exit(1);
  }
  renameSync(apiDir, apiHidden);
  apiMoved = true;
}

const env = {
  ...process.env,
  DEPMOD_STATIC: "1",
  DEPMOD_BASE_PATH: "",
  NEXT_PUBLIC_DEPMOD_STATIC: "1",
  NEXT_PUBLIC_DEPMOD_BASE_PATH: "",
};

console.log("[build-static] running next build (static export, custom domain root)…");
const result = spawnSync("pnpm", ["exec", "next", "build"], {
  cwd: webRoot,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

restoreApiDir();

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`[build-static] done → ${join(webRoot, "out")}`);
