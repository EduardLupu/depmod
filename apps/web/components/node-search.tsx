"use client";

import { ClassificationSwatch } from "@/components/classification-swatch";
import { CLASSIFICATION_COLORS } from "@/lib/colors";
import { type SearchResult, buildSearchIndex, searchIndex } from "@/lib/node-search";
import { useGraphStore } from "@/lib/store";
import type { Graph } from "@depmod/types";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

interface NodeSearchProps {
  graph: Graph;
}

/**
 * Toolbar search box with a popover listbox of suggestions. Backed by the
 * node-search index (basename / path / export name). Cmd/Ctrl + K focuses the
 * input from anywhere; Escape closes the popover or blurs.
 */
export function NodeSearch({ graph }: NodeSearchProps) {
  const setSelection = useGraphStore((s) => s.setSelection);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const index = useMemo(() => buildSearchIndex(graph), [graph]);
  const results = useMemo<SearchResult[]>(() => searchIndex(index, query), [index, query]);

  // Cmd/Ctrl + K focuses the search from anywhere (and selects existing text
  // so the user can immediately type over it). Avoids fighting browser shortcuts
  // when another modifier is also held.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.altKey || e.shiftKey) return;
      if (e.key !== "k" && e.key !== "K") return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Reset highlight when the result list changes.
  useEffect(() => setActiveIndex(0), [query]);

  const choose = useCallback(
    (result: SearchResult) => {
      setSelection(result.entry.id);
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    },
    [setSelection],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        if (query.length > 0) {
          setQuery("");
        } else {
          setOpen(false);
          inputRef.current?.blur();
        }
        return;
      }
      if (!open || results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % results.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const pick = results[activeIndex];
        if (pick) choose(pick);
      }
    },
    [activeIndex, choose, open, query.length, results],
  );

  return (
    <div ref={containerRef} className="relative flex shrink-0 items-center">
      <span className="pointer-events-none absolute left-2.5 text-xs text-neutral-600">⌕</span>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search nodes…"
        aria-label="Search nodes by filename, path, or export"
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open && results.length > 0}
        className="w-56 rounded-md border border-neutral-800 bg-neutral-900 py-1.5 pl-7 pr-12 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute right-2 inline-flex items-center gap-[2px] rounded border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 text-[10px] text-neutral-500">
        <span className="text-[13px] leading-none">⌘</span>K
      </kbd>

      {open && query.length > 0 ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full z-40 mt-1 max-h-80 w-[28rem] overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950 shadow-lg"
        >
          {results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-neutral-500">No matches.</div>
          ) : (
            results.map((r, i) => (
              <ResultRow
                key={r.entry.id}
                result={r}
                active={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(r)}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function ResultRow({
  result,
  active,
  onMouseEnter,
  onClick,
}: {
  result: SearchResult;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const { entry, hitField, hitExport } = result;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
        active ? "bg-neutral-900" : "bg-transparent hover:bg-neutral-900/60"
      }`}
    >
      <ClassificationSwatch classification={entry.classification} size={10} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-neutral-100">{entry.basename}</span>
        <span className="block truncate text-[10px] text-neutral-500">
          {entry.path === entry.basename ? " " : entry.path}
        </span>
      </span>
      {hitField === "export" && hitExport ? (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]"
          style={{
            background: `${CLASSIFICATION_COLORS[entry.classification]}22`,
            color: CLASSIFICATION_COLORS[entry.classification],
          }}
          title="Match found in export name"
        >
          {hitExport}
        </span>
      ) : null}
    </button>
  );
}
