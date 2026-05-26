import { type Graph, safeParseGraph } from "@depmod/types";

export type LoadResult = { ok: true; graph: Graph } | { ok: false; error: string };

/** Parse + Zod-validate a graph.json payload. Never throws. */
export function loadGraphFromText(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
  const result = safeParseGraph(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    const more = result.error.issues.length > 5 ? ` (+${result.error.issues.length - 5} more)` : "";
    return { ok: false, error: `Schema validation failed; ${issues}${more}` };
  }
  return { ok: true, graph: result.data };
}

export async function loadGraphFromFile(file: File): Promise<LoadResult> {
  try {
    return loadGraphFromText(await file.text());
  } catch (e) {
    return { ok: false, error: `Could not read file: ${(e as Error).message}` };
  }
}

export async function loadGraphFromUrl(url: string): Promise<LoadResult> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    return { ok: false, error: `Network error: ${(e as Error).message}` };
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status} fetching ${url}` };
  return loadGraphFromText(await res.text());
}
