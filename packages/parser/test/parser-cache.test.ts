import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyze } from "../src/parser.js";
import type { CacheStats } from "../src/parser.js";

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) {
    const dir = cleanups.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function mkProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "depmod-parser-cache-"));
  cleanups.push(root);
  // Minimal tsconfig so the parser picks up modern resolution.
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "es2022", module: "esnext", moduleResolution: "bundler" },
    }),
  );
  for (const [relPath, contents] of Object.entries(files)) {
    const abs = join(root, relPath);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, contents);
  }
  return root;
}

describe("analyze(); Track I incremental cache", () => {
  it("populates the cache on first run; reuses every slice on a no-op second run", async () => {
    const root = mkProject({
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "import { a } from './a';\nexport const b = a + 1;\n",
    });

    let firstStats: CacheStats | null = null;
    await analyze(root, {
      onCacheStats: (s) => {
        firstStats = s;
      },
    });
    expect(firstStats).toMatchObject({ enabled: true, hits: 0, misses: 2 });

    let secondStats: CacheStats | null = null;
    await analyze(root, {
      onCacheStats: (s) => {
        secondStats = s;
      },
    });
    expect(secondStats).toMatchObject({
      enabled: true,
      hits: 2,
      misses: 0,
      invalidatedReason: null,
    });
  });

  it("re-extracts only the file that changed", async () => {
    const root = mkProject({
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "import { a } from './a';\nexport const b = a + 1;\n",
      "src/c.ts": "export const c = 3;\n",
    });

    await analyze(root);
    writeFileSync(join(root, "src/a.ts"), "export const a = 42;\n");

    let stats: CacheStats | null = null;
    await analyze(root, {
      onCacheStats: (s) => {
        stats = s;
      },
    });
    expect(stats?.hits).toBe(2);
    expect(stats?.misses).toBe(1);
  });

  it("invalidates the cache when a file is renamed (file-set hash changes)", async () => {
    const root = mkProject({ "src/a.ts": "export const a = 1;\n" });
    await analyze(root);
    rmSync(join(root, "src/a.ts"));
    writeFileSync(join(root, "src/aa.ts"), "export const a = 1;\n");

    let stats: CacheStats | null = null;
    await analyze(root, {
      onCacheStats: (s) => {
        stats = s;
      },
    });
    expect(stats?.invalidatedReason).toBe("file-set");
    expect(stats?.hits).toBe(0);
    expect(stats?.misses).toBe(1);
  });

  it("invalidates the cache when tsconfig changes", async () => {
    const root = mkProject({ "src/a.ts": "export const a = 1;\n" });
    await analyze(root);
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { target: "es2020", module: "esnext", moduleResolution: "bundler" },
      }),
    );

    let stats: CacheStats | null = null;
    await analyze(root, {
      onCacheStats: (s) => {
        stats = s;
      },
    });
    expect(stats?.invalidatedReason).toBe("tsconfig");
  });

  it("bypasses the cache entirely when { cache: false }", async () => {
    const root = mkProject({ "src/a.ts": "export const a = 1;\n" });
    await analyze(root);

    let stats: CacheStats | null = null;
    await analyze(root, {
      cache: false,
      onCacheStats: (s) => {
        stats = s;
      },
    });
    expect(stats).toMatchObject({ enabled: false, hits: 0, misses: 1 });
  });

  it("produces identical graphs whether cache was hit or fresh", async () => {
    const root = mkProject({
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "import { a } from './a';\nexport const b = a + 1;\n",
    });
    const fixedNow = new Date("2025-01-01T00:00:00.000Z");
    const fresh = await analyze(root, { now: fixedNow, cache: false });
    const cached = await analyze(root, { now: fixedNow }); // populates cache
    const cachedAgain = await analyze(root, { now: fixedNow }); // 100% hits

    // parseMs varies; everything else should match.
    const stripParseMs = (g: typeof fresh) => ({
      ...g,
      stats: { ...g.stats, parseMs: 0 },
    });
    expect(stripParseMs(cached)).toEqual(stripParseMs(fresh));
    expect(stripParseMs(cachedAgain)).toEqual(stripParseMs(fresh));
  });
});
