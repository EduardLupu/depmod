import type { Graph } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { directoryParent, toCytoscapeElements } from "./cytoscape-elements";

const baseGraph: Graph = {
  schemaVersion: 1,
  generatedAt: "2026-05-17T00:00:00.000Z",
  rootDir: "/tmp/x",
  stats: { files: 4, nodes: 4, edges: 3, cycles: 1, parseMs: 1 },
  nodes: [
    {
      id: "a.ts",
      name: "a.ts",
      classification: "lib",
      loc: 1,
      exports: [],
      metrics: { Ca: 1, Ce: 1, instability: 0.5 },
    },
    {
      id: "b.ts",
      name: "b.ts",
      classification: "lib",
      loc: 1,
      exports: [],
      metrics: { Ca: 1, Ce: 1, instability: 0.5 },
    },
    {
      id: "app/api/users/route.ts",
      name: "route.ts",
      classification: "api",
      loc: 5,
      exports: [],
      metrics: { Ca: 0, Ce: 1, instability: 1 },
    },
    {
      id: "components/Header.tsx",
      name: "Header.tsx",
      classification: "component",
      loc: 10,
      exports: [],
      metrics: { Ca: 1, Ce: 1, instability: 0.5 },
    },
  ],
  edges: [
    { source: "a.ts", target: "b.ts", kind: "import" },
    { source: "b.ts", target: "a.ts", kind: "import" },
    { source: "app/api/users/route.ts", target: "components/Header.tsx", kind: "import" },
  ],
  cycles: [{ nodes: ["a.ts", "b.ts"] }],
};

describe("directoryParent", () => {
  it("returns undefined for files at the repo root", () => {
    expect(directoryParent("README.md")).toBeUndefined();
    expect(directoryParent("page.tsx")).toBeUndefined();
  });

  it("returns the single dir segment when the file is one level deep", () => {
    expect(directoryParent("lib/utils.ts")).toBe("lib");
    expect(directoryParent("app/page.tsx")).toBe("app");
  });

  it("returns the top-two dir segments for deeper files", () => {
    expect(directoryParent("app/api/users/route.ts")).toBe("app/api");
    expect(directoryParent("packages/parser/src/lib/x.ts")).toBe("packages/parser");
  });
});

describe("toCytoscapeElements", () => {
  it("emits a Cytoscape node for every Graph node", () => {
    const elements = toCytoscapeElements(baseGraph);
    const moduleNodes = elements.filter(
      (e) => e.group === "nodes" && !("isCompound" in (e.data as object)),
    );
    expect(moduleNodes.map((n) => n.data.id).sort()).toEqual([
      "a.ts",
      "app/api/users/route.ts",
      "b.ts",
      "components/Header.tsx",
    ]);
  });

  it("emits compound directory parents and links module nodes to them", () => {
    const elements = toCytoscapeElements(baseGraph);

    const compoundIds = elements
      .filter((e) => e.group === "nodes" && (e.data as { isCompound?: boolean }).isCompound)
      .map((e) => e.data.id);
    expect(compoundIds.sort()).toEqual(["app/api", "components"]);

    const route = elements.find((e) => e.data.id === "app/api/users/route.ts");
    expect((route?.data as { parent?: string }).parent).toBe("app/api");

    const header = elements.find((e) => e.data.id === "components/Header.tsx");
    expect((header?.data as { parent?: string }).parent).toBe("components");

    // Root-level files have no parent
    const a = elements.find((e) => e.data.id === "a.ts");
    expect((a?.data as { parent?: string }).parent).toBeUndefined();
  });

  it("tags edges whose endpoints share an SCC as inCycle=true", () => {
    const elements = toCytoscapeElements(baseGraph);
    const edgeAB = elements.find((e) => e.data.id === "a.ts|b.ts|import");
    const edgeBA = elements.find((e) => e.data.id === "b.ts|a.ts|import");
    const edgeOuter = elements.find(
      (e) => e.data.id === "app/api/users/route.ts|components/Header.tsx|import",
    );
    expect((edgeAB?.data as { inCycle: boolean }).inCycle).toBe(true);
    expect((edgeBA?.data as { inCycle: boolean }).inCycle).toBe(true);
    expect((edgeOuter?.data as { inCycle: boolean }).inCycle).toBe(false);
  });

  it("forwards classification, loc, and metric values onto node data", () => {
    const elements = toCytoscapeElements(baseGraph);
    const header = elements.find((e) => e.data.id === "components/Header.tsx");
    expect(header?.data).toMatchObject({
      classification: "component",
      loc: 10,
      Ca: 1,
      Ce: 1,
      instability: 0.5,
    });
  });
});
