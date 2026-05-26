import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyze } from "../src/parser.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "depmod-parser-ws-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Track B.1; verify the optional `workspaces` field on `Graph` is populated
 * when the parser is pointed at a monorepo, and absent otherwise.
 */
describe("analyze(); workspaces", () => {
  it("emits no `workspaces` field for a plain (non-monorepo) project", async () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "plain" }));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "index.ts"), "export const greet = (n: string) => `Hi ${n}`;");
    const g = await analyze(root, { now: new Date("2026-05-22T00:00:00.000Z") });
    expect(g.workspaces).toBeUndefined();
  });

  it("detects pnpm-workspace.yaml packages", async () => {
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - packages/*\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root" }));

    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "@app/web" }));
    writeFileSync(join(root, "apps", "web", "page.ts"), "export const Page = () => null;");

    mkdirSync(join(root, "packages", "ui"), { recursive: true });
    writeFileSync(
      join(root, "packages", "ui", "package.json"),
      JSON.stringify({ name: "@pkg/ui" }),
    );
    writeFileSync(join(root, "packages", "ui", "button.ts"), "export const Button = () => null;");

    const g = await analyze(root, { now: new Date("2026-05-22T00:00:00.000Z") });
    expect(g.workspaces).toEqual([
      { name: "@app/web", path: "apps/web" },
      { name: "@pkg/ui", path: "packages/ui" },
    ]);
  });
});
