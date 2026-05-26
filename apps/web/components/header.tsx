"use client";

import { LegendButton } from "@/components/legend-button";
import { SettingsMenu } from "@/components/settings-menu";
import { useGraphStore } from "@/lib/store";
import { useEffect } from "react";

const APP_NAME = "depmod";

function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Top bar: app name + the loaded project's directory name. The dashboard
 * always opens at `/` (no landing page, no `/graph` sub-route) so there's no
 * back navigation to render.
 */
export function Header() {
  const source = useGraphStore((s) => s.source);
  const graph = useGraphStore((s) => s.graph);

  const rootDir = graph?.rootDir;
  const rootLabel = rootDir ? basename(rootDir) : null;

  const projectName = rootLabel ?? (source?.kind === "sample" ? source.label : null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = projectName ? `${APP_NAME} · ${projectName}` : APP_NAME;
  }, [projectName]);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-900 bg-neutral-950 px-4">
      <div className="flex min-w-0 items-center gap-4">
        <span className="shrink-0 font-semibold text-neutral-100">depmod</span>
        {rootLabel && rootDir ? (
          <span className="truncate text-sm text-neutral-500" title={rootDir}>
            <span className="mx-2 text-neutral-700">/</span>
            <span className="font-medium text-neutral-300">{rootLabel}</span>
          </span>
        ) : null}
        {source ? (
          <span className="truncate text-sm text-neutral-500">
            {rootLabel ? <span className="mx-1 text-neutral-700">·</span> : null}
            {!rootLabel ? <span className="mx-2 text-neutral-700">/</span> : null}
            <span className="text-neutral-400">
              {source.kind === "sample" ? "sample · " : ""}
              {source.label}
            </span>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <SettingsMenu />
        <LegendButton />
      </div>
    </header>
  );
}
