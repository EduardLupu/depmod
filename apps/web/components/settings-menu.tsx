"use client";

import { useSettings } from "@/lib/use-settings";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";

/**
 * Header affordance for persistent user preferences. Hosted in a Radix dialog
 * so it overlays the existing layout without re-flowing the page.
 */
export function SettingsMenu() {
  const { settings, setSetting } = useSettings();
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
        aria-label="Open settings"
        title="Settings"
      >
        <Cog />
        Settings
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl outline-none">
          <div className="flex items-center justify-between border-b border-neutral-900 px-5 py-4">
            <Dialog.Title className="text-base font-semibold text-neutral-100">
              Settings
            </Dialog.Title>
            <Dialog.Close
              className="rounded px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
              aria-label="Close settings"
            >
              ✕
            </Dialog.Close>
          </div>

          <div className="space-y-5 px-5 py-5">
            <ToggleRow
              label="Open source viewer on selection"
              description="Auto-show the code panel each time you click a node. Off restores the default; open it explicitly with the button or the C shortcut."
              checked={settings.codeViewerAutoOpen}
              onChange={(v) => setSetting("codeViewerAutoOpen", v)}
            />
            <ToggleRow
              label="Layout cache"
              description="Persist fCoSE positions in localStorage so re-mounting the same graph version skips the multi-second layout pass."
              checked={settings.layoutCacheEnabled}
              onChange={(v) => setSetting("layoutCacheEnabled", v)}
            />
          </div>

          <div className="border-t border-neutral-900 px-5 py-3 text-[11px] text-neutral-600">
            Settings are stored in this browser only.
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  // Reflect the prop into local state so the switch animation reads cleanly on
  // checked = false → true and back.
  const [internal, setInternal] = useState(checked);
  useEffect(() => setInternal(checked), [checked]);
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="mt-0.5 flex shrink-0 items-center">
        <input
          type="checkbox"
          checked={internal}
          onChange={(e) => {
            setInternal(e.target.checked);
            onChange(e.target.checked);
          }}
          className="h-4 w-4 cursor-pointer accent-sky-500"
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-neutral-200">{label}</span>
        <span className="block text-xs leading-relaxed text-neutral-500">{description}</span>
      </span>
    </label>
  );
}

function Cog() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Settings</title>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.2v1.6M8 13.2v1.6M14.8 8h-1.6M2.8 8H1.2M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1M12.8 12.8l-1.1-1.1M4.3 4.3 3.2 3.2" />
    </svg>
  );
}
