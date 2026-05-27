"use client";

import { useEffect, useRef } from "react";
import { loadGraphFromText } from "./load-graph";
import { useGraphStore } from "./store";

/**
 * When `depmod-ui --watch` is running, the server pushes a `reanalyzed` SSE
 * event on every successful re-parse. We listen on `/api/events`, refetch
 * `/api/graph`, and swap it into the store; keeping the user's selection /
 * filters / view intact across reloads.
 *
 * Also polls `X-Depmod-Updated-At` as a fallback when the session file watcher
 * misses an in-place write (platform-dependent).
 */
export function useServerGraphReload() {
  const lastUpdatedAt = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reloadingTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let watchEnabled = false;
    let cancelled = false;

    async function refreshGraph(): Promise<void> {
      try {
        const res = await fetch("/api/graph");
        if (!res.ok) return;
        const updatedAt = res.headers.get("x-depmod-updated-at");
        if (updatedAt && updatedAt === lastUpdatedAt.current) return;
        if (updatedAt) lastUpdatedAt.current = updatedAt;

        const result = loadGraphFromText(await res.text());
        if (!result.ok) return;
        const sourceLabel = useGraphStore.getState().source ?? {
          kind: "file" as const,
          label: "server",
        };
        useGraphStore.getState().setGraph(result.graph, sourceLabel);
      } catch {
        // Network blip; the next reanalyzed event or poll will retry.
      }
    }

    function beginReload(): void {
      useGraphStore.getState().setWatchStatus("reloading");
      if (reloadingTimer) clearTimeout(reloadingTimer);
      void refreshGraph().finally(() => {
        reloadingTimer = setTimeout(() => {
          if (!cancelled) useGraphStore.getState().setWatchStatus("watching");
        }, 400);
      });
    }

    function startPolling(): void {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        if (!watchEnabled || cancelled) return;
        void (async () => {
          try {
            const res = await fetch("/api/graph", { method: "HEAD" });
            if (!res.ok) return;
            const updatedAt = res.headers.get("x-depmod-updated-at");
            if (!updatedAt || updatedAt === lastUpdatedAt.current) return;
            beginReload();
          } catch {
            // ignore
          }
        })();
      }, 2000);
    }

    function connect(): void {
      source = new EventSource("/api/events");
      source.addEventListener("open", () => {
        useGraphStore.getState().setWatchStatus("watching");
      });
      source.addEventListener("hello", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data as string) as { watch?: boolean };
          watchEnabled = data.watch === true;
          if (watchEnabled) startPolling();
        } catch {
          watchEnabled = false;
        }
      });
      source.addEventListener("reanalyzed", () => {
        beginReload();
      });
      source.onerror = () => {
        source?.close();
        source = null;
        useGraphStore.getState().setWatchStatus(null);
        watchEnabled = false;
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, 2000);
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (reloadingTimer) clearTimeout(reloadingTimer);
      if (pollTimer) clearInterval(pollTimer);
      source?.close();
      useGraphStore.getState().setWatchStatus(null);
    };
  }, []);
}
