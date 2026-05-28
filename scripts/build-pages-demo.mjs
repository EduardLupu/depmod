#!/usr/bin/env node
// Analyze the depmod monorepo and export graph + per-node source files for the
// GitHub Pages static demo. Requires `pnpm build:internals` first.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze } from "../packages/parser/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = join(repoRoot, "apps", "web", "public", "demo");
const graphPath = join(demoDir, "graph.json");
const sourcesDir = join(demoDir, "sources");

function languageForPath(nodeId) {
  const name = basename(nodeId);
  if (name.endsWith(".tsx") || name.endsWith(".ts")) return "typescript";
  if (name.endsWith(".jsx") || name.endsWith(".js")) return "javascript";
  if (name.endsWith(".mjs") || name.endsWith(".cjs")) return "javascript";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".md")) return "markdown";
  return "plaintext";
}

function resolveNodeFilePath(rootDir, nodeId) {
  const root = resolve(rootDir);
  const normalizedId = nodeId.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalizedId || normalizedId.includes("..")) return null;
  const candidate = resolve(root, normalizedId);
  const rootWithSep = root.endsWith("/") ? root : `${root}/`;
  if (candidate !== root && !candidate.startsWith(rootWithSep)) return null;
  return candidate;
}

function sourceFileName(nodeId) {
  const segments = nodeId.replace(/\\/g, "/").split("/").filter(Boolean);
  return `${segments.map((s) => encodeURIComponent(s)).join("/")}.json`;
}

async function main() {
  console.log("[build-pages-demo] analyzing depmod monorepo…");
  const graph = await analyze(repoRoot);

  rmSync(demoDir, { recursive: true, force: true });
  mkdirSync(sourcesDir, { recursive: true });

  writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf-8");
  console.log(`[build-pages-demo] wrote ${graphPath} (${graph.stats.nodes} nodes)`);

  let exported = 0;
  let skipped = 0;

  for (const node of graph.nodes) {
    const absPath = resolveNodeFilePath(graph.rootDir, node.id);
    if (!absPath) {
      skipped++;
      continue;
    }
    try {
      const st = statSync(absPath);
      if (!st.isFile()) {
        skipped++;
        continue;
      }
      const content = readFileSync(absPath, "utf-8");
      const payload = {
        nodeId: node.id,
        path: absPath,
        language: languageForPath(node.id),
        content,
      };
      const outPath = join(sourcesDir, sourceFileName(node.id));
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(payload)}\n`, "utf-8");
      exported++;
    } catch {
      skipped++;
    }
  }

  console.log(`[build-pages-demo] exported ${exported} source files (${skipped} skipped)`);

  if (exported === 0) {
    console.error("[build-pages-demo] no source files exported; aborting");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[build-pages-demo] failed:", err);
  process.exit(1);
});
