import { readParseProgress } from "@/lib/server-graph-progress";
import { readGraphSessionJson } from "@/lib/server-graph-session";

/**
 * Canonical graph endpoint for `depmod-ui`. The CLI writes the
 * analysed graph to `DEPMOD_SESSION_PATH`; this route serves it without
 * touching disk in the target repo.
 */
export async function GET(): Promise<Response> {
  const raw = readGraphSessionJson();
  if (!raw) {
    const progress = readParseProgress();
    return new Response(
      JSON.stringify({
        error: "Graph not ready",
        progress: progress ?? { phase: "starting", message: "Waiting for analysis…" },
      }),
      {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      },
    );
  }
  const body = extractGraphJson(raw);
  if (!body) {
    return new Response(JSON.stringify({ error: "Invalid graph session" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function HEAD(): Promise<Response> {
  const raw = readGraphSessionJson();
  const ok = raw !== null && extractGraphJson(raw) !== null;
  return new Response(null, {
    status: ok ? 200 : 404,
    headers: { "cache-control": "no-store" },
  });
}

function extractGraphJson(sessionText: string): string | null {
  try {
    const parsed = JSON.parse(sessionText) as { graph?: unknown };
    if (parsed && typeof parsed === "object" && "graph" in parsed && parsed.graph) {
      return JSON.stringify(parsed.graph);
    }
    return sessionText;
  } catch {
    return null;
  }
}
