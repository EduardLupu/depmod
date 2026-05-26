#!/usr/bin/env node
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Emit newline-separated NODE_PATH entries for the bundled Next standalone tree. */
export function writeNodePathManifest(bundleRoot) {
  const entries = new Set();

  const standaloneDeps = join(bundleRoot, "standalone-deps");
  if (existsSync(standaloneDeps)) {
    entries.add(standaloneDeps);
  }

  const pnpmDir = join(bundleRoot, "node_modules", ".pnpm");
  if (existsSync(pnpmDir)) {
    for (const store of readdirSync(pnpmDir)) {
      entries.add(join(pnpmDir, store, "node_modules"));
    }
  }

  writeFileSync(join(bundleRoot, "node-path.txt"), [...entries].join("\n"));
}
