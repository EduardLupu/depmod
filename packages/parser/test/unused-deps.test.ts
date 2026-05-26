import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Graph } from "@depmod/types";
import { afterEach, describe, expect, it } from "vitest";
import { findUnusedDependencies } from "../src/unused-deps.js";

function mkRoot(): string {
  return mkdtempSync(join(tmpdir(), "depmod-unused-deps-"));
}

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) {
    const dir = cleanups.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function writePkg(
  root: string,
  deps: Record<string, string>,
  devDeps: Record<string, string> = {},
) {
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "demo", dependencies: deps, devDependencies: devDeps }, null, 2),
  );
}

function graphFor(root: string, externals: Record<string, string[]>): Graph {
  return {
    schemaVersion: 1,
    generatedAt: "2025-01-01T00:00:00.000Z",
    rootDir: root,
    stats: { files: 0, nodes: 0, edges: 0, cycles: 0, parseMs: 0 },
    nodes: [],
    edges: [],
    cycles: [],
    externalDependencies: externals,
  };
}

describe("findUnusedDependencies", () => {
  it("flags a declared dependency that nothing imports", () => {
    const root = mkRoot();
    cleanups.push(root);
    writePkg(root, { lodash: "^4.0.0", react: "^18.0.0" });
    const g = graphFor(root, { "src/index.ts": ["react"] });
    const unused = findUnusedDependencies(g);
    expect(unused.map((u) => u.name)).toEqual(["lodash"]);
    expect(unused[0]?.kind).toBe("dependencies");
  });

  it("ignores devDependencies on the default allowlist", () => {
    const root = mkRoot();
    cleanups.push(root);
    writePkg(root, {}, { vitest: "^2.0.0", typescript: "^5.0.0", unused: "^1.0.0" });
    const g = graphFor(root, {});
    expect(findUnusedDependencies(g).map((u) => u.name)).toEqual(["unused"]);
  });

  it("treats imports anywhere in the workspace as usage", () => {
    const root = mkRoot();
    cleanups.push(root);
    writePkg(root, { react: "^18.0.0" });
    const g = graphFor(root, { "src/deep/nested/file.ts": ["react"] });
    expect(findUnusedDependencies(g)).toEqual([]);
  });

  it("scopes usage to the owning workspace in monorepos", () => {
    const root = mkRoot();
    cleanups.push(root);
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    mkdirSync(join(root, "packages", "lib"), { recursive: true });
    writePkg(root, {});
    writeFileSync(
      join(root, "apps", "web", "package.json"),
      JSON.stringify({ name: "web", dependencies: { react: "^18.0.0" } }),
    );
    writeFileSync(
      join(root, "packages", "lib", "package.json"),
      JSON.stringify({ name: "lib", dependencies: { react: "^18.0.0" } }),
    );
    // react is only imported from apps/web; packages/lib should flag it.
    const g = graphFor(root, { "apps/web/src/page.tsx": ["react"] });
    const unused = findUnusedDependencies(g);
    expect(unused).toEqual([{ workspace: "packages/lib", name: "react", kind: "dependencies" }]);
  });
});
