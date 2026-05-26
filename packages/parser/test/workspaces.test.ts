import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectWorkspaces } from "../src/workspaces.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "depmod-ws-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makePackage(rel: string, name: string): void {
  const dir = join(root, rel);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name }));
}

describe("detectWorkspaces", () => {
  it("returns [] when no manifest declares workspaces", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "plain" }));
    expect(detectWorkspaces({ rootDir: root })).toEqual([]);
  });

  it("reads pnpm-workspace.yaml", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - packages/*\n");
    makePackage("apps/web", "@app/web");
    makePackage("apps/api", "@app/api");
    makePackage("packages/types", "@pkg/types");
    const out = detectWorkspaces({ rootDir: root });
    expect(out).toEqual([
      { name: "@app/api", path: "apps/api" },
      { name: "@app/web", path: "apps/web" },
      { name: "@pkg/types", path: "packages/types" },
    ]);
  });

  it("reads package.json#workspaces (array)", () => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
    );
    makePackage("packages/a", "@x/a");
    makePackage("packages/b", "@x/b");
    const out = detectWorkspaces({ rootDir: root });
    expect(out.map((w) => w.name)).toEqual(["@x/a", "@x/b"]);
  });

  it("reads package.json#workspaces.packages (object form)", () => {
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "root",
        workspaces: { packages: ["apps/*"] },
      }),
    );
    makePackage("apps/foo", "@app/foo");
    expect(detectWorkspaces({ rootDir: root })).toEqual([{ name: "@app/foo", path: "apps/foo" }]);
  });

  it("reads lerna.json#packages as a fallback", () => {
    writeFileSync(join(root, "lerna.json"), JSON.stringify({ packages: ["mods/*"] }));
    makePackage("mods/x", "@lerna/x");
    expect(detectWorkspaces({ rootDir: root })).toEqual([{ name: "@lerna/x", path: "mods/x" }]);
  });

  it("falls back to directory name when package.json has no `name`", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    const dir = join(root, "apps", "noname");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), "{}");
    expect(detectWorkspaces({ rootDir: root })).toEqual([{ name: "noname", path: "apps/noname" }]);
  });

  it("skips directories without a package.json", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    makePackage("apps/web", "@app/web");
    mkdirSync(join(root, "apps", "scratch"), { recursive: true });
    expect(detectWorkspaces({ rootDir: root })).toEqual([{ name: "@app/web", path: "apps/web" }]);
  });

  it("supports the `**` recursive form", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - 'apps/**'\n");
    makePackage("apps/web", "@app/web");
    makePackage("apps/internal/admin", "@app/admin");
    const paths = detectWorkspaces({ rootDir: root }).map((w) => w.path);
    expect(paths).toEqual(["apps/internal/admin", "apps/web"]);
  });

  it("malformed pnpm-workspace.yaml degrades to empty", () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "this: is :: not yaml");
    expect(detectWorkspaces({ rootDir: root })).toEqual([]);
  });
});
