"use client";

import { GLOSSARY_GROUPS, type GlossaryEntry } from "@/lib/glossary";
import { formatModShortcut } from "@/lib/mod-key";
import { useGraphStore } from "@/lib/store";
import { useIsMac } from "@/lib/use-mod-key";
import * as Dialog from "@radix-ui/react-dialog";

/**
 * Full-glossary slide-over panel. Opened by:
 *   - the LegendButton in the Header
 *   - the `?` keyboard shortcut (registered in <Providers/>)
 *
 * Mounted once at the layout level so both `/` and `/graph` share it.
 */
export function LegendPanel() {
  const open = useGraphStore((s) => s.legendOpen);
  const setOpen = useGraphStore((s) => s.setLegendOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-neutral-900 bg-neutral-950 shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out"
          aria-describedby="legend-description"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-900 px-5 py-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-neutral-100">
                Legend
              </Dialog.Title>
              <Dialog.Description
                id="legend-description"
                className="mt-0.5 text-xs text-neutral-500"
              >
                Definitions for every label and overlay used in the dashboard.
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="rounded px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
              aria-label="Close legend"
            >
              ✕
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {GLOSSARY_GROUPS.map((group) => (
              <section key={group.id}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  {group.title}
                </h3>
                <dl className="space-y-3">
                  {group.entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </dl>
              </section>
            ))}
            <ShortcutsSection />
          </div>

          <div className="shrink-0 border-t border-neutral-900 px-5 py-3 text-[11px] text-neutral-600">
            Press <kbd className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-400">?</kbd> to
            open this panel from anywhere, or{" "}
            <kbd className="rounded bg-neutral-900 px-1.5 py-0.5 text-neutral-400">Esc</kbd> to
            close it.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type ShortcutKey = string | { mod: true; key: string };

interface Shortcut {
  keys: ShortcutKey[];
  description: string;
}

/**
 * Single source of truth for every keyboard shortcut surfaced in the UI. Kept
 * here (rather than scraped from the hook files) so the help panel stays
 * accurate when shortcuts are renamed; the dev who changes a binding can't
 * miss the corresponding doc update.
 */
const SHORTCUTS: ReadonlyArray<{ title: string; items: Shortcut[] }> = [
  {
    title: "Navigation",
    items: [
      { keys: [{ mod: true, key: "K" }], description: "Focus the node search" },
      { keys: ["↑", "↓"], description: "Move highlight in search results" },
      { keys: ["Enter"], description: "Select the highlighted result" },
      { keys: ["Esc"], description: "Close popovers, clear search, blur input" },
    ],
  },
  {
    title: "Inspection",
    items: [
      { keys: ["B"], description: "Toggle blast radius on the selected node" },
      { keys: ["C"], description: "Toggle the source-code viewer" },
      { keys: ["F"], description: "Toggle focus mode on the selected node" },
      { keys: ["["], description: "Shrink focus-mode depth by 1" },
      { keys: ["]"], description: "Grow focus-mode depth by 1" },
    ],
  },
  {
    title: "Reference",
    items: [{ keys: ["?"], description: "Open this legend panel" }],
  },
];

function formatShortcutKey(key: ShortcutKey, isMac: boolean): string {
  return typeof key === "string" ? key : formatModShortcut(key.key, isMac);
}

function ShortcutsSection() {
  const isMac = useIsMac();

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        Keyboard shortcuts
      </h3>
      <div className="space-y-4">
        {SHORTCUTS.map((group) => (
          <div key={group.title}>
            <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-600">
              {group.title}
            </h4>
            <ul className="space-y-1">
              {group.items.map((s, i) => (
                <li
                  key={`${group.title}-${i}`}
                  className="flex items-center justify-between gap-3 rounded border border-neutral-900 bg-neutral-925 px-2.5 py-1.5"
                >
                  <span className="text-xs text-neutral-300">{s.description}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {s.keys.map((k, j) => {
                      const label = formatShortcutKey(k, isMac);
                      return (
                        <span key={label} className="flex items-center gap-1">
                          {j > 0 ? <span className="text-[10px] text-neutral-600">/</span> : null}
                          <kbd className="rounded bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-300">
                            {label}
                          </kbd>
                        </span>
                      );
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function EntryRow({ entry }: { entry: GlossaryEntry }) {
  return (
    <div className="rounded border border-neutral-900 bg-neutral-925 p-3">
      <dt className="flex items-center gap-2 text-sm font-medium text-neutral-100">
        {entry.swatch ? (
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: entry.swatch }}
          />
        ) : null}
        <span>{entry.term}</span>
      </dt>
      <dd className="mt-1 text-xs leading-relaxed text-neutral-300">{entry.short}</dd>
      {entry.long ? (
        <dd className="mt-1 text-xs leading-relaxed text-neutral-500">{entry.long}</dd>
      ) : null}
      {entry.formula ? (
        <dd className="mt-1 font-mono text-[11px] text-neutral-400">{entry.formula}</dd>
      ) : null}
    </div>
  );
}
