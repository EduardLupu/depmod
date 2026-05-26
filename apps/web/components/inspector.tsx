"use client";

import { ClassificationSwatch } from "@/components/classification-swatch";
import { InfoTooltip } from "@/components/info-tooltip";
import { computeBlastRadius } from "@/lib/blast-radius";
import { CLASSIFICATION_ORDER } from "@/lib/classification-style";
import { BLAST_COLOR, CLASSIFICATION_COLORS } from "@/lib/colors";
import { CLASSIFICATION_ENTRIES } from "@/lib/glossary";
import {
  type DeadKind,
  type FrontendHealth,
  deadKindDescription,
  deadKindLabel,
  summarizeHealth,
} from "@/lib/health";
import {
  type BundleEstimate,
  buildCycleMembership,
  buildOutgoingIndex,
  estimateBundleSize,
} from "@/lib/node-metrics";
import { matchesPathMask, parsePathMask } from "@/lib/path-mask";
import { useGraphStore } from "@/lib/store";
import { nodeVisible } from "@/lib/view-graph";
import type { Classification, Graph, Node as GraphNode, Metrics } from "@depmod/types";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Pick which Metrics block to display per the user's toolbar preference.
 * Older graphs lack `metricsRuntimeOnly`; fall back to the v1 `metrics`.
 */
function pickMetrics(node: GraphNode, runtimeOnly: boolean): Metrics {
  if (runtimeOnly && node.metricsRuntimeOnly) return node.metricsRuntimeOnly;
  return node.metrics;
}

interface InspectorProps {
  graph: Graph;
}

export function Inspector({ graph }: InspectorProps) {
  const selectedId = useGraphStore((s) => s.selectedNodeId);
  const setSelection = useGraphStore((s) => s.setSelection);
  const blastRadiusFor = useGraphStore((s) => s.blastRadiusFor);
  const toggleBlast = useGraphStore((s) => s.toggleBlastRadiusForSelection);
  const runtimeOnlyMetrics = useGraphStore((s) => s.runtimeOnlyMetrics);
  const focusModeRoot = useGraphStore((s) => s.focusModeRoot);
  const focusModeDepth = useGraphStore((s) => s.focusModeDepth);
  const toggleFocus = useGraphStore((s) => s.toggleFocusModeForSelection);
  const bumpFocusDepth = useGraphStore((s) => s.bumpFocusModeDepth);
  const toggleCodeViewer = useGraphStore((s) => s.toggleCodeViewer);
  const codeViewerOpen = useGraphStore((s) => s.codeViewerOpen);

  const selectedNode = useMemo(
    () => (selectedId ? graph.nodes.find((n) => n.id === selectedId) : undefined),
    [graph.nodes, selectedId],
  );

  const counts = useMemo(() => countByClassification(graph.nodes), [graph.nodes]);
  const health = useMemo<FrontendHealth>(() => summarizeHealth(graph), [graph]);
  const deadById = useMemo(() => {
    const out = new Map<string, readonly DeadKind[]>();
    for (const d of health.deadModules) out.set(d.id, d.kinds);
    return out;
  }, [health.deadModules]);

  const dependents = useMemo(
    () =>
      selectedId ? graph.edges.filter((e) => e.target === selectedId).map((e) => e.source) : [],
    [graph.edges, selectedId],
  );
  const dependencies = useMemo(
    () =>
      selectedId ? graph.edges.filter((e) => e.source === selectedId).map((e) => e.target) : [],
    [graph.edges, selectedId],
  );

  // Derived per-node metrics. The outgoing index + cycle membership are built
  // once per graph (cheap, even on 10k-edge graphs); the bundle estimate is
  // computed only for the currently-selected node so a 5000-node walk doesn't
  // happen on every selection change for other modules.
  const outgoingIndex = useMemo(
    () => buildOutgoingIndex(graph.edges, { excludeTypeOnly: true }),
    [graph.edges],
  );
  const cycleMembership = useMemo(() => buildCycleMembership(graph.cycles), [graph.cycles]);
  const setFocusedCycle = useGraphStore((s) => s.setFocusedCycle);
  const selectedBundle = useMemo<BundleEstimate | null>(
    () => (selectedNode ? estimateBundleSize(graph, selectedNode.id, outgoingIndex) : null),
    [graph, selectedNode, outgoingIndex],
  );
  const selectedCycles = useMemo<readonly number[]>(
    () => (selectedNode ? (cycleMembership.get(selectedNode.id) ?? []) : []),
    [cycleMembership, selectedNode],
  );

  const blastEntries = useMemo(() => {
    if (!selectedId) return [] as Array<{ id: string; depth: number }>;
    if (blastRadiusFor !== selectedId) return [];
    const radius = computeBlastRadius(graph, selectedId);
    const entries: Array<{ id: string; depth: number }> = [];
    for (const [id, depth] of radius.depthByNode) {
      if (depth === 0) continue; // root is the selected node itself
      entries.push({ id, depth });
    }
    entries.sort((a, b) => (a.depth !== b.depth ? a.depth - b.depth : a.id.localeCompare(b.id)));
    return entries;
  }, [graph, selectedId, blastRadiusFor]);

  return (
    <aside className="flex h-full min-h-0 w-96 flex-col overflow-y-auto overscroll-contain border-l border-neutral-900 bg-neutral-950">
      {selectedNode ? (
        <SelectionPanel
          node={selectedNode}
          deadKinds={deadById.get(selectedNode.id)}
          dependents={dedupe(dependents)}
          dependencies={dedupe(dependencies)}
          onSelect={setSelection}
          onClear={() => setSelection(null)}
          blastActive={blastRadiusFor === selectedNode.id}
          blastEntries={blastEntries}
          onToggleBlast={toggleBlast}
          runtimeOnlyMetrics={runtimeOnlyMetrics}
          focusActive={focusModeRoot === selectedNode.id}
          focusDepth={focusModeDepth}
          onToggleFocus={toggleFocus}
          onBumpFocusDepth={bumpFocusDepth}
          codeViewerOpen={codeViewerOpen}
          onToggleCodeViewer={toggleCodeViewer}
          bundle={selectedBundle}
          cycleIndices={selectedCycles}
          onIsolateCycle={setFocusedCycle}
        />
      ) : (
        <OverviewPanel graph={graph} counts={counts} health={health} onSelect={setSelection} />
      )}
    </aside>
  );
}

function OverviewPanel({
  graph,
  counts,
  health,
  onSelect,
}: {
  graph: Graph;
  counts: Map<Classification, number>;
  health: FrontendHealth;
  onSelect: (id: string) => void;
}) {
  const viewFilters = useGraphStore((s) => s.viewFilters);
  const pathMask = useGraphStore((s) => s.pathMask);
  const languages = useMemo(() => summarizeLanguages(graph.nodes), [graph.nodes]);
  const mask = useMemo(() => parsePathMask(pathMask), [pathMask]);
  const visibleNodes = useMemo(() => {
    return graph.nodes.filter(
      (n) =>
        nodeVisible(n.id, viewFilters) &&
        matchesPathMask(n.id, mask, { classification: n.classification }),
    ).length;
  }, [graph.nodes, viewFilters, mask]);

  const visibleCountByClass = useMemo(() => {
    const out = new Map<Classification, number>();
    for (const n of graph.nodes) {
      if (!nodeVisible(n.id, viewFilters)) continue;
      if (!matchesPathMask(n.id, mask, { classification: n.classification })) continue;
      out.set(n.classification, (out.get(n.classification) ?? 0) + 1);
    }
    return out;
  }, [graph.nodes, viewFilters, mask]);

  return (
    <>
      <Section title="Stats">
        <StatRow label="Files" value={graph.stats.files} />
        <StatRow label="Nodes" value={graph.stats.nodes} />
        {visibleNodes < graph.stats.nodes ? (
          <StatRow label="Visible" value={visibleNodes} valueClass="text-amber-400" />
        ) : null}
        <StatRow label="Edges" value={graph.stats.edges} />
        <StatRow
          label="Cycles"
          value={graph.stats.cycles}
          valueClass={graph.stats.cycles > 0 ? "text-red-400" : undefined}
        />
        <StatRow label="Parse" value={`${graph.stats.parseMs}ms`} />
      </Section>

      <Section title="Languages">
        <StatRow label="TypeScript" value={languages.ts} />
        <StatRow label="JavaScript" value={languages.js} />
        {languages.other > 0 ? <StatRow label="Other" value={languages.other} /> : null}
        <StatRow label="LOC (sum)" value={languages.totalLoc.toLocaleString()} />
        {languages.bytesKnown ? (
          <StatRow label="Size (sum)" value={formatBytes(languages.totalBytes)} />
        ) : null}
      </Section>

      <Section title="Classification">
        {CLASSIFICATION_ORDER.map((cls) => {
          const count = counts.get(cls) ?? 0;
          const visible = visibleCountByClass.get(cls) ?? 0;
          const hiddenByMask = count > 0 && visible < count;
          const pct = graph.nodes.length === 0 ? 0 : (count / graph.nodes.length) * 100;
          return (
            <div key={cls} className="mb-1 flex items-center gap-2 text-sm">
              <ClassificationSwatch classification={cls} size={12} />
              <span className="w-20 text-neutral-400">{cls}</span>
              <span
                className={`w-12 text-right tabular-nums ${hiddenByMask ? "text-amber-400" : "text-neutral-200"}`}
                title={
                  hiddenByMask
                    ? `${visible} visible on canvas (${count - visible} hidden by path mask)`
                    : undefined
                }
              >
                {hiddenByMask ? `${visible}/${count}` : count}
              </span>
              <div className="ml-2 h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-900">
                <div
                  className="h-full"
                  style={{ width: `${pct}%`, background: CLASSIFICATION_COLORS[cls] }}
                />
              </div>
            </div>
          );
        })}
      </Section>

      {graph.cycles.length > 0 ? (
        <Section
          title={`Cycles (${graph.cycles.length})`}
          accent="text-red-400"
          titleSuffix={<InfoTooltip term="action.cycle" />}
        >
          <CyclesList cycles={graph.cycles} />
        </Section>
      ) : null}

      <HealthSection health={health} onSelect={onSelect} />

      <Section title="" className="border-none pt-2 text-xs text-neutral-600">
        Click a node in the canvas to see its details.
      </Section>
    </>
  );
}

function SelectionPanel({
  node,
  deadKinds,
  dependents,
  dependencies,
  onSelect,
  onClear,
  blastActive,
  blastEntries,
  onToggleBlast,
  runtimeOnlyMetrics,
  focusActive,
  focusDepth,
  onToggleFocus,
  onBumpFocusDepth,
  codeViewerOpen,
  onToggleCodeViewer,
  bundle,
  cycleIndices,
  onIsolateCycle,
}: {
  node: GraphNode;
  deadKinds: readonly DeadKind[] | undefined;
  dependents: string[];
  dependencies: string[];
  onSelect: (id: string) => void;
  onClear: () => void;
  blastActive: boolean;
  blastEntries: Array<{ id: string; depth: number }>;
  onToggleBlast: () => void;
  runtimeOnlyMetrics: boolean;
  focusActive: boolean;
  focusDepth: number;
  onToggleFocus: () => void;
  onBumpFocusDepth: (delta: number) => void;
  codeViewerOpen: boolean;
  onToggleCodeViewer: () => void;
  bundle: BundleEstimate | null;
  cycleIndices: readonly number[];
  onIsolateCycle: (idx: number | null) => void;
}) {
  const metrics = pickMetrics(node, runtimeOnlyMetrics);
  const showsRuntimeBadge = runtimeOnlyMetrics && node.metricsRuntimeOnly !== undefined;
  return (
    <>
      <div className="flex items-center justify-between border-b border-neutral-900 bg-neutral-925 px-4 py-3">
        <div className="min-w-0 flex-1">
          <InfoTooltip
            term={CLASSIFICATION_ENTRIES[node.classification].id}
            side="bottom"
            align="start"
          >
            <button
              type="button"
              className="flex items-center gap-2 rounded text-left transition-colors hover:bg-neutral-900"
              aria-label={`Classification: ${node.classification}. Hover for definition.`}
            >
              <ClassificationSwatch classification={node.classification} size={12} />
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                {node.classification}
              </span>
            </button>
          </InfoTooltip>
          <h2 className="mt-1 truncate font-mono text-sm text-neutral-100" title={node.id}>
            {node.id}
          </h2>
          {deadKinds && deadKinds.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              <span
                className="rounded bg-red-950/40 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-300"
                title="Flagged as dead; see chips for the reason(s). Listed in Health under the overview."
              >
                dead
              </span>
              {deadKinds.map((k) => (
                <span
                  key={k}
                  className="rounded border border-red-900/40 bg-red-950/20 px-1.5 py-0.5 text-[10px] text-red-300/90"
                  title={deadKindDescription(k)}
                >
                  {deadKindLabel(k)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClear}
          className="ml-2 shrink-0 rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
          aria-label="Close selection"
        >
          ✕
        </button>
      </div>

      <Section
        title="Metrics"
        titleSuffix={
          showsRuntimeBadge ? (
            <span
              className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[9px] font-normal uppercase tracking-wider text-neutral-500"
              title="Counts only edges that survive at runtime; TypeScript `import type` declarations are excluded."
            >
              runtime
            </span>
          ) : (
            <span
              className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[9px] font-normal uppercase tracking-wider text-neutral-500"
              title="Counts every edge kind, including type-only imports. Toggle in the toolbar."
            >
              all edges
            </span>
          )
        }
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <StatRow label="LOC" value={node.loc} tooltipTerm="metric.loc" />
          {typeof node.bytes === "number" ? (
            <StatRow label="Size" value={formatBytes(node.bytes)} />
          ) : (
            // Filler so the grid stays balanced for graphs without byte info.
            <StatRow label="Size" value="—" />
          )}
          <StatRow
            label="Instability"
            value={metrics.instability.toFixed(3)}
            tooltipTerm="metric.instability"
          />
          <StatRow label="Exports" value={node.exports.length} tooltipTerm="metric.exports" />
          <StatRow label="Ca" value={metrics.Ca} tooltipTerm="metric.ca" />
          <StatRow label="Ce" value={metrics.Ce} tooltipTerm="metric.ce" />
          <BundleStat bundle={bundle} />
          <CyclesStat cycles={cycleIndices} onIsolate={onIsolateCycle} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <InfoTooltip term="action.blast-radius" side="bottom" align="end">
            <button
              type="button"
              onClick={onToggleBlast}
              className="flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                blastActive
                  ? {
                      background: `${BLAST_COLOR}22`,
                      borderColor: BLAST_COLOR,
                      color: BLAST_COLOR,
                    }
                  : { borderColor: "#262626", color: "#e5e5e5" }
              }
            >
              <span>{blastActive ? "Hide blast" : "Show blast"}</span>
              <kbd className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500">
                B
              </kbd>
            </button>
          </InfoTooltip>

          <InfoTooltip term="action.code-viewer" side="bottom" align="end">
            <button
              type="button"
              onClick={onToggleCodeViewer}
              className={`flex w-full cursor-pointer items-center justify-between rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                codeViewerOpen
                  ? "border-sky-800 bg-sky-950/40 text-sky-300"
                  : "border-neutral-800 text-neutral-200 hover:bg-neutral-900"
              }`}
            >
              <span>{codeViewerOpen ? "Hide source" : "View source"}</span>
              <kbd className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500">
                C
              </kbd>
            </button>
          </InfoTooltip>

          <InfoTooltip term="action.focus-mode" side="bottom" align="end">
            <button
              type="button"
              onClick={onToggleFocus}
              className="flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                focusActive
                  ? {
                      background: "rgba(251, 191, 36, 0.15)",
                      borderColor: "#fbbf24",
                      color: "#fbbf24",
                    }
                  : { borderColor: "#262626", color: "#e5e5e5" }
              }
            >
              <span>{focusActive ? `Hide focus · ${focusDepth}` : "Focus"}</span>
              <kbd className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500">
                F
              </kbd>
            </button>
          </InfoTooltip>

          <CopyPathButton path={node.id} />
        </div>

        {focusActive ? (
          <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
            <span>Depth</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onBumpFocusDepth(-1)}
                className="rounded border border-neutral-800 bg-neutral-925 px-1.5 py-0.5 text-neutral-300 transition-colors hover:bg-neutral-800"
                aria-label="Decrease focus depth"
              >
                −
              </button>
              <span className="tabular-nums text-neutral-200">{focusDepth}</span>
              <button
                type="button"
                onClick={() => onBumpFocusDepth(+1)}
                className="rounded border border-neutral-800 bg-neutral-925 px-1.5 py-0.5 text-neutral-300 transition-colors hover:bg-neutral-800"
                aria-label="Increase focus depth"
              >
                +
              </button>
              <kbd className="ml-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500">
                [ / ]
              </kbd>
            </div>
          </div>
        ) : null}
      </Section>

      {blastActive ? <BlastRadiusList entries={blastEntries} onSelect={onSelect} /> : null}

      {node.exports.length > 0 ? (
        <Section title={`Exports (${node.exports.length})`}>
          <ul className="space-y-1 text-xs">
            {node.exports.map((e, i) => (
              <li key={i} className="rounded border border-neutral-900 bg-neutral-925 p-2">
                <div className="font-mono text-neutral-200">{e.name}</div>
                <div
                  className="mt-0.5 break-all font-mono text-[10px] text-neutral-500"
                  title={e.type}
                >
                  {e.type}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <NodeList
        title={`Dependents (${dependents.length})`}
        ids={dependents}
        onSelect={onSelect}
        emptyHint="Nothing imports this module."
      />
      <NodeList
        title={`Dependencies (${dependencies.length})`}
        ids={dependencies}
        onSelect={onSelect}
        emptyHint="This module has no internal dependencies."
        className="min-h-0 flex-1"
      />
    </>
  );
}

function BlastRadiusList({
  entries,
  onSelect,
}: {
  entries: Array<{ id: string; depth: number }>;
  onSelect: (id: string) => void;
}) {
  return (
    <Section title={`Blast radius (${entries.length})`} accent="text-[#f59e0b]">
      {entries.length === 0 ? (
        <div className="text-xs text-neutral-600">
          Nothing depends on this module. A change here is locally contained.
        </div>
      ) : (
        <ul className="space-y-1 text-xs">
          {entries.map((entry) => (
            <li key={entry.id}>
              <PathTooltip path={entry.id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  className="flex w-full items-center gap-2 truncate rounded border border-neutral-900 bg-neutral-925 p-2 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900"
                >
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] tabular-nums"
                    style={{ background: "#27201050", color: BLAST_COLOR }}
                  >
                    d={entry.depth}
                  </span>
                  <span className="truncate font-mono text-neutral-200">{entry.id}</span>
                </button>
              </PathTooltip>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function NodeList({
  title,
  ids,
  onSelect,
  emptyHint,
  className,
}: {
  title: string;
  ids: string[];
  onSelect: (id: string) => void;
  emptyHint: string;
  className?: string;
}) {
  return (
    <Section title={title} className={className}>
      {ids.length === 0 ? (
        <div className="text-xs text-neutral-600">{emptyHint}</div>
      ) : (
        <ul className="-mr-1 max-h-full space-y-1 overflow-y-auto pr-1 text-xs">
          {ids.map((id) => (
            <li key={id}>
              <PathTooltip path={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className="block w-full truncate rounded border border-neutral-900 bg-neutral-925 p-2 text-left font-mono text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-100"
                >
                  {id}
                </button>
              </PathTooltip>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PathTooltip({ path, children }: { path: string; children: React.ReactNode }) {
  return (
    <Tooltip.Root delayDuration={150}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="left"
          align="center"
          sideOffset={6}
          collisionPadding={8}
          className="z-[200] max-w-[28rem] break-all rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 font-mono text-[11px] text-neutral-100 shadow-2xl"
        >
          {path}
          <Tooltip.Arrow className="fill-neutral-800" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function Section({
  title,
  children,
  accent,
  className,
  titleSuffix,
}: {
  title: string;
  children: React.ReactNode;
  accent?: string;
  className?: string;
  titleSuffix?: React.ReactNode;
}) {
  return (
    <section className={`border-b border-neutral-900 p-4 ${className ?? ""}`}>
      {title ? (
        <h3
          className={`mb-2 flex items-center text-xs font-semibold uppercase tracking-wider ${
            accent ?? "text-neutral-400"
          }`}
        >
          <span>{title}</span>
          {titleSuffix}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

function StatRow({
  label,
  value,
  valueClass,
  tooltipTerm,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
  tooltipTerm?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="inline-flex items-center text-neutral-400">
        {label}
        {tooltipTerm ? <InfoTooltip term={tooltipTerm} /> : null}
      </span>
      <span className={`tabular-nums ${valueClass ?? "text-neutral-200"}`}>{value}</span>
    </div>
  );
}

/**
 * Transitive-bundle metric row. Shows `formatBytes(bundle.bytes)`. When
 * `bytesKnown` is false (legacy graph.json from before the `bytes` field was
 * added, or a module path that fell through the bytes capture), prefixes with
 * `~` so the user understands it's a partial sum, and explains in the title.
 */
function BundleStat({ bundle }: { bundle: BundleEstimate | null }) {
  if (!bundle || bundle.modules === 0) {
    return <StatRow label="Bundle" value="—" tooltipTerm="metric.bundle" />;
  }
  const display = `${bundle.bytesKnown ? "" : "~"}${formatBytes(bundle.bytes)}`;
  return (
    <div
      className="flex items-center justify-between text-sm"
      title={`${bundle.modules.toLocaleString()} module${bundle.modules === 1 ? "" : "s"} reachable via runtime imports${bundle.bytesKnown ? "" : "; some bytes unknown (re-run analyze to refresh)"}`}
    >
      <span className="inline-flex items-center text-neutral-400">
        Bundle
        <InfoTooltip term="metric.bundle" />
      </span>
      <span className="tabular-nums text-neutral-200">{display}</span>
    </div>
  );
}

/**
 * Cycle-membership row. Zero → quiet "0" in neutral colour. Non-zero → red,
 * clickable: clicking isolates the first cycle this node belongs to on the
 * canvas (reuses the existing focusedCycle store action).
 */
function CyclesStat({
  cycles,
  onIsolate,
}: {
  cycles: readonly number[];
  onIsolate: (idx: number | null) => void;
}) {
  if (cycles.length === 0) {
    return (
      <StatRow
        label="Cycles"
        value={0}
        tooltipTerm="metric.cycles-member"
        valueClass="text-neutral-500"
      />
    );
  }
  // First cycle index; what the click handler will isolate.
  const firstIdx = cycles[0] ?? 0;
  const label = cycles.length === 1 ? "cycle #" : "cycles · click for #";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="inline-flex items-center text-neutral-400">
        Cycles
        <InfoTooltip term="metric.cycles-member" />
      </span>
      <button
        type="button"
        onClick={() => onIsolate(firstIdx)}
        title={`Click to isolate ${label}${firstIdx + 1} on the canvas`}
        className="cursor-pointer rounded px-1.5 py-0.5 tabular-nums text-red-400 transition-colors hover:bg-red-950/40 hover:text-red-300"
      >
        {cycles.length}
      </button>
    </div>
  );
}

function summarizeLanguages(nodes: readonly GraphNode[]): {
  ts: number;
  js: number;
  other: number;
  totalLoc: number;
  totalBytes: number;
  bytesKnown: boolean;
} {
  let ts = 0;
  let js = 0;
  let other = 0;
  let totalLoc = 0;
  let totalBytes = 0;
  let bytesKnown = false;
  for (const n of nodes) {
    totalLoc += n.loc;
    if (typeof n.bytes === "number") {
      totalBytes += n.bytes;
      bytesKnown = true;
    }
    const lower = n.id.toLowerCase();
    if (
      lower.endsWith(".ts") ||
      lower.endsWith(".tsx") ||
      lower.endsWith(".mts") ||
      lower.endsWith(".cts")
    ) {
      ts++;
    } else if (
      lower.endsWith(".js") ||
      lower.endsWith(".jsx") ||
      lower.endsWith(".mjs") ||
      lower.endsWith(".cjs")
    ) {
      js++;
    } else {
      other++;
    }
  }
  return { ts, js, other, totalLoc, totalBytes, bytesKnown };
}

/** Human-readable byte count, e.g. `1.2 KB`, `4.5 MB`. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function countByClassification(nodes: readonly GraphNode[]): Map<Classification, number> {
  const out = new Map<Classification, number>();
  for (const n of nodes) {
    out.set(n.classification, (out.get(n.classification) ?? 0) + 1);
  }
  return out;
}

function dedupe<T>(arr: readonly T[]): T[] {
  return Array.from(new Set(arr));
}

/**
 * "Copy path" affordance for the selection panel; writes `node.id` to the
 * clipboard and flashes a "Copied!" confirmation for ~1.2s. Falls back to a
 * legacy `execCommand` path on browsers that lack `navigator.clipboard`
 * (mostly insecure-context loads of `depmod-ui`).
 */
function CopyPathButton({ path }: { path: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Reset state when the selected node's path changes so a "Copied!" flash
  // from a previous selection doesn't carry over.
  useEffect(() => {
    setState("idle");
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handle = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(path);
      } else {
        // Legacy fallback for insecure contexts (http://localhost served by the
        // depmod-ui server in non-https contexts). Hidden textarea + execCommand.
        const ta = document.createElement("textarea");
        ta.value = path;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setState("copied");
    } catch {
      setState("error");
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), 1200);
  };

  // Pressing `y` copies the selected node's path. Mirrors the bare-letter
  // pattern used by `b` (blast), `c` (code viewer), `f` (focus) so it stays
  // out of the way of the browser's own ⌘C / ⌘V clipboard shortcuts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== "y" && e.key !== "Y") return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        if (t.isContentEditable) return;
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      }
      e.preventDefault();
      void handle();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const label = state === "copied" ? "Copied!" : state === "error" ? "Copy failed" : "Copy path";
  const active = state === "copied";
  return (
    <button
      type="button"
      onClick={handle}
      title={`Copy ${path} to clipboard`}
      className={`flex w-full cursor-pointer items-center justify-between rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
          : "border-neutral-800 text-neutral-200 hover:bg-neutral-900"
      }`}
    >
      <span>{label}</span>
      <kbd className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] text-neutral-500">Y</kbd>
    </button>
  );
}

/**
 * Cycles list; each row is a button that isolates that cycle on the canvas:
 * only the participating nodes stay visible, the rest fade out. Click again
 * to release. Mirrors the focus-mode UX but constrained to a known node set.
 */
function CyclesList({ cycles }: { cycles: ReadonlyArray<{ nodes: string[] }> }) {
  const focusedCycle = useGraphStore((s) => s.focusedCycle);
  const setFocusedCycle = useGraphStore((s) => s.setFocusedCycle);
  return (
    <ul className="space-y-1 text-sm">
      {cycles.map((cycle, i) => {
        const active = focusedCycle === i;
        return (
          <li key={`cycle-${i}-${cycle.nodes[0]}`}>
            <button
              type="button"
              onClick={() => setFocusedCycle(active ? null : i)}
              aria-pressed={active}
              title={active ? "Click to release the isolation" : "Click to isolate this cycle"}
              className={`block w-full break-all rounded border px-2 py-1.5 text-left transition-colors ${
                active
                  ? "border-red-700/60 bg-red-950/40 text-red-200"
                  : "border-transparent text-neutral-300 hover:border-red-900/40 hover:bg-red-950/20"
              }`}
            >
              <span className="text-red-400">●</span> {cycle.nodes.join(" → ")} → {cycle.nodes[0]}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const HEALTH_HELP =
  "Heuristics; dead-code detection misses dynamic require/resolve patterns; unused-deps misses packages consumed via config files or binary CLIs (vitest, tsx).";

function HealthSection({
  health,
  onSelect,
}: {
  health: FrontendHealth;
  onSelect: (id: string) => void;
}) {
  const { deadModules, unusedDeps } = health;

  // Unused-dependency tallies live inside the DirectoryTree sidebar;
  // the Health section here keeps the dead-module summary.
  if (deadModules.length === 0) {
    return (
      <Section title="Health" titleSuffix={<HealthHelp />}>
        <p className="text-xs text-neutral-500">
          No dead modules detected.
          {unusedDeps.length > 0
            ? ` Unused dependencies (${unusedDeps.length}) are listed inside the directory sidebar.`
            : ""}
        </p>
      </Section>
    );
  }

  return (
    <Section title="Health" titleSuffix={<HealthHelp />}>
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
        Dead modules ({deadModules.length})
      </div>
      <ul className="space-y-1 text-xs">
        {deadModules.map((d) => (
          <li key={d.id}>
            <PathTooltip path={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                className="block w-full rounded border border-neutral-900 bg-neutral-925 p-2 text-left transition-colors hover:border-neutral-700 hover:bg-neutral-900"
              >
                <span className="block truncate font-mono text-neutral-300">{d.id}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {d.kinds.map((k) => (
                    <span
                      key={k}
                      className="rounded border border-red-900/40 bg-red-950/20 px-1 py-0.5 text-[9px] uppercase tracking-wider text-red-300/90"
                      title={deadKindDescription(k)}
                    >
                      {deadKindLabel(k)}
                    </span>
                  ))}
                </span>
              </button>
            </PathTooltip>
          </li>
        ))}
      </ul>
      {unusedDeps.length > 0 ? (
        <p className="mt-3 text-[11px] text-neutral-500">
          Unused dependencies ({unusedDeps.length}) are listed inside the directory sidebar.
        </p>
      ) : null}
    </Section>
  );
}

function HealthHelp() {
  return (
    <span
      className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-neutral-700 text-[8px] text-neutral-500"
      title={HEALTH_HELP}
    >
      ?
    </span>
  );
}
