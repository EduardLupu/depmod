import { getTargetRoot } from "@/lib/server-graph-target";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const rootDir = getTargetRoot();
  if (!rootDir) {
    return new Response(JSON.stringify({ error: "No serve target" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return new Response(JSON.stringify({ rootDir }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
