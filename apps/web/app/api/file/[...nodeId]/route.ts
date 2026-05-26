import { readNodeSourceFile } from "@/lib/server-read-node-file";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ nodeId: string[] }> },
): Promise<Response> {
  const { nodeId } = await context.params;
  const result = readNodeSourceFile(nodeId ?? []);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: result.status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return new Response(
    JSON.stringify({
      nodeId: result.file.nodeId,
      path: result.file.path,
      language: result.file.language,
      content: result.file.content,
    }),
    {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    },
  );
}
