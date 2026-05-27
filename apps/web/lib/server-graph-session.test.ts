import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeAtomicUtf8 } from "./atomic-write";

describe("watchGraphSession", () => {
  const prev = process.env.DEPMOD_SESSION_PATH;

  afterEach(() => {
    if (prev === undefined) process.env.DEPMOD_SESSION_PATH = undefined;
    else process.env.DEPMOD_SESSION_PATH = prev;
    vi.resetModules();
  });

  it("fires when the session file is replaced atomically", async () => {
    const dir = mkdtempSync(join(tmpdir(), "depmod-session-watch-"));
    const sessionPath = join(dir, "session.json");
    writeFileSync(sessionPath, '{"graph":{},"updatedAt":"t0"}', "utf8");
    process.env.DEPMOD_SESSION_PATH = sessionPath;

    const { watchGraphSession } = await import("./server-graph-session");
    let hits = 0;
    const stop = watchGraphSession(() => {
      hits += 1;
    });

    await new Promise((r) => setTimeout(r, 50));
    writeAtomicUtf8(sessionPath, '{"graph":{},"updatedAt":"t1"}');
    await new Promise((r) => setTimeout(r, 200));
    stop();

    expect(hits).toBeGreaterThan(0);
  });
});
