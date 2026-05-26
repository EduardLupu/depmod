import type { Graph } from "@depmod/types";
import { describe, expect, it } from "vitest";
import { buildSearchIndex, searchIndex } from "./node-search";

// Tested on a mock graph of https://github.com/EduardLupu/spotify-artists, can be changed/adjusted
function makeGraph(): Graph {
  return {
    schemaVersion: 1,
    generatedAt: "2025-01-01T00:00:00.000Z",
    rootDir: "/tmp/x",
    stats: { files: 3, nodes: 3, edges: 0, cycles: 0, parseMs: 1 },
    cycles: [],
    edges: [],
    nodes: [
      {
        id: "src/app/former/FormerArtistsClient.tsx",
        name: "FormerArtistsClient.tsx",
        classification: "component",
        loc: 100,
        metrics: { Ca: 0, Ce: 0, instability: 0 },
        exports: [
          { name: "FormerArtistsClient", type: "function" },
          { name: "compactNumber", type: "const" },
        ],
      },
      {
        id: "src/components/ui/badge.tsx",
        name: "badge.tsx",
        classification: "component",
        loc: 30,
        metrics: { Ca: 0, Ce: 0, instability: 0 },
        exports: [{ name: "Badge", type: "function" }],
      },
      {
        id: "src/lib/data.ts",
        name: "data.ts",
        classification: "lib",
        loc: 10,
        metrics: { Ca: 0, Ce: 0, instability: 0 },
        exports: [{ name: "FormerArtist", type: "interface" }],
      },
    ],
  };
}

describe("searchIndex", () => {
  it("returns empty list for empty query", () => {
    const idx = buildSearchIndex(makeGraph());
    expect(searchIndex(idx, "")).toEqual([]);
    expect(searchIndex(idx, "  ")).toEqual([]);
  });

  it("matches by basename and ranks basename above path", () => {
    const idx = buildSearchIndex(makeGraph());
    const results = searchIndex(idx, "badge");
    expect(results[0]?.entry.id).toBe("src/components/ui/badge.tsx");
    expect(results[0]?.hitField).toBe("basename");
  });

  it("matches by export name and surfaces the matching export", () => {
    const idx = buildSearchIndex(makeGraph());
    const results = searchIndex(idx, "FormerArtist");
    // FormerArtistsClient basename wins because basename weight (3) beats
    // export weight (1) even with similar match quality.
    expect(results[0]?.entry.id).toBe("src/app/former/FormerArtistsClient.tsx");
    // The lib data.ts should still appear via its export.
    const dataHit = results.find((r) => r.entry.id === "src/lib/data.ts");
    expect(dataHit?.hitField).toBe("export");
    expect(dataHit?.hitExport).toBe("FormerArtist");
  });

  it("falls back to path matches when basename doesn't hit", () => {
    const idx = buildSearchIndex(makeGraph());
    const results = searchIndex(idx, "components/ui");
    expect(results[0]?.entry.id).toBe("src/components/ui/badge.tsx");
    expect(results[0]?.hitField).toBe("path");
  });

  it("is case-insensitive", () => {
    const idx = buildSearchIndex(makeGraph());
    expect(searchIndex(idx, "BADGE")[0]?.entry.id).toBe("src/components/ui/badge.tsx");
  });

  it("deduplicates: one result per node even with multiple matching fields", () => {
    const idx = buildSearchIndex(makeGraph());
    const results = searchIndex(idx, "former");
    const ids = results.map((r) => r.entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
