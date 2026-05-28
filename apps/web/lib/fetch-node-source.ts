"use client";

import { isStaticDemo, staticDemoSourceUrl } from "@/lib/static-mode";

export interface NodeSourceFile {
  nodeId: string;
  path: string;
  language: string;
  content: string;
}

export type FetchNodeSourceResult =
  | { ok: true; file: NodeSourceFile }
  | { ok: false; error: string; status: number };

export function nodeFileApiUrl(nodeId: string): string {
  if (isStaticDemo) return staticDemoSourceUrl(nodeId);
  const segments = nodeId.replace(/\\/g, "/").split("/").filter(Boolean);
  return `/api/file/${segments.map((s) => encodeURIComponent(s)).join("/")}`;
}

export async function fetchNodeSource(nodeId: string): Promise<FetchNodeSourceResult> {
  let res: Response;
  try {
    res = await fetch(nodeFileApiUrl(nodeId));
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
  if (!res.ok) {
    let error = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) error = body.error;
    } catch {
      // ignore
    }
    return { ok: false, status: res.status, error };
  }
  const file = (await res.json()) as NodeSourceFile;
  return { ok: true, file };
}
