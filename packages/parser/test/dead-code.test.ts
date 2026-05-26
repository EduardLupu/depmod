import type { Edge, Graph, Node as GraphNode } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { findDeadCode, findDeadCodeIds } from "../src/dead-code.js";

function node(over: Partial<GraphNode> & Pick<GraphNode, "id">): GraphNode {
  return {
    name: over.id.split("/").pop() ?? over.id,
    classification: "lib",
    loc: 10,
    exports: [{ name: "default", type: "function" }],
    metrics: { Ca: 0, Ce: 0, instability: 0 },
    ...over,
  };
}

function graph(nodes: GraphNode[], edges: Edge[] = []): Graph {
  return {
    schemaVersion: 1,
    generatedAt: "2025-01-01T00:00:00.000Z",
    rootDir: "/tmp/x",
    stats: { files: nodes.length, nodes: nodes.length, edges: edges.length, cycles: 0, parseMs: 1 },
    nodes,
    edges,
    cycles: [],
  };
}

describe("findDeadCode", () => {
  it("flags Ca=0 nodes with the `unreferenced` kind", () => {
    const g = graph([
      node({ id: "src/lib/orphan.ts" }),
      node({ id: "src/lib/used.ts", metrics: { Ca: 2, Ce: 0, instability: 0 } }),
    ]);
    expect(findDeadCode(g)).toEqual([{ id: "src/lib/orphan.ts", kinds: ["unreferenced"] }]);
  });

  it("flags `runtime-only-type` when every incoming edge is type-only", () => {
    const g = graph(
      [
        node({ id: "src/lib/types.ts", metrics: { Ca: 1, Ce: 0, instability: 0 } }),
        node({ id: "src/consumer.ts" }),
      ],
      [{ source: "src/consumer.ts", target: "src/lib/types.ts", kind: "type-only" }],
    );
    const out = findDeadCode(g);
    const typesEntry = out.find((d) => d.id === "src/lib/types.ts");
    expect(typesEntry?.kinds).toContain("runtime-only-type");
  });

  it("does NOT flag runtime-only-type when at least one edge is a real import", () => {
    const g = graph(
      [
        node({ id: "src/lib/types.ts", metrics: { Ca: 2, Ce: 0, instability: 0 } }),
        node({ id: "src/a.ts" }),
        node({ id: "src/b.ts" }),
      ],
      [
        { source: "src/a.ts", target: "src/lib/types.ts", kind: "type-only" },
        { source: "src/b.ts", target: "src/lib/types.ts", kind: "import" },
      ],
    );
    expect(findDeadCode(g).some((d) => d.id === "src/lib/types.ts")).toBe(false);
  });

  it("flags `no-exports` independently of Ca", () => {
    const g = graph([
      node({
        id: "src/lib/silent.ts",
        exports: [],
        metrics: { Ca: 2, Ce: 0, instability: 0 },
      }),
    ]);
    expect(findDeadCode(g)[0]?.kinds).toContain("no-exports");
  });

  it("flags `empty` when loc < minLoc", () => {
    const g = graph([
      node({ id: "src/lib/stub.ts", loc: 1, metrics: { Ca: 2, Ce: 0, instability: 0 } }),
    ]);
    expect(findDeadCode(g)[0]?.kinds).toContain("empty");
  });

  it("stacks kinds when a node trips multiple rules", () => {
    const g = graph([node({ id: "src/lib/dead.ts", loc: 0, exports: [] })]);
    expect(findDeadCode(g)[0]?.kinds).toEqual(["unreferenced", "no-exports", "empty"]);
  });

  it("never flags pages or apis", () => {
    const g = graph([
      node({ id: "src/app/page.tsx", classification: "page", exports: [] }),
      node({ id: "src/app/api/users/route.ts", classification: "api", exports: [] }),
    ]);
    expect(findDeadCode(g)).toEqual([]);
  });

  it("never flags config-classified nodes", () => {
    const g = graph([node({ id: "src/x.config.ts", classification: "config", exports: [] })]);
    expect(findDeadCode(g)).toEqual([]);
  });

  it("never flags test-classified nodes (the test runner imports them, not other modules)", () => {
    const g = graph([
      node({ id: "src/lib/foo.test.ts", classification: "test", exports: [] }),
      node({ id: "src/__tests__/bar.spec.ts", classification: "test", exports: [] }),
    ]);
    expect(findDeadCode(g)).toEqual([]);
  });

  it("never flags convention files (next.config, tailwind, .d.ts, layout.tsx, etc.)", () => {
    const g = graph([
      node({ id: "next.config.js" }),
      node({ id: "tailwind.config.ts" }),
      node({ id: "middleware.ts" }),
      node({ id: "src/types.d.ts" }),
      node({ id: "src/app/layout.tsx" }),
      node({ id: "src/app/loading.tsx" }),
      node({ id: "src/app/not-found.tsx" }),
    ]);
    expect(findDeadCode(g)).toEqual([]);
  });

  it("respects extraAllowlist", () => {
    const g = graph([node({ id: "src/lib/keep-me.ts" }), node({ id: "src/lib/dead.ts" })]);
    expect(findDeadCode(g, { extraAllowlist: ["keep-me"] }).map((d) => d.id)).toEqual([
      "src/lib/dead.ts",
    ]);
  });

  it("findDeadCodeIds returns just the ids (legacy adapter)", () => {
    const g = graph([
      node({ id: "src/lib/orphan.ts" }),
      node({ id: "src/lib/used.ts", metrics: { Ca: 2, Ce: 0, instability: 0 } }),
    ]);
    expect(findDeadCodeIds(g)).toEqual(["src/lib/orphan.ts"]);
  });
});
