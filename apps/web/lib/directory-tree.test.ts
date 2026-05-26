import type { Graph, Node as GraphNode } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { buildDirectoryTree, isNodeUnderDirectory } from "./directory-tree";

const node = (id: string): GraphNode => ({
  id,
  name: id.split("/").pop() ?? id,
  classification: "lib",
  loc: 1,
  exports: [],
  metrics: { Ca: 0, Ce: 0, instability: 0 },
});

function graphOf(ids: string[]): Graph {
  const nodes = ids.map(node);
  return {
    schemaVersion: 1,
    generatedAt: "2026-05-17T00:00:00.000Z",
    rootDir: "/tmp",
    stats: { files: nodes.length, nodes: nodes.length, edges: 0, cycles: 0, parseMs: 0 },
    nodes,
    edges: [],
    cycles: [],
  };
}

describe("buildDirectoryTree", () => {
  it("returns an empty list for an empty graph", () => {
    expect(buildDirectoryTree(graphOf([]))).toEqual([]);
  });

  it("creates intermediate directory nodes for every ancestor", () => {
    const tree = buildDirectoryTree(graphOf(["a/b/c/file.ts"]));
    expect(tree).toHaveLength(1);
    const a = tree[0];
    expect(a).toBeDefined();
    expect(a?.path).toBe("a");
    expect(a?.children).toHaveLength(1);
    const ab = a?.children[0];
    expect(ab).toBeDefined();
    expect(ab?.path).toBe("a/b");
    const abc = ab?.children[0];
    expect(abc).toBeDefined();
    expect(abc?.path).toBe("a/b/c");
    expect(abc?.directFileIds).toEqual(["a/b/c/file.ts"]);
  });

  it("rolls up fileCount recursively", () => {
    const tree = buildDirectoryTree(
      graphOf(["a/x.ts", "a/y.ts", "a/b/z.ts", "a/b/c/w.ts", "other/file.ts"]),
    );
    expect(tree).toHaveLength(2);
    const a = tree.find((d) => d.path === "a");
    expect(a).toBeDefined();
    expect(a?.fileCount).toBe(4);
    const ab = a?.children.find((c) => c.path === "a/b");
    expect(ab).toBeDefined();
    expect(ab?.fileCount).toBe(2);
    expect(tree.find((d) => d.path === "other")?.fileCount).toBe(1);
  });

  it("sorts children alphabetically at every level", () => {
    const tree = buildDirectoryTree(graphOf(["zzz/a.ts", "abc/b.ts", "mid/c.ts"]));
    expect(tree.map((d) => d.path)).toEqual(["abc", "mid", "zzz"]);
  });

  it("handles repo-root files without crashing", () => {
    const tree = buildDirectoryTree(graphOf(["README.ts", "a/x.ts"]));
    // Repo-root file is attached to the virtual root and doesn't appear as a
    // directory entry; only the real "a" directory shows up at top level.
    expect(tree.map((d) => d.path)).toEqual(["a"]);
  });

  it("matches the fixture sample-app shape", () => {
    const tree = buildDirectoryTree(
      graphOf([
        "actions/saveProfile.server.ts",
        "app/api/users/route.ts",
        "app/layout.tsx",
        "app/page.tsx",
        "components/Footer.tsx",
        "components/Header.tsx",
        "components/LazyModal.tsx",
        "hooks/useUser.ts",
        "lib/api.ts",
        "lib/utils.ts",
      ]),
    );
    expect(tree.map((d) => d.path)).toEqual(["actions", "app", "components", "hooks", "lib"]);
    const app = tree.find((d) => d.path === "app");
    expect(app).toBeDefined();
    expect(app?.fileCount).toBe(3);
    expect(app?.children.map((c) => c.path)).toEqual(["app/api"]);
    expect(app?.children[0]?.children.map((c) => c.path)).toEqual(["app/api/users"]);
  });
});

describe("isNodeUnderDirectory", () => {
  it("treats the empty path as a universal match", () => {
    expect(isNodeUnderDirectory("anything.ts", "")).toBe(true);
  });

  it("matches descendants but not path-prefix substrings", () => {
    expect(isNodeUnderDirectory("apps/web/lib/foo.ts", "apps/web")).toBe(true);
    expect(isNodeUnderDirectory("apps/web/lib/foo.ts", "apps/w")).toBe(false);
  });

  it("matches the directory itself when given an exact id", () => {
    expect(isNodeUnderDirectory("apps", "apps")).toBe(true);
  });

  it("does not match siblings", () => {
    expect(isNodeUnderDirectory("packages/parser/x.ts", "apps")).toBe(false);
  });
});
