import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildFileFilter, parseGlobList } from "../src";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "depmod-filter-"));
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

describe("buildFileFilter; defaults", () => {
  it("includes a plain .ts file", () => {
    const f = buildFileFilter({ rootDir: root });
    expect(f.includesPath(touch("src/a.ts"))).toBe(true);
  });

  it("rejects .d.ts declarations even without an exclude", () => {
    const f = buildFileFilter({ rootDir: root });
    expect(f.includesPath(touch("src/a.d.ts"))).toBe(false);
  });

  it("rejects non-source extensions", () => {
    const f = buildFileFilter({ rootDir: root });
    expect(f.includesPath(touch("docs/README.md"))).toBe(false);
    expect(f.includesPath(touch("assets/logo.png"))).toBe(false);
  });

  it("excludes the legacy baseline directories", () => {
    const f = buildFileFilter({ rootDir: root });
    expect(f.includesPath(touch("dist/a.ts"))).toBe(false);
    expect(f.includesPath(touch("build/a.ts"))).toBe(false);
    expect(f.includesPath(touch("coverage/a.ts"))).toBe(false);
    expect(f.skipsDirectory(join(root, "dist"))).toBe(true);
  });

  it("includes test files by default", () => {
    const f = buildFileFilter({ rootDir: root });
    expect(f.includesPath(touch("src/foo.test.ts"))).toBe(true);
    expect(f.includesPath(touch("src/__tests__/bar.ts"))).toBe(true);
    expect(f.includesPath(touch("src/foo.ts"))).toBe(true);
  });

  it("excludes test files when excludeTests is true", () => {
    const f = buildFileFilter({ rootDir: root, excludeTests: true });
    expect(f.includesPath(touch("src/foo.test.ts"))).toBe(false);
    expect(f.includesPath(touch("src/__tests__/bar.ts"))).toBe(false);
  });

  it("includes .jsx and .tsx", () => {
    const f = buildFileFilter({ rootDir: root });
    expect(f.includesPath(touch("src/Component.tsx"))).toBe(true);
    expect(f.includesPath(touch("src/legacy.jsx"))).toBe(true);
  });
});

describe("buildFileFilter; .gitignore integration", () => {
  it("honours .gitignore by default", () => {
    writeFileSync(join(root, ".gitignore"), "secrets/\n");
    const f = buildFileFilter({ rootDir: root });
    expect(f.includesPath(touch("secrets/key.ts"))).toBe(false);
    expect(f.includesPath(touch("src/a.ts"))).toBe(true);
  });

  it("respectGitignore=false disables it", () => {
    writeFileSync(join(root, ".gitignore"), "secrets/\n");
    const f = buildFileFilter({ rootDir: root, respectGitignore: false });
    expect(f.includesPath(touch("secrets/key.ts"))).toBe(true);
  });
});

describe("buildFileFilter; user --include / --exclude", () => {
  it("--exclude removes a directory", () => {
    const f = buildFileFilter({ rootDir: root, exclude: ["infrastructure/**"] });
    expect(f.includesPath(touch("infrastructure/main.ts"))).toBe(false);
    expect(f.includesPath(touch("src/a.ts"))).toBe(true);
  });

  it("--include restricts to a single subtree", () => {
    const f = buildFileFilter({ rootDir: root, include: ["apps/web/**"] });
    expect(f.includesPath(touch("apps/web/page.tsx"))).toBe(true);
    expect(f.includesPath(touch("apps/api/server.ts"))).toBe(false);
    expect(f.includesPath(touch("packages/types/index.ts"))).toBe(false);
  });

  it("--exclude wins over --include", () => {
    const f = buildFileFilter({
      rootDir: root,
      include: ["apps/**"],
      exclude: ["apps/api/**"],
    });
    expect(f.includesPath(touch("apps/web/a.ts"))).toBe(true);
    expect(f.includesPath(touch("apps/api/a.ts"))).toBe(false);
  });

  it("supports multiple comma-separated patterns", () => {
    const patterns = parseGlobList(".kiro/**, infrastructure/**, build/**");
    expect(patterns).toEqual([".kiro/**", "infrastructure/**", "build/**"]);
    const f = buildFileFilter({ rootDir: root, exclude: patterns });
    expect(f.includesPath(touch(".kiro/x.ts"))).toBe(false);
    expect(f.includesPath(touch("infrastructure/x.ts"))).toBe(false);
    expect(f.includesPath(touch("src/x.ts"))).toBe(true);
  });

  it("strips leading ./ from patterns for friendlier UX", () => {
    const f = buildFileFilter({ rootDir: root, exclude: ["./build/**"] });
    expect(f.includesPath(touch("build/a.ts"))).toBe(false);
  });
});

describe("parseGlobList", () => {
  it("returns [] for missing or empty input", () => {
    expect(parseGlobList(undefined)).toEqual([]);
    expect(parseGlobList("")).toEqual([]);
    expect(parseGlobList("   ")).toEqual([]);
  });

  it("trims and drops blanks", () => {
    expect(parseGlobList(" a/** , ,b/** ,c ")).toEqual(["a/**", "b/**", "c"]);
  });
});
