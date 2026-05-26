"use client";

import { useEffect } from "react";
import { loadGraphFromText } from "./load-graph";
import { useGraphStore } from "./store";

/**
 * When `depmod-ui --watch` is running, the server pushes a `reanalyzed` SSE
 * event on every successful re-parse. We listen on `/api/events`, refetch
 * `/api/graph`, and swap it into the store; keeping the user's selection /
 * filters / view intact across reloads.
 *
 * Auto-reconnects on EventSource error after a short backoff. No-op outside
 * a browser environment.
 */
export function useServerGraphReload() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reloadingTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect(): void {
      source = new EventSource("/api/events");
      source.addEventListener("open", () => {
        useGraphStore.getState().setWatchStatus("watching");
      });
      source.addEventListener("reanalyzed", () => {
        useGraphStore.getState().setWatchStatus("reloading");
        if (reloadingTimer) clearTimeout(reloadingTimer);
        void refreshGraph().finally(() => {
          // Settle back to "watching" shortly after the reload completes so the
          // amber pulse has time to register visually.
          reloadingTimer = setTimeout(() => {
            if (!cancelled) useGraphStore.getState().setWatchStatus("watching");
          }, 400);
        });
      });
      source.onerror = () => {
        source?.close();
        source = null;
        useGraphStore.getState().setWatchStatus(null);
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, 2000);
      };
    }

    async function refreshGraph(): Promise<void> {
      try {
        const res = await fetch("/api/graph");
        if (!res.ok) return;
        const result = loadGraphFromText(await res.text());
        if (!result.ok) return;
        // Preserve the existing source label so the header keeps reading "server"
        // instead of flashing back to a generic value.
        const source = useGraphStore.getState().source ?? {
          kind: "file" as const,
          label: "server",
        };
        useGraphStore.getState().setGraph(result.graph, source);
      } catch {
        // Network blip; the next reanalyzed event will retry.
      }
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (reloadingTimer) clearTimeout(reloadingTimer);
      source?.close();
      useGraphStore.getState().setWatchStatus(null);
    };
  }, []);
}
