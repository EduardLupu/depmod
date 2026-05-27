import { renameSync, writeFileSync } from "node:fs";

/** See packages/cli/src/atomic-write.ts — same contract for session/progress files. */
export function writeAtomicUtf8(path: string, contents: string): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, path);
}
