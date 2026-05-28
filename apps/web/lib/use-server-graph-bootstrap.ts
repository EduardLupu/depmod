"use client";

import { type LoadResult, loadGraphFromText, loadGraphFromUrl } from "@/lib/load-graph";
import { type ParseProgressState, useParseProgress } from "@/lib/parse-progress";
import { isStaticDemo, staticDemoGraphUrl } from "@/lib/static-mode";
import { useGraphStore } from "@/lib/store";
import { useEffect, useState } from "react";

export interface ServerGraphBootstrapState {
  probing: boolean;
  showLoadingScreen: boolean;
  progress: ParseProgressState;
}

const SERVER_GRAPH_URL = "/api/graph";

async function probeServer(): Promise<boolean> {
  try {
    const head = await fetch(SERVER_GRAPH_URL, { method: "HEAD" });
    // 2xx → ready, 405 → endpoint exists but no HEAD, 404 → server known but
    // still parsing. All three indicate a depmod-ui session is running.
    return head.ok || head.status === 405 || head.status === 404;
  } catch {
    return false;
  }
}

async function fetchServerGraph(): Promise<LoadResult | null> {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    let res: Response;
    try {
      res = await fetch(SERVER_GRAPH_URL);
    } catch {
      return null;
    }
    if (res.ok) return loadGraphFromText(await res.text());
    if (res.status === 404) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    return null;
  }
  return null;
}

/**
 * On first paint, fetch the live `/api/graph` session that the depmod-ui CLI
 * publishes to this Next.js process via a session file.
 */
export function useServerGraphBootstrap(): ServerGraphBootstrapState {
  const graph = useGraphStore((s) => s.graph);
  const setGraph = useGraphStore((s) => s.setGraph);
  const [probing, setProbing] = useState(() => graph === null);
  const [serverSession, setServerSession] = useState(false);

  const progress = useParseProgress(serverSession && probing);

  useEffect(() => {
    if (graph !== null) {
      setProbing(false);
      return;
    }

    let cancelled = false;

    (async () => {
      if (isStaticDemo) {
        const result = await loadGraphFromUrl(staticDemoGraphUrl());
        if (cancelled) return;
        if (result?.ok) {
          setGraph(result.graph, { kind: "sample", label: "depmod" });
        }
        setProbing(false);
        return;
      }

      const hasServe = await probeServer();
      if (cancelled) return;

      if (hasServe) {
        setServerSession(true);
        const result = await fetchServerGraph();
        if (cancelled) return;

        if (result?.ok) {
          setGraph(result.graph, { kind: "file", label: "server" });
        }
      }

      setProbing(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [graph, setGraph]);

  return {
    probing,
    showLoadingScreen: probing && graph === null,
    progress,
  };
}
