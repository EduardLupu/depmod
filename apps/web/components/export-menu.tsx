"use client";

import { getCy } from "@/lib/canvas-ref";
import { CANVAS_BG } from "@/lib/colors";
import { getFg } from "@/lib/fg-canvas-ref";
import { useGraphStore } from "@/lib/store";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Toolbar export menu. By default we capture **only the current viewport**;
 * whatever the user has panned/zoomed to is exactly what lands in the image,
 * mirroring what they see on screen. A "Full graph" toggle opts back into the
 * older fit-everything behaviour for documentation screenshots.
 *
 * Raster exports use `scale: 1` by default to keep file sizes sane on large
 * graphs (the previous 2× of the entire fitted graph produced ~20 MB PNGs).
 * A "HiDPI 2×" toggle restores the sharp-on-retina variant for slides/print.
 *
 * SVG export deliberately omitted: it requires `cytoscape-svg` which isn't a
 * dependency yet. and tbh, not sure if worth it.
 */
export function ExportMenu() {
  const graph = useGraphStore((s) => s.graph);
  const source = useGraphStore((s) => s.source);
  const viewMode = useGraphStore((s) => s.viewMode);
  const [open, setOpen] = useState(false);
  const [captureFull, setCaptureFull] = useState(false);
  const [hiDpi, setHiDpi] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const is3D = viewMode === "3d";

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const baseName = useCallback(() => {
    if (source?.label) return source.label.replace(/[^a-zA-Z0-9-_.]/g, "_");
    if (graph?.rootDir) {
      const tail = graph.rootDir.split(/[/\\]/).filter(Boolean).pop();
      if (tail) return tail.replace(/[^a-zA-Z0-9-_.]/g, "_");
    }
    return "depmod-ui";
  }, [graph?.rootDir, source?.label]);

  /**
   * Build the raster options Cytoscape expects.
   *
   * `full: false` (default) crops to the current viewport; exactly what the
   *   user has on screen, including pan/zoom. Mirroring screen state was the
   *   whole point of the P4 export rework.
   * `full: true` re-fits the entire graph, regardless of zoom; useful for
   *   documentation but produces huge images on big projects.
   *
   * `maxWidth/maxHeight` cap output dimensions so a screenshot of an enormous
   *   `full` graph still stays under a few MB. Cytoscape preserves aspect
   *   ratio when scaling down.
   */
  const rasterOpts = useCallback(
    () => ({
      output: "blob" as const,
      full: captureFull,
      scale: hiDpi ? 2 : 1,
      bg: CANVAS_BG,
      maxWidth: hiDpi ? 4000 : 2400,
      maxHeight: hiDpi ? 4000 : 2400,
    }),
    [captureFull, hiDpi],
  );

  const exportPng = useCallback(async () => {
    if (is3D) {
      const blob = await captureFg("image/png", captureFull);
      if (blob) downloadBlob(blob, fileName(baseName(), captureFull, hiDpi, "png"));
      setOpen(false);
      return;
    }
    const cy = getCy();
    if (!cy) return;
    const blob = cy.png(rasterOpts());
    downloadBlob(blob, fileName(baseName(), captureFull, hiDpi, "png"));
    setOpen(false);
  }, [baseName, captureFull, hiDpi, is3D, rasterOpts]);

  const exportJpg = useCallback(async () => {
    if (is3D) {
      const blob = await captureFg("image/jpeg", captureFull, 0.9);
      if (blob) downloadBlob(blob, fileName(baseName(), captureFull, hiDpi, "jpg"));
      setOpen(false);
      return;
    }
    const cy = getCy();
    if (!cy) return;
    const blob = cy.jpg({ ...rasterOpts(), quality: 0.9 });
    downloadBlob(blob, fileName(baseName(), captureFull, hiDpi, "jpg"));
    setOpen(false);
  }, [baseName, captureFull, hiDpi, is3D, rasterOpts]);

  const exportJson = useCallback(() => {
    if (!graph) return;
    const blob = new Blob([`${JSON.stringify(graph, null, 2)}\n`], { type: "application/json" });
    downloadBlob(blob, `${baseName()}.graph.json`);
    setOpen(false);
  }, [graph, baseName]);

  const disabled = !graph;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="cursor-pointer rounded px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
        title="Export the current view"
      >
        Export ▾
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-md border border-neutral-800 bg-neutral-950 shadow-lg"
        >
          <div className="border-b border-neutral-900 px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500">
            Capture
          </div>
          <ToggleRow
            label="Whole graph (fit to image)"
            description="Off captures only what's currently visible; pan/zoom included."
            checked={captureFull}
            onChange={setCaptureFull}
          />
          <ToggleRow
            label="HiDPI 2× (larger file)"
            description={
              is3D
                ? "Not available in 3D — capture is at the canvas's native pixel size."
                : "For print or retina presentations. Off ≈ what you see on screen."
            }
            checked={is3D ? false : hiDpi}
            onChange={setHiDpi}
            disabled={is3D}
          />
          <div className="border-y border-neutral-900 px-3 py-2 text-[10px] uppercase tracking-wider text-neutral-500">
            Format
          </div>
          <MenuItem label="PNG" hint=".png" onClick={exportPng} />
          <MenuItem label="JPG" hint=".jpg" onClick={exportJpg} />
          <MenuItem label="graph.json" hint=".json" onClick={exportJson} />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-neutral-100"
    >
      <span>{label}</span>
      <span className="font-mono text-[10px] text-neutral-500">{hint}</span>
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-2 px-3 py-2 text-left text-xs transition-colors ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-neutral-900"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3 w-3 shrink-0 cursor-pointer accent-sky-500 disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <span className="block text-neutral-200">{label}</span>
        <span className="block text-[10px] leading-relaxed text-neutral-500">{description}</span>
      </span>
    </label>
  );
}

function fileName(base: string, full: boolean, hiDpi: boolean, ext: "png" | "jpg"): string {
  const tags: string[] = [];
  if (full) tags.push("full");
  else tags.push("view");
  if (hiDpi) tags.push("2x");
  return `${base}.${tags.join("-")}.${ext}`;
}

/**
 * Snapshot the active react-force-graph-3d canvas to a Blob.
 *
 * `rendererConfig.preserveDrawingBuffer` is enabled on the canvas, but the
 * back buffer is only guaranteed-stable for the JS task that drew it. To stay
 * safe we force one fresh render against the current scene/camera, then
 * `toBlob` synchronously from the same task. When `fitFirst` is true we
 * frame the camera on the whole graph before capture (the 3D analogue of the
 * 2D "Whole graph" option).
 */
async function captureFg(
  mime: "image/png" | "image/jpeg",
  fitFirst: boolean,
  quality?: number,
): Promise<Blob | null> {
  const fg = getFg();
  if (!fg) return null;
  const renderer = fg.renderer?.();
  const scene = fg.scene?.();
  const camera = fg.camera?.();
  if (!renderer || !scene || !camera) return null;
  if (fitFirst) {
    // Synchronous fit (duration 0) so the camera lands before the render.
    fg.zoomToFit?.(0, 60);
  }
  renderer.render(scene, camera);
  const canvas: HTMLCanvasElement = renderer.domElement;
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), mime, quality);
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Safari has a chance to actually fetch the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
