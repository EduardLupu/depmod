import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeAtomicUtf8 } from "../src/atomic-write.js";
import { watchProject } from "../src/watch.js";

describe("watchProject integration", () => {
  it("notifies when a watched source file changes", async () => {
    const root = mkdtempSync(join(tmpdir(), "depmod-watch-int-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const v = 1;\n", "utf8");

    let hits = 0;
    let handle: { close: () => Promise<void> } | undefined;
    const ready = new Promise<void>((resolve) => {
      handle = watchProject({
        root,
        debounceMs: 80,
        respectGitignore: false,
        onReady: resolve,
        onChange: () => {
          hits += 1;
        },
      });
    });

    await ready;
    await new Promise((r) => setTimeout(r, 300));
    writeFileSync(join(root, "src", "app.ts"), "export const v = 2;\n", "utf8");
    await new Promise((r) => setTimeout(r, 600));
    await handle?.close();
    expect(hits).toBeGreaterThan(0);
  });
});

describe("writeAtomicUtf8", () => {
  it("replaces the target file so directory watchers see an update", async () => {
    const dir = mkdtempSync(join(tmpdir(), "depmod-atomic-"));
    const target = join(dir, "session.json");
    writeFileSync(target, '{"v":1}', "utf8");

    let events = 0;
    const { watch } = await import("node:fs");
    const watcher = watch(dir, (_, name) => {
      if (name === "session.json") events += 1;
    });

    await new Promise((r) => setTimeout(r, 50));
    writeAtomicUtf8(target, '{"v":2}');
    await new Promise((r) => setTimeout(r, 150));
    watcher.close();

    expect(readFileSync(target, "utf8")).toBe('{"v":2}');
    expect(events).toBeGreaterThan(0);
  });
});
