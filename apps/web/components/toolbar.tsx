"use client";

import { ClassificationSwatch } from "@/components/classification-swatch";
import { ExportMenu } from "@/components/export-menu";
import { InfoTooltip } from "@/components/info-tooltip";
import { NodeSearch } from "@/components/node-search";
import {
  type ClassificationFilterMode,
  classificationModeLabel,
} from "@/lib/classification-filters";
import { CLASSIFICATION_ORDER } from "@/lib/classification-style";
import { CLASSIFICATION_COLORS } from "@/lib/colors";
import { CLASSIFICATION_ENTRIES } from "@/lib/glossary";
import { PATH_MASK_PRESETS } from "@/lib/path-mask";
import { useGraphStore } from "@/lib/store";
import { useEffect, useState } from "react";

function modeOpacity(mode: ClassificationFilterMode): number {
  if (mode === "neutral") return 1;
  if (mode === "dimmed") return 0.45;
  if (mode === "excluded") return 0.35;
  return 1;
}

export function Toolbar() {
  const graph = useGraphStore((s) => s.graph);
  const classificationModes = useGraphStore((s) => s.classificationModes);
  const cycleClassification = useGraphStore((s) => s.cycleClassification);
  const pathMask = useGraphStore((s) => s.pathMask);
  const setPathMask = useGraphStore((s) => s.setPathMask);
  const resetView = useGraphStore((s) => s.resetView);
  const requestLayout = useGraphStore((s) => s.requestLayout);
  const runtimeOnlyMetrics = useGraphStore((s) => s.runtimeOnlyMetrics);
  const setRuntimeOnlyMetrics = useGraphStore((s) => s.setRuntimeOnlyMetrics);
  const directoryTreeOpen = useGraphStore((s) => s.directoryTreeOpen);
  const setDirectoryTreeOpen = useGraphStore((s) => s.setDirectoryTreeOpen);
  const collapseDirectories = useGraphStore((s) => s.collapseDirectories);
  const setCollapseDirectories = useGraphStore((s) => s.setCollapseDirectories);
  const viewMode = useGraphStore((s) => s.viewMode);
  const setViewMode = useGraphStore((s) => s.setViewMode);

  const [draftMask, setDraftMask] = useState(pathMask);
  useEffect(() => setDraftMask(pathMask), [pathMask]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (draftMask !== pathMask) setPathMask(draftMask);
    }, 200);
    return () => clearTimeout(t);
  }, [draftMask, pathMask, setPathMask]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-neutral-900 bg-neutral-950 px-4 py-2">
      <button
        type="button"
        onClick={() => setDirectoryTreeOpen(!directoryTreeOpen)}
        aria-pressed={directoryTreeOpen}
        title={directoryTreeOpen ? "Hide directory sidebar" : "Show directory sidebar"}
        className={`flex shrink-0 cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
          directoryTreeOpen
            ? "bg-neutral-900 text-neutral-200"
            : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
        }`}
      >
        <span aria-hidden="true">▸</span>
        Tree
      </button>

      {graph ? <NodeSearch graph={graph} /> : null}

      <div className="flex items-center gap-1">
        {CLASSIFICATION_ORDER.map((cls) => {
          const mode = classificationModes[cls];
          const title = `Cycle: normal → dim → hide → only → normal (now: ${classificationModeLabel(mode)})`;
          return (
            <InfoTooltip key={cls} term={CLASSIFICATION_ENTRIES[cls].id} side="bottom">
              <button
                type="button"
                onClick={() => cycleClassification(cls)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity ${
                  mode === "solo" ? "ring-1 ring-white/30" : ""
                }`}
                style={{
                  background: `${CLASSIFICATION_COLORS[cls]}33`,
                  color: CLASSIFICATION_COLORS[cls],
                  opacity: modeOpacity(mode),
                }}
                aria-pressed={mode !== "neutral"}
                title={title}
              >
                <ClassificationSwatch classification={cls} size={10} />
                {cls}
                {mode !== "neutral" ? (
                  <span className="text-[10px] opacity-80">{classificationModeLabel(mode)}</span>
                ) : null}
              </button>
            </InfoTooltip>
          );
        })}
      </div>

      <div className="ml-2 flex min-w-[12rem] flex-1 items-center gap-2">
        <input
          type="search"
          list="path-mask-presets"
          value={draftMask}
          onChange={(e) => setDraftMask(e.target.value)}
          placeholder="Filter by path…"
          title="Comma-separated globs (e.g. *.tsx,!**/*.test.*); prefix with ! to exclude. Click in and start typing to see suggestions."
          className="w-full max-w-md rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 font-mono text-sm text-neutral-200 placeholder:font-sans placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
        />
        <datalist id="path-mask-presets">
          {PATH_MASK_PRESETS.filter((p) => p.mask !== "").map((p) => (
            <option key={p.id} value={p.mask} label={p.label} />
          ))}
        </datalist>
      </div>

      <InfoTooltip term="action.type-only-toggle" side="bottom">
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200">
          <input
            type="checkbox"
            checked={!runtimeOnlyMetrics}
            onChange={(e) => setRuntimeOnlyMetrics(!e.target.checked)}
            className="h-3 w-3 accent-neutral-400"
          />
          Include type in metrics
        </label>
      </InfoTooltip>

      <div className="flex items-center gap-1">
        {/* 2D ↔ 3D toggle. Cytoscape is the default; switching to 3D
           dynamically loads three.js so the bundle stays small for users who
           never use the 3D view. */}
        <div
          aria-label="Renderer"
          className="mr-1 flex items-center overflow-hidden rounded border border-neutral-800 text-[10px] font-medium uppercase tracking-wider"
        >
          <button
            type="button"
            onClick={() => setViewMode("2d")}
            aria-pressed={viewMode === "2d"}
            className={`px-2 py-1 transition-colors ${
              viewMode === "2d"
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
            }`}
            title="2D canvas (Cytoscape, WebGL)"
          >
            2D
          </button>
          <button
            type="button"
            onClick={() => setViewMode("3d")}
            aria-pressed={viewMode === "3d"}
            className={`px-2 py-1 transition-colors ${
              viewMode === "3d"
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-500 hover:bg-neutral-900 hover:text-neutral-300"
            }`}
            title="3D scene (three.js force-directed)"
          >
            3D
          </button>
        </div>
        <button
          type="button"
          onClick={resetView}
          className="cursor-pointer rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
        >
          Reset filters
        </button>
        <InfoTooltip term="action.collapse-clusters" side="bottom" align="end">
          <button
            type="button"
            onClick={() => setCollapseDirectories(!collapseDirectories)}
            aria-pressed={collapseDirectories}
            disabled={viewMode === "3d"}
            title={
              viewMode === "3d"
                ? "Cluster-collapse is a 2D-only feature — switch to 2D to use it."
                : undefined
            }
            className={`rounded px-2 py-1 text-xs transition-colors ${
              viewMode === "3d"
                ? "cursor-not-allowed text-neutral-600"
                : `cursor-pointer ${
                    collapseDirectories
                      ? "bg-neutral-900 text-neutral-200"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
                  }`
            }`}
          >
            Collapse clusters
          </button>
        </InfoTooltip>
        <InfoTooltip term="action.relayout" side="bottom" align="end">
          <button
            type="button"
            onClick={requestLayout}
            disabled={viewMode === "3d"}
            title={
              viewMode === "3d"
                ? "Re-layout runs the 2D Cytoscape layout. The 3D scene uses a live d3-force simulation that's always converging."
                : undefined
            }
            className={`rounded px-2 py-1 text-xs transition-colors ${
              viewMode === "3d"
                ? "cursor-not-allowed text-neutral-600"
                : "cursor-pointer text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            }`}
          >
            Re-layout
          </button>
        </InfoTooltip>
        <ExportMenu />
      </div>
    </div>
  );
}
