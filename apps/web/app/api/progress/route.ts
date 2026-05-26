import { readParseProgress } from "@/lib/server-graph-progress";

export const dynamic = "force-dynamic";

export async function GET() {
  const progress = readParseProgress();
  if (!progress) {
    return new Response(JSON.stringify({ phase: "ready", message: "No server session" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(progress), {
    headers: { "Content-Type": "application/json" },
  });
}
