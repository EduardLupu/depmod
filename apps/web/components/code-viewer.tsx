"use client";

import { fetchNodeSource } from "@/lib/fetch-node-source";
import { useGraphStore } from "@/lib/store";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
      Loading editor…
    </div>
  ),
});

interface CodeViewerProps {
  nodeId: string | null;
}

export function CodeViewer({ nodeId }: CodeViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [language, setLanguage] = useState("typescript");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!nodeId) {
      setContent(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchNodeSource(nodeId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setContent(null);
        setError(result.error);
        return;
      }
      setContent(result.file.content);
      setLanguage(result.file.language);
      setError(null);
    });

    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  const onClose = () => useGraphStore.getState().setCodeViewerOpen(false);

  return (
    <aside className="flex h-full w-[min(42rem,45vw)] min-w-[20rem] shrink-0 flex-col border-l border-neutral-900 bg-[#1e1f22]">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Source
          </span>
          {nodeId ? (
            <p className="truncate font-mono text-xs text-neutral-300" title={nodeId}>
              {nodeId}
            </p>
          ) : (
            <p className="text-xs text-neutral-500">Select a node</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          aria-label="Close code viewer"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            Loading…
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-amber-200/90">
            <p>{error}</p>
            <p className="mt-2 text-xs text-neutral-500">
              Source viewing requires <code className="text-neutral-400">depmod-ui</code> on the
              project root.
            </p>
          </div>
        ) : content === null ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-neutral-500">
            Click a node on the graph to view its source.
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            language={language}
            value={content}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: true },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: "off",
              padding: { top: 8 },
            }}
          />
        )}
      </div>
    </aside>
  );
}
