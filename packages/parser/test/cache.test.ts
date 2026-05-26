import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type CacheSlice, hashContent, loadCache, saveCache } from "../src/cache.js";

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) {
    const dir = cleanups.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function mkRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "depmod-cache-test-"));
  cleanups.push(dir);
  return dir;
}

function exampleSlice(over: Partial<CacheSlice> = {}): CacheSlice {
  return {
    contentHash: "deadbeef",
    classification: "lib",
    loc: 10,
    bytes: 200,
    exports: [{ name: "x", type: "function" }],
    edges: [],
    externals: [],
    ...over,
  };
}

describe("hashContent", () => {
  it("is stable for identical input", () => {
    expect(hashContent("abc")).toBe(hashContent("abc"));
  });
  it("differs for different input", () => {
    expect(hashContent("abc")).not.toBe(hashContent("abd"));
  });
});

describe("load/save roundtrip", () => {
  it("returns the saved slices on a clean load with matching metadata", () => {
    const root = mkRoot();
    const ids = ["src/a.ts", "src/b.ts"];
    const slices = new Map([
      ["src/a.ts", exampleSlice({ contentHash: "hashA" })],
      ["src/b.ts", exampleSlice({ contentHash: "hashB" })],
    ]);
    saveCache({
      rootDir: root,
      parserVersion: "0.1.0",
      fileSetIds: ids,
      tsConfigPath: null,
      slices,
    });

    const result = loadCache({
      rootDir: root,
      parserVersion: "0.1.0",
      fileSetIds: ids,
      tsConfigPath: null,
    });
    expect(result.invalidatedReason).toBeNull();
    expect(result.slices.size).toBe(2);
    expect(result.slices.get("src/a.ts")?.contentHash).toBe("hashA");
  });

  it("returns empty + 'missing' when no cache exists", () => {
    const root = mkRoot();
    const result = loadCache({
      rootDir: root,
      parserVersion: "0.1.0",
      fileSetIds: ["a.ts"],
      tsConfigPath: null,
    });
    expect(result.invalidatedReason).toBe("missing");
    expect(result.slices.size).toBe(0);
  });

  it("invalidates the whole cache on parser-version bump", () => {
    const root = mkRoot();
    const slices = new Map([["a.ts", exampleSlice()]]);
    saveCache({
      rootDir: root,
      parserVersion: "0.1.0",
      fileSetIds: ["a.ts"],
      tsConfigPath: null,
      slices,
    });
    const result = loadCache({
      rootDir: root,
      parserVersion: "0.2.0",
      fileSetIds: ["a.ts"],
      tsConfigPath: null,
    });
    expect(result.invalidatedReason).toBe("version");
    expect(result.slices.size).toBe(0);
  });

  it("invalidates when the file set changes (rename/add/delete)", () => {
    const root = mkRoot();
    const slices = new Map([["a.ts", exampleSlice()]]);
    saveCache({
      rootDir: root,
      parserVersion: "0.1.0",
      fileSetIds: ["a.ts", "b.ts"],
      tsConfigPath: null,
      slices,
    });
    const result = loadCache({
      rootDir: root,
      parserVersion: "0.1.0",
      fileSetIds: ["a.ts"], // b.ts removed
      tsConfigPath: null,
    });
    expect(result.invalidatedReason).toBe("file-set");
  });

  it("invalidates when tsconfig content changes", () => {
    const root = mkRoot();
    const tsConfig = join(root, "tsconfig.json");
    writeFileSync(tsConfig, JSON.stringify({ compilerOptions: { target: "es2022" } }));
    const slices = new Map([["a.ts", exampleSlice()]]);
    saveCache({
      rootDir: root,
      parserVersion: "0.1.0",
      fileSetIds: ["a.ts"],
      tsConfigPath: tsConfig,
      slices,
    });

    // Edit tsconfig.
    writeFileSync(tsConfig, JSON.stringify({ compilerOptions: { target: "es2020" } }));

    const result = loadCache({
      rootDir: root,
      parserVersion: "0.1.0",
      fileSetIds: ["a.ts"],
      tsConfigPath: tsConfig,
    });
    expect(result.invalidatedReason).toBe("tsconfig");
  });

  it("survives a partial cache: drops malformed slices, keeps valid ones", () => {
    const root = mkRoot();
    const dir = join(root, ".depmod-cache");
    mkdirSync(dir, { recursive: true });
    const manifest = {
      v: 1,
      parserVersion: "0.1.0",
      tsConfigHash: null,
      fileSetHash: hashContent("a.ts"),
      generatedAt: "2025-01-01T00:00:00.000Z",
      slices: {
        "a.ts": exampleSlice(),
        "b.ts": { contentHash: 42 /* wrong type */ },
      },
    };
    writeFileSync(join(dir, "slices.json"), JSON.stringify(manifest));

    const result = loadCache({
      rootDir: root,
      parserVersion: "0.1.0",
      fileSetIds: ["a.ts"],
      tsConfigPath: null,
    });
    expect(result.invalidatedReason).toBeNull();
    expect(result.slices.size).toBe(1);
    expect(result.slices.has("a.ts")).toBe(true);
  });

  it("returns 'corrupt' on unreadable JSON", () => {
    const root = mkRoot();
    const dir = join(root, ".depmod-cache");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "slices.json"), "{ not json");
    const result = loadCache({
      rootDir: root,
      parserVersion: "0.1.0",
      fileSetIds: [],
      tsConfigPath: null,
    });
    expect(result.invalidatedReason).toBe("corrupt");
  });
});
