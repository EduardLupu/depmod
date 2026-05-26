"use client";

import type { ParseProgressState } from "@/lib/parse-progress";

interface LoadingScreenProps {
  progress: ParseProgressState;
}

export function LoadingScreen({ progress }: LoadingScreenProps) {
  const pct = progress.percent ?? (progress.phase === "ready" ? 100 : undefined);
  const barWidth = pct != null ? `${Math.min(100, Math.max(0, pct))}%` : undefined;

  return (
    <output
      className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-neutral-950 text-neutral-100"
      aria-live="polite"
      aria-busy={progress.phase !== "ready"}
    >
      <div className="w-full max-w-md px-8 text-center">
        <p className="text-lg font-medium tracking-tight">depmod</p>
        <p className="mt-2 text-sm text-neutral-400">{progress.message}</p>
        <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
          {barWidth != null ? (
            <div
              className="h-full rounded-full bg-sky-500 transition-[width] duration-300 ease-out"
              style={{ width: barWidth }}
            />
          ) : (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-sky-500/60" />
          )}
        </div>
        {(progress.nodes != null || progress.edges != null) && (
          <p className="mt-4 text-xs text-neutral-500">
            {progress.nodes != null ? `${progress.nodes} nodes` : null}
            {progress.nodes != null && progress.edges != null ? " · " : null}
            {progress.edges != null ? `${progress.edges} edges` : null}
          </p>
        )}
        {progress.error ? <p className="mt-4 text-sm text-red-400">{progress.error}</p> : null}
      </div>
    </output>
  );
}
