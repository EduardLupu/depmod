import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveNodeFilePath } from "./resolve-node-file-path";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "depmod-file-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("resolveNodeFilePath", () => {
  it("resolves a file under rootDir", () => {
    const rel = "src/app/page.tsx";
    const absTarget = join(root, rel);
    mkdirSync(dirname(absTarget), { recursive: true });
    writeFileSync(absTarget, "export {}");
    const abs = resolveNodeFilePath(root, rel);
    expect(abs).toBeTruthy();
    expect(abs!.endsWith("src/app/page.tsx")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(resolveNodeFilePath(root, "../outside.ts")).toBeNull();
    expect(resolveNodeFilePath(root, "src/../../etc/passwd")).toBeNull();
  });

  it("rejects empty ids", () => {
    expect(resolveNodeFilePath(root, "")).toBeNull();
    expect(resolveNodeFilePath(root, "/")).toBeNull();
  });
});
