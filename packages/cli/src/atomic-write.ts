import { renameSync, writeFileSync } from "node:fs";

/**
 * Write UTF-8 text atomically so directory watchers reliably see a `rename`
 * event (plain `writeFileSync` in-place often does not notify on macOS/Linux).
 */
export function writeAtomicUtf8(path: string, contents: string): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, path);
}
