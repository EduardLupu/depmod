import { realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

/** Normalize graph node ids and reject traversal outside `rootDir`. */
export function resolveNodeFilePath(rootDir: string, nodeId: string): string | null {
  const root = resolve(rootDir);
  const normalizedId = nodeId.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalizedId || normalizedId.includes("..")) return null;

  const candidate = resolve(root, normalizedId);
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  if (candidate !== root && !candidate.startsWith(rootWithSep)) return null;

  try {
    const realRoot = realpathSync(root);
    const realCandidate = realpathSync(candidate);
    const realRootSep = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
    if (realCandidate !== realRoot && !realCandidate.startsWith(realRootSep)) return null;
    return realCandidate;
  } catch {
    return candidate.startsWith(rootWithSep) || candidate === root ? candidate : null;
  }
}

/** True when `rootDir` exists and is usable for `/api/file` reads (serve mode). */
export function isServeFilesystemAvailable(rootDir: string | undefined): boolean {
  if (!rootDir) return false;
  return isAbsolute(rootDir);
}
