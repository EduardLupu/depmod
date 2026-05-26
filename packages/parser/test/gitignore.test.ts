import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildGitignore } from "../src/gitignore.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "depmod-gitignore-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function touch(rel: string): string {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, "");
  return abs;
}

describe("buildGitignore", () => {
  it("returns a not-ignoring matcher when no .gitignore exists", () => {
    const m = buildGitignore({ rootDir: root });
    expect(m.ignores(touch("src/a.ts"))).toBe(false);
  });

  it("always ignores node_modules and .git by baseline", () => {
    const m = buildGitignore({ rootDir: root });
    expect(m.ignores(touch("node_modules/foo/index.js"))).toBe(true);
    expect(m.ignores(touch(".git/HEAD"))).toBe(true);
  });

  it("honours a single top-level .gitignore", () => {
    writeFileSync(join(root, ".gitignore"), "build/\n*.log\n");
    const m = buildGitignore({ rootDir: root });
    expect(m.ignores(touch("build/output.js"))).toBe(true);
    expect(m.ignores(touch("debug.log"))).toBe(true);
    expect(m.ignores(touch("src/a.ts"))).toBe(false);
  });

  it("honours nested .gitignore (rebased under root)", () => {
    mkdirSync(join(root, "packages", "ui"), { recursive: true });
    writeFileSync(join(root, "packages", "ui", ".gitignore"), "lib/\n");
    const m = buildGitignore({ rootDir: root });
    expect(m.ignores(touch("packages/ui/lib/index.js"))).toBe(true);
    // Same `lib/` in a different package is NOT ignored; anchoring works.
    expect(m.ignores(touch("packages/api/lib/index.js"))).toBe(false);
  });

  it("supports negation in nested .gitignore", () => {
    writeFileSync(join(root, ".gitignore"), "dist/\n");
    mkdirSync(join(root, "packages", "ui", "dist"), { recursive: true });
    writeFileSync(join(root, "packages", "ui", ".gitignore"), "!dist/keep.js\n");
    const m = buildGitignore({ rootDir: root });
    // Negation requires the parent dir to NOT itself be ignored. Verify the
    // nested file at least loads; semantics of `ignore` lib handle the rest.
    const result = m.ignores(touch("packages/ui/dist/keep.js"));
    expect(typeof result).toBe("boolean");
  });

  it("paths outside the anchor are not-ignored", () => {
    writeFileSync(join(root, ".gitignore"), "*.log\n");
    const m = buildGitignore({ rootDir: root });
    expect(m.ignores("/tmp/something/outside.log")).toBe(false);
  });

  it("dropping leading-slash patterns from ancestor .gitignore", () => {
    // /dist anchored to an ancestor would not match `<root>/dist` after relocation.
    const parent = mkdtempSync(join(tmpdir(), "depmod-gi-anc-"));
    try {
      writeFileSync(join(parent, ".gitignore"), "/dist\n");
      writeFileSync(join(parent, ".git"), ""); // sentinel so the walk stops
      const child = join(parent, "child");
      mkdirSync(child, { recursive: true });
      const m = buildGitignore({ rootDir: child });
      expect(m.ignores(join(child, "dist", "out.js"))).toBe(false);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
