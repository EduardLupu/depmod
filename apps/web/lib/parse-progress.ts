"use client";

import { useEffect, useState } from "react";

export type ParsePhase = "starting" | "discovering" | "parsing" | "metrics" | "ready" | "error";

export interface ParseProgressState {
  phase: ParsePhase;
  message: string;
  percent?: number;
  filesFound?: number;
  nodes?: number;
  edges?: number;
  error?: string;
}

const DEFAULT: ParseProgressState = {
  phase: "starting",
  message: "Loading…",
  percent: 0,
};

function parsePayload(data: unknown): ParseProgressState | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (typeof o.phase !== "string" || typeof o.message !== "string") return null;
  return {
    phase: o.phase as ParsePhase,
    message: o.message,
    percent: typeof o.percent === "number" ? o.percent : undefined,
    filesFound: typeof o.filesFound === "number" ? o.filesFound : undefined,
    nodes: typeof o.nodes === "number" ? o.nodes : undefined,
    edges: typeof o.edges === "number" ? o.edges : undefined,
    error: typeof o.error === "string" ? o.error : undefined,
  };
}

/** Subscribe to CLI parse progress via SSE (server session) or poll /api/progress. */
export function useParseProgress(enabled: boolean): ParseProgressState {
  const [state, setState] = useState<ParseProgressState>(DEFAULT);

  useEffect(() => {
    if (!enabled) return;

    let closed = false;
    const es = new EventSource("/api/events");

    const onProgress = (ev: MessageEvent) => {
      try {
        const next = parsePayload(JSON.parse(ev.data as string));
        if (next) setState(next);
      } catch {
        // ignore malformed
      }
    };

    es.addEventListener("progress", onProgress as EventListener);

    const poll = async () => {
      try {
        const res = await fetch("/api/progress");
        if (!res.ok) return;
        const next = parsePayload(await res.json());
        if (next) setState(next);
      } catch {
        // offline / static mode
      }
    };

    void poll();
    const interval = setInterval(() => {
      if (!closed) void poll();
    }, 2000);

    return () => {
      closed = true;
      es.removeEventListener("progress", onProgress as EventListener);
      es.close();
      clearInterval(interval);
    };
  }, [enabled]);

  return state;
}
