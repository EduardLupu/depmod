import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWatchIgnored } from "../src/watch.js";

describe("createWatchIgnored", () => {
  it("does not ignore the project root (relative path is empty)", () => {
    const root = mkdtempSync(join(tmpdir(), "depmod-watch-"));
    const ignore = createWatchIgnored(root, { respectGitignore: false });
    expect(ignore(root)).toBe(false);
  });

  it("ignores node_modules and .git anywhere in the tree", () => {
    const root = mkdtempSync(join(tmpdir(), "depmod-watch-"));
    const ignore = createWatchIgnored(root, { respectGitignore: false });

    expect(ignore(join(root, "node_modules", "react", "index.js"))).toBe(true);
    expect(ignore(join(root, "packages", "app", "node_modules", "x.ts"))).toBe(true);
    expect(ignore(join(root, ".git", "HEAD"))).toBe(true);
    expect(ignore(join(root, "src", "app.ts"))).toBe(false);
  });

  it("honours .gitignore patterns", () => {
    const root = mkdtempSync(join(tmpdir(), "depmod-watch-"));
    writeFileSync(join(root, ".gitignore"), "bench/.targets-cache/\npackages/cli/web/\n");
    mkdirSync(join(root, "bench", ".targets-cache", "demo"), { recursive: true });
    mkdirSync(join(root, "packages", "cli", "web"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "keep.ts"), "export {};\n");

    const ignore = createWatchIgnored(root);
    expect(ignore(join(root, "bench", ".targets-cache", "demo", "file.ts"))).toBe(true);
    expect(ignore(join(root, "packages", "cli", "web", "server.js"))).toBe(true);
    expect(ignore(join(root, "src", "keep.ts"))).toBe(false);
  });

  it("ignores non-source extensions but keeps directories traversable", () => {
    const root = mkdtempSync(join(tmpdir(), "depmod-watch-"));
    const ignore = createWatchIgnored(root, { respectGitignore: false });

    expect(
      ignore(join(root, "README.md"), { isFile: () => true, isDirectory: () => false } as never),
    ).toBe(true);
    expect(
      ignore(join(root, "src"), { isDirectory: () => true, isFile: () => false } as never),
    ).toBe(false);
  });
});
