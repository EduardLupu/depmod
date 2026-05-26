import { readParseProgress, watchParseProgress } from "@/lib/server-graph-progress";
import { watchGraphSession } from "@/lib/server-graph-session";

export const dynamic = "force-dynamic";

/**
 * SSE stream for graph updates during `depmod-ui --watch`. The CLI rewrites
 * the session file; fs.watch surfaces a `reanalyzed` event to connected clients.
 * Parse progress is streamed via `progress` events while analysis runs (Track C).
 */
export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();
  let closed = false;
  let unwatchGraph = () => {};
  let unwatchProgress = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown = {}) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const pushProgress = () => {
        const progress = readParseProgress();
        if (progress) send("progress", progress);
      };

      send("hello");
      pushProgress();
      unwatchGraph = watchGraphSession(() => {
        send("reanalyzed", {});
        pushProgress();
      });
      unwatchProgress = watchParseProgress(() => pushProgress()) ?? (() => {});
    },
    cancel() {
      closed = true;
      unwatchGraph();
      unwatchProgress();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
