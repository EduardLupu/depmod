import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Edge, Graph, Node as GraphNode } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { computeBlastRadius } from "./blast-radius";

const here = dirname(fileURLToPath(import.meta.url));
const sampleAppGraph: Graph = JSON.parse(
  readFileSync(join(here, "..", "public", "samples", "sample-app.json"), "utf-8"),
);

const node = (id: string): GraphNode => ({
  id,
  name: id,
  classification: "lib",
  loc: 1,
  exports: [],
  metrics: { Ca: 0, Ce: 0, instability: 0 },
});

const edge = (source: string, target: string, kind: Edge["kind"] = "import"): Edge => ({
  source,
  target,
  kind,
});

function makeGraph(nodes: GraphNode[], edges: Edge[]): Graph {
  return {
    schemaVersion: 1,
    generatedAt: "2026-05-17T00:00:00.000Z",
    rootDir: "/tmp/x",
    stats: { files: nodes.length, nodes: nodes.length, edges: edges.length, cycles: 0, parseMs: 0 },
    nodes,
    edges,
    cycles: [],
  };
}

describe("computeBlastRadius", () => {
  it("returns empty for a missing rootId without throwing", () => {
    const g = makeGraph([node("a")], []);
    const r = computeBlastRadius(g, "ghost");
    expect(r.size).toBe(0);
    expect(r.depthByNode.size).toBe(0);
    expect(r.maxDepth).toBe(0);
  });

  it("includes the root at depth 0 even when isolated", () => {
    const g = makeGraph([node("solo")], []);
    const r = computeBlastRadius(g, "solo");
    expect(r.depthByNode.get("solo")).toBe(0);
    expect(r.size).toBe(1);
    expect(r.maxDepth).toBe(0);
  });

  it("walks the reverse adjacency (upstream only)", () => {
    //  src → mid → tgt
    const g = makeGraph(["src", "mid", "tgt"].map(node), [edge("src", "mid"), edge("mid", "tgt")]);
    const r = computeBlastRadius(g, "tgt");
    expect(Array.from(r.depthByNode.entries()).sort()).toEqual(
      [
        ["mid", 1],
        ["src", 2],
        ["tgt", 0],
      ].sort(),
    );
    expect(r.size).toBe(3);
    expect(r.maxDepth).toBe(2);

    // From src; nothing depends on src
    const rSrc = computeBlastRadius(g, "src");
    expect(rSrc.size).toBe(1);
    expect(rSrc.depthByNode.get("src")).toBe(0);
  });

  it("collapses multi-edge variants between the same pair into one hop", () => {
    const g = makeGraph(
      [node("a"), node("b")],
      [edge("a", "b", "import"), edge("a", "b", "type-only")],
    );
    const r = computeBlastRadius(g, "b");
    expect(r.depthByNode.get("a")).toBe(1);
    expect(r.size).toBe(2);
  });

  it("BFS reports shortest distance on diamonds", () => {
    //  root <- A <- C (depth 1, 2)
    //       <- B <- C
    //  (two paths to C from root, both length 2)
    const g = makeGraph(["root", "A", "B", "C"].map(node), [
      edge("A", "root"),
      edge("B", "root"),
      edge("C", "A"),
      edge("C", "B"),
    ]);
    const r = computeBlastRadius(g, "root");
    expect(r.depthByNode.get("A")).toBe(1);
    expect(r.depthByNode.get("B")).toBe(1);
    expect(r.depthByNode.get("C")).toBe(2);
  });

  it("respects maxDepth and stops BFS at the cap", () => {
    //  a → b → c → d → e   (importing rightward; reverse-BFS from e)
    const g = makeGraph(["a", "b", "c", "d", "e"].map(node), [
      edge("a", "b"),
      edge("b", "c"),
      edge("c", "d"),
      edge("d", "e"),
    ]);
    const r = computeBlastRadius(g, "e", 2);
    expect([...r.depthByNode.keys()].sort()).toEqual(["c", "d", "e"]);
    expect(r.maxDepth).toBe(2);
  });

  it("does not include the same node twice (cycle safety)", () => {
    // a <-> b cycle, plus c → a
    const g = makeGraph(["a", "b", "c"].map(node), [
      edge("a", "b"),
      edge("b", "a"),
      edge("c", "a"),
    ]);
    const r = computeBlastRadius(g, "a");
    expect(r.depthByNode.get("a")).toBe(0);
    expect(r.depthByNode.get("b")).toBe(1);
    expect(r.depthByNode.get("c")).toBe(1);
    expect(r.size).toBe(3);
  });

  it("lights up at least 5 upstream nodes on a heavily-used hook (proposal benchmark)", () => {
    // Construct a hub-and-spoke: useUser is imported by page + 5 components
    const nodes = [
      "hooks/useUser.ts",
      "app/page.tsx",
      "components/A.tsx",
      "components/B.tsx",
      "components/C.tsx",
      "components/D.tsx",
      "components/E.tsx",
    ].map(node);
    const edges = [
      edge("app/page.tsx", "hooks/useUser.ts"),
      edge("components/A.tsx", "hooks/useUser.ts"),
      edge("components/B.tsx", "hooks/useUser.ts"),
      edge("components/C.tsx", "hooks/useUser.ts"),
      edge("components/D.tsx", "hooks/useUser.ts"),
      edge("components/E.tsx", "hooks/useUser.ts"),
    ];
    const r = computeBlastRadius(makeGraph(nodes, edges), "hooks/useUser.ts");
    // Six dependents + the hook itself = seven impacted nodes.
    expect(r.size).toBeGreaterThanOrEqual(6);
    expect([...r.depthByNode.keys()]).toEqual(
      expect.arrayContaining([
        "hooks/useUser.ts",
        "app/page.tsx",
        "components/A.tsx",
        "components/B.tsx",
        "components/C.tsx",
        "components/D.tsx",
        "components/E.tsx",
      ]),
    );
  });

  it("matches the bundled sample-app for lib/utils.ts (5 transitive dependents)", () => {
    // Per Phase D's expected metrics, lib/utils.ts has Ca=5 in the bundled
    // sample-app: Footer, Header, LazyModal, useUser, api. With transitive
    // upstream paths through useUser → page and api → useUser/route, the
    // blast radius is larger than the direct Ca count.
    const r = computeBlastRadius(sampleAppGraph, "lib/utils.ts");
    expect(r.depthByNode.get("lib/utils.ts")).toBe(0);
    // The direct dependents (depth 1) should include all five Ca contributors.
    const depth1 = [...r.depthByNode.entries()]
      .filter(([, d]) => d === 1)
      .map(([id]) => id)
      .sort();
    expect(depth1).toEqual([
      "components/Footer.tsx",
      "components/Header.tsx",
      "components/LazyModal.tsx",
      "hooks/useUser.ts",
      "lib/api.ts",
    ]);
    // And the full blast radius reaches the page (via useUser, via api).
    expect(r.depthByNode.has("app/page.tsx")).toBe(true);
  });
});
