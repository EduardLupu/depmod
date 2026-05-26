"use client";

import { computeBlastRadius } from "@/lib/blast-radius";
import { computeFocusNeighborhood } from "@/lib/focus-mode";
import { parsePathMask } from "@/lib/path-mask";
import { useGraphStore } from "@/lib/store";
import { computeVisibleCounts } from "@/lib/visible-counts";
import type { Graph } from "@depmod/types";
import { useMemo } from "react";

interface StatusBarProps {
  graph: Graph;
  /** "watching" while a server is reloading the graph; null otherwise. */
  watchStatus?: "watching" | "reloading" | null;
}

function basename(id: string): string {
  const idx = id.lastIndexOf("/");
  return idx === -1 ? id : id.slice(idx + 1);
}

/**
 * Thin strip at the bottom of /graph showing project root, file/edge counts,
 * parse duration, and (when present) the watch indicator. Mirrors the kind of
 * status line VS Code and IntelliJ pin to the bottom of the editor; peripheral
 * information that's always available but never in the way.
 */
export function StatusBar({ graph, watchStatus = null }: StatusBarProps) {
  const source = useGraphStore((s) => s.source);
  const classificationModes = useGraphStore((s) => s.classificationModes);
  const pathMaskRaw = useGraphStore((s) => s.pathMask);
  const viewFilters = useGraphStore((s) => s.viewFilters);
  const blastRadiusFor = useGraphStore((s) => s.blastRadiusFor);
  const focusModeRoot = useGraphStore((s) => s.focusModeRoot);
  const focusModeDepth = useGraphStore((s) => s.focusModeDepth);
  const focusedCycle = useGraphStore((s) => s.focusedCycle);
  const { rootDir, stats } = graph;
  const sourceLabel = source
    ? `${source.kind === "sample" ? "sample" : "project"} · ${source.label}`
    : null;

  const pathMask = useMemo(() => parsePathMask(pathMaskRaw), [pathMaskRaw]);

  // Active hard-isolation overlay (matches the cytoscape canvas precedence:
  // cycle → focus → blast). When set, the status-bar counts reflect what
  // the canvas actually shows, and we surface a pill labelled with the
  // overlay name + root file so the user has a quick reminder of why the
  // counts dropped.
  const overlay = useMemo<{
    kind: "cycle" | "focus" | "blast";
    rootId: string | null;
    scope: ReadonlySet<string>;
    depth?: number;
  } | null>(() => {
    if (focusedCycle !== null) {
      const cycle = graph.cycles[focusedCycle];
      if (cycle) {
        return { kind: "cycle", rootId: null, scope: new Set(cycle.nodes) };
      }
    }
    if (focusModeRoot) {
      const fn = computeFocusNeighborhood(graph, focusModeRoot, focusModeDepth);
      return {
        kind: "focus",
        rootId: focusModeRoot,
        scope: new Set(fn.depthByNode.keys()),
        depth: focusModeDepth,
      };
    }
    if (blastRadiusFor) {
      const br = computeBlastRadius(graph, blastRadiusFor);
      return {
        kind: "blast",
        rootId: blastRadiusFor,
        scope: new Set(br.depthByNode.keys()),
      };
    }
    return null;
  }, [graph, blastRadiusFor, focusModeRoot, focusModeDepth, focusedCycle]);

  const counts = useMemo(
    () =>
      computeVisibleCounts({
        graph,
        classificationModes,
        pathMask,
        viewFilters,
        restrictTo: overlay?.scope ?? null,
      }),
    [graph, classificationModes, pathMask, viewFilters, overlay],
  );
  const filtered =
    counts.nodes !== counts.totalNodes ||
    counts.edges !== counts.totalEdges ||
    counts.cycles !== counts.totalCycles;

  return (
    <div className="sticky bottom-0 z-30 flex h-6 shrink-0 items-center justify-between gap-4 overflow-hidden border-t border-neutral-900 bg-neutral-950 px-3 text-[11px] text-neutral-500">
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate font-mono" title={rootDir}>
          {rootDir}
        </span>
        {sourceLabel ? <span className="truncate text-neutral-600">· {sourceLabel}</span> : null}
        {overlay ? <OverlayPill overlay={overlay} /> : null}
        {filtered ? (
          <span
            className="shrink-0 rounded bg-amber-950/30 px-1.5 py-0.5 text-[10px] text-amber-300"
            title="Counts reflect the active filters (classification pills, path mask, directory filters). Reset filters in the toolbar."
          >
            filtered view
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 tabular-nums">
        {watchStatus ? <WatchPill status={watchStatus} /> : null}
        <span title={filtered ? "Visible files / total" : "Source files"}>
          <span className="text-neutral-400">{counts.nodes.toLocaleString()}</span>
          {filtered ? (
            <>
              <span className="text-neutral-700"> / </span>
              <span className="text-neutral-600">{counts.totalNodes.toLocaleString()}</span>
            </>
          ) : null}{" "}
          files
        </span>
        <span title={filtered ? "Visible edges / total" : "Internal edges"}>
          <span className="text-neutral-400">{counts.edges.toLocaleString()}</span>
          {filtered ? (
            <>
              <span className="text-neutral-700"> / </span>
              <span className="text-neutral-600">{counts.totalEdges.toLocaleString()}</span>
            </>
          ) : null}{" "}
          edges
        </span>
        {counts.cycles > 0 || stats.cycles > 0 ? (
          <span
            title="Dependency cycles (visible / total)"
            className={counts.cycles > 0 ? "text-red-400" : "text-neutral-600"}
          >
            {counts.cycles}
            {filtered && counts.cycles !== stats.cycles ? (
              <>
                <span className="text-neutral-700"> / </span>
                <span>{stats.cycles}</span>
              </>
            ) : null}{" "}
            cycles
          </span>
        ) : null}
        <span title="Parser wall-clock time">
          <span className="text-neutral-400">{stats.parseMs}ms</span>
        </span>
      </div>
    </div>
  );
}

function OverlayPill({
  overlay,
}: {
  overlay: {
    kind: "cycle" | "focus" | "blast";
    rootId: string | null;
    scope: ReadonlySet<string>;
    depth?: number;
  };
}) {
  const styles =
    overlay.kind === "cycle"
      ? "bg-red-950/40 text-red-300"
      : overlay.kind === "blast"
        ? "bg-amber-950/40 text-amber-300"
        : "bg-amber-950/30 text-amber-200";
  const label =
    overlay.kind === "cycle"
      ? `cycle · ${overlay.scope.size} nodes`
      : overlay.kind === "focus"
        ? `focus · ${basename(overlay.rootId ?? "?")} · depth ${overlay.depth ?? "?"}`
        : `blast · ${basename(overlay.rootId ?? "?")}`;
  const title =
    overlay.kind === "cycle"
      ? "Isolating one dependency cycle — only the loop's nodes are visible. Click the cycle in the inspector again to release."
      : overlay.kind === "focus"
        ? "Focus mode — only the N-hop neighbourhood of the selected node is visible. Press F to release."
        : "Blast radius — only the modules that transitively depend on the selected node are visible. Press B to release.";
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${styles}`} title={title}>
      {label}
    </span>
  );
}

function WatchPill({ status }: { status: "watching" | "reloading" }) {
  const isReloading = status === "reloading";
  return (
    <span
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
        isReloading ? "bg-amber-950/40 text-amber-300" : "bg-emerald-950/30 text-emerald-300"
      }`}
      title={isReloading ? "Re-running the parser…" : "Watching for source-file changes"}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isReloading ? "animate-pulse bg-amber-400" : "bg-emerald-400"
        }`}
        aria-hidden
      />
      {status}
    </span>
  );
}
