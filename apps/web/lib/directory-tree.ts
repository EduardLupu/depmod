import type { Graph } from "@depmod/types";

export interface DirectoryNode {
  /** Full POSIX path from repo root, e.g. "apps/web/lib". */
  path: string;
  /** Last path segment, e.g. "lib". */
  segment: string;
  /** Subdirectories, sorted by segment. */
  children: DirectoryNode[];
  /** Total descendant files (recursive). */
  fileCount: number;
  /**
   * Files whose immediate parent is this directory (i.e. not nested deeper).
   * Used by the UI to render direct file children alongside subdirectories
   * if we ever want a hybrid tree; for now it's only consumed by the file
   * count.
   */
  directFileIds: string[];
}

/**
 * Build a nested directory tree from a Graph.
 *
 * Every internal POSIX path segment becomes a tree node: a single id like
 * "apps/web/lib/store.ts" yields three directory nodes (`apps`, `apps/web`,
 * `apps/web/lib`). Files at the repo root (no slash) are attached to a
 * synthetic top-level "" node but the empty path is never returned at the
 * tree root.
 *
 * The result is fully deterministic; children sorted alphabetically.
 */
export function buildDirectoryTree(graph: Graph): DirectoryNode[] {
  const byPath = new Map<string, DirectoryNode>();
  const ROOT_KEY = "";
  byPath.set(ROOT_KEY, makeNode("", ""));

  for (const node of graph.nodes) {
    const segments = node.id.split("/");
    if (segments.length === 1) {
      // Repo-root file with no directory; attach to virtual root.
      byPath.get(ROOT_KEY)?.directFileIds.push(node.id);
      continue;
    }
    const dirSegments = segments.slice(0, -1);
    // Ensure every ancestor exists.
    for (let i = 1; i <= dirSegments.length; i++) {
      const path = dirSegments.slice(0, i).join("/");
      if (!byPath.has(path)) {
        const segment = dirSegments[i - 1] ?? "";
        byPath.set(path, makeNode(path, segment));
      }
    }
    const parentPath = dirSegments.join("/");
    byPath.get(parentPath)?.directFileIds.push(node.id);
  }

  // Link children to parents (top-level dirs become children of the virtual root).
  for (const [path, node] of byPath) {
    if (path === ROOT_KEY) continue;
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ROOT_KEY;
    byPath.get(parentPath)?.children.push(node);
  }

  // Sort + roll up file counts via a single post-order DFS.
  function dfs(n: DirectoryNode): number {
    n.children.sort((a, b) => (a.segment < b.segment ? -1 : a.segment > b.segment ? 1 : 0));
    n.directFileIds.sort();
    let total = n.directFileIds.length;
    for (const child of n.children) {
      total += dfs(child);
    }
    n.fileCount = total;
    return total;
  }
  const root = byPath.get(ROOT_KEY);
  if (!root) return [];
  dfs(root);

  return root.children;
}

/**
 * Predicate: does `nodeId` live under `dirPath` (or in `dirPath` itself)?
 *
 * Path matching is segment-aware; `apps/web/lib/foo.ts` matches `apps/web`
 * but does NOT match `apps/w` (no false positive on path-prefix substrings).
 */
export function isNodeUnderDirectory(nodeId: string, dirPath: string): boolean {
  if (dirPath === "") return true;
  return nodeId === dirPath || nodeId.startsWith(`${dirPath}/`);
}

function makeNode(path: string, segment: string): DirectoryNode {
  return { path, segment, children: [], fileCount: 0, directFileIds: [] };
}
