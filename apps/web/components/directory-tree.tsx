"use client";

import { type DirectoryNode, buildDirectoryTree } from "@/lib/directory-tree";
import { useGraphStore } from "@/lib/store";
import type { DirectoryVisibility } from "@/lib/view-graph";
import type { Graph, UnusedDependency } from "@depmod/types";
import { useMemo, useState } from "react";

interface DirectoryTreeProps {
  graph: Graph;
}

/**
 * Group the graph's `unusedDependencies` by workspace path so the tree can
 * render each workspace's chips inline. Workspaces in the graph are keyed by
 * path relative to `rootDir`, matching `DirectoryNode.path`; including the
 * empty string for the root package.json.
 */
function groupUnusedByWorkspace(
  deps: readonly UnusedDependency[],
): Map<string, UnusedDependency[]> {
  const out = new Map<string, UnusedDependency[]>();
  for (const u of deps) {
    const list = out.get(u.workspace) ?? [];
    list.push(u);
    out.set(u.workspace, list);
  }
  return out;
}

/**
 * Left-rail directory navigator. Built from the file ids in the
 * loaded graph, with collapsible folder rows. Clicking a folder sets the
 * `focusedDirectory` store flag, which dims any node outside the subtree and
 * pans the camera to its bounding box.
 */
export function DirectoryTree({ graph }: DirectoryTreeProps) {
  const focusedDirectory = useGraphStore((s) => s.focusedDirectory);
  const setFocusedDirectory = useGraphStore((s) => s.setFocusedDirectory);
  const viewFilters = useGraphStore((s) => s.viewFilters);
  const cycleDirectoryFilter = useGraphStore((s) => s.cycleDirectoryFilter);
  const clearDirectoryFilters = useGraphStore((s) => s.clearDirectoryFilters);
  const hasDirectoryFilters = Object.keys(viewFilters.directoryByPath).length > 0;

  const tree = useMemo(() => buildDirectoryTree(graph), [graph]);
  const unusedByWorkspace = useMemo(
    () => groupUnusedByWorkspace(graph.unusedDependencies ?? []),
    [graph.unusedDependencies],
  );
  const rootUnused = unusedByWorkspace.get("") ?? [];

  // Auto-expand the top-level directories on first render so users don't have
  // to click the first level themselves; deeper levels stay collapsed.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    return new Set(tree.map((n) => n.path));
  });

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-900 bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-900 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Directories
        </span>
        <div className="flex gap-1">
          {hasDirectoryFilters ? (
            <button
              type="button"
              onClick={() => clearDirectoryFilters()}
              className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
              title="Clear view filters"
            >
              Filters
            </button>
          ) : null}
          {focusedDirectory ? (
            <button
              type="button"
              onClick={() => setFocusedDirectory(null)}
              className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
            >
              Focus
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {tree.length === 0 ? (
          <div className="px-3 py-2 text-xs text-neutral-600">
            No directories; this graph only has repo-root files.
          </div>
        ) : (
          <ul className="text-sm">
            {tree.map((dir) => (
              <DirectoryRow
                key={dir.path}
                dir={dir}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                focusedDirectory={focusedDirectory}
                onSelect={setFocusedDirectory}
                directoryByPath={viewFilters.directoryByPath}
                onCycleFilter={cycleDirectoryFilter}
                unusedByWorkspace={unusedByWorkspace}
              />
            ))}
          </ul>
        )}
        {/* Root-package unused deps come AFTER the directory listing so the
           tree is the first thing the user reads. The block is visually set
           apart with a top border + slight tinted background. */}
        {rootUnused.length > 0 ? (
          <div className="mt-2 border-t border-neutral-900 pt-2">
            <UnusedDepsBlock label="Root package.json" deps={rootUnused} depth={0} highlight />
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * Inline chip group rendered below a directory row when that directory has
 * declared-but-unused dependencies. The chip colour mirrors the parser's
 * heuristic: amber for runtime `dependencies` (more concerning), neutral for
 * `devDependencies` (likely false-positives from CLIs / config-only deps).
 */
function UnusedDepsBlock({
  deps,
  depth,
  label,
  highlight,
}: {
  deps: readonly UnusedDependency[];
  depth: number;
  label?: string;
  highlight?: boolean;
}) {
  const indent = depth * 12 + 28;
  return (
    <div
      className={`mb-1 mt-1 rounded py-1 pr-2 ${highlight ? "bg-neutral-925/70" : ""}`}
      style={{ paddingLeft: `${indent}px` }}
      title={`${deps.length} declared-but-not-imported dependencies`}
    >
      <div className="mb-1 flex items-center gap-1 text-[9px] uppercase tracking-wider text-neutral-500">
        <span aria-hidden>⚠</span>
        <span>
          {label ? `${label} · ` : ""}unused deps ({deps.length})
        </span>
      </div>
      <ul className="flex flex-wrap gap-1">
        {deps.map((d) => (
          <li
            key={`${d.workspace}:${d.name}`}
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
              d.kind === "devDependencies"
                ? "border-neutral-800 bg-neutral-925 text-neutral-400"
                : "border-amber-900/50 bg-amber-950/30 text-amber-300"
            }`}
            title={`Declared in ${d.kind} but never imported`}
          >
            {d.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DirectoryRow({
  dir,
  depth,
  expanded,
  onToggle,
  focusedDirectory,
  onSelect,
  directoryByPath,
  onCycleFilter,
  unusedByWorkspace,
}: {
  dir: DirectoryNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  focusedDirectory: string | null;
  onSelect: (path: string | null) => void;
  directoryByPath: Record<string, DirectoryVisibility>;
  onCycleFilter: (path: string) => void;
  unusedByWorkspace: Map<string, UnusedDependency[]>;
}) {
  const isExpanded = expanded.has(dir.path);
  const isSelected = focusedDirectory === dir.path;
  const filterState = directoryByPath[dir.path] ?? "neutral";
  const hasChildren = dir.children.length > 0;
  const indent = depth * 12 + 8;
  const unused = unusedByWorkspace.get(dir.path);

  return (
    <li>
      <div
        className={`flex cursor-pointer items-center gap-1 px-1 py-1 text-xs transition-colors ${
          isSelected
            ? "bg-amber-500/10 text-amber-400"
            : "text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100"
        }`}
        style={{ paddingLeft: `${indent}px` }}
      >
        <button
          type="button"
          onClick={() => onToggle(dir.path)}
          aria-label={isExpanded ? "Collapse" : "Expand"}
          aria-expanded={isExpanded}
          className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center text-neutral-500 hover:text-neutral-200"
        >
          {hasChildren ? (isExpanded ? "▾" : "▸") : ""}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCycleFilter(dir.path);
          }}
          title={`View filter: ${filterState} (click to cycle)`}
          className={`flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded text-[10px] font-bold ${
            filterState === "excluded"
              ? "bg-red-500/20 text-red-400"
              : filterState === "included"
                ? "bg-emerald-500/20 text-emerald-400"
                : "text-neutral-600 hover:bg-neutral-800 hover:text-neutral-400"
          }`}
        >
          {filterState === "excluded" ? "−" : filterState === "included" ? "+" : "○"}
        </button>
        <button
          type="button"
          onClick={() => onSelect(isSelected ? null : dir.path)}
          className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-left font-mono"
          title={dir.path}
        >
          <span className="truncate">{dir.segment}</span>
          {unused && unused.length > 0 ? (
            <span
              className="shrink-0 rounded bg-amber-950/40 px-1 py-0.5 text-[9px] font-medium text-amber-300"
              title={`${unused.length} unused npm dependencies in this workspace`}
            >
              {unused.length} unused
            </span>
          ) : null}
          <span className="ml-auto shrink-0 text-[10px] tabular-nums text-neutral-600">
            {dir.fileCount}
          </span>
        </button>
      </div>
      {isExpanded && unused && unused.length > 0 ? (
        <UnusedDepsBlock deps={unused} depth={depth} />
      ) : null}
      {isExpanded && hasChildren ? (
        <ul>
          {dir.children.map((child) => (
            <DirectoryRow
              key={child.path}
              dir={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              focusedDirectory={focusedDirectory}
              onSelect={onSelect}
              directoryByPath={directoryByPath}
              onCycleFilter={onCycleFilter}
              unusedByWorkspace={unusedByWorkspace}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
