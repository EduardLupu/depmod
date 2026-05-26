import type { Graph, Node as GraphNode } from "@depmod/types";

/**
 * Per-node search entry. We build one index entry per node and search across
 * three fields: basename (the filename), full path (the node id), and every
 * export name. Each field carries a weight so the score reflects "how good
 * is this match" rather than just "did anything match".
 */
export interface SearchEntry {
  readonly id: string;
  readonly basename: string;
  readonly path: string;
  /** Lower-cased basename. Cached so we don't re-lowercase on every keystroke. */
  readonly basenameLc: string;
  /** Lower-cased path. */
  readonly pathLc: string;
  /** Lower-cased export names (each entry searched independently). */
  readonly exportsLc: readonly string[];
  /** Original export names, kept for display. */
  readonly exports: readonly string[];
  readonly classification: GraphNode["classification"];
}

export interface SearchResult {
  readonly entry: SearchEntry;
  readonly score: number;
  /** Which field produced the match, used to surface a chip in the UI. */
  readonly hitField: "basename" | "path" | "export";
  /** When `hitField === "export"`, the matching export name (in original case). */
  readonly hitExport?: string;
}

const MAX_RESULTS = 12;

const WEIGHT_BASENAME = 3;
const WEIGHT_PATH = 2;
const WEIGHT_EXPORT = 1;

/** Build the search index for a graph. Cheap; runs once per graph load. */
export function buildSearchIndex(graph: Graph): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const node of graph.nodes) {
    const path = node.id;
    const slash = path.lastIndexOf("/");
    const basename = slash === -1 ? path : path.slice(slash + 1);
    out.push({
      id: node.id,
      basename,
      path,
      basenameLc: basename.toLowerCase(),
      pathLc: path.toLowerCase(),
      exports: node.exports.map((e) => e.name),
      exportsLc: node.exports.map((e) => e.name.toLowerCase()),
      classification: node.classification,
    });
  }
  return out;
}

/**
 * Score a single string against a lowercased query. Returns `0` for no match.
 * The scoring rewards (in this order):
 *   - exact equality
 *   - prefix match
 *   - earlier match positions (so "Form" ranks higher in "Former" than "Information")
 */
function scoreField(haystackLc: string, queryLc: string): number {
  if (haystackLc.length === 0 || queryLc.length === 0) return 0;
  if (haystackLc === queryLc) return 1.0;
  const idx = haystackLc.indexOf(queryLc);
  if (idx === -1) return 0;
  // Prefix match gets a flat 0.8; otherwise decay slightly based on where the
  // match starts. Adding the length ratio keeps shorter haystacks ahead of
  // longer ones for the same match position.
  const lengthRatio = queryLc.length / haystackLc.length;
  if (idx === 0) return 0.8 + 0.1 * lengthRatio;
  return 0.5 + 0.2 * lengthRatio - Math.min(0.3, idx * 0.02);
}

/**
 * Search the index for `query` (case-insensitive substring) and return up to
 * `MAX_RESULTS` ranked results. Each node contributes at most one result;
 * we pick the best-scoring field per node so the dropdown isn't dominated by
 * one file with many exports.
 */
export function searchIndex(index: readonly SearchEntry[], query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const results: SearchResult[] = [];
  for (const entry of index) {
    let best: SearchResult | null = null;

    const baseScore = scoreField(entry.basenameLc, q);
    if (baseScore > 0) {
      best = { entry, score: baseScore * WEIGHT_BASENAME, hitField: "basename" };
    }

    const pathScore = scoreField(entry.pathLc, q);
    if (pathScore > 0) {
      const candidate = pathScore * WEIGHT_PATH;
      if (!best || candidate > best.score) {
        best = { entry, score: candidate, hitField: "path" };
      }
    }

    for (let i = 0; i < entry.exportsLc.length; i++) {
      const exportLc = entry.exportsLc[i];
      const exportName = entry.exports[i];
      if (exportLc === undefined || exportName === undefined) continue;
      const expScore = scoreField(exportLc, q);
      if (expScore === 0) continue;
      const candidate = expScore * WEIGHT_EXPORT;
      if (!best || candidate > best.score) {
        best = {
          entry,
          score: candidate,
          hitField: "export",
          hitExport: exportName,
        };
      }
    }

    if (best) results.push(best);
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.path.localeCompare(b.entry.path);
  });
  return results.slice(0, MAX_RESULTS);
}
