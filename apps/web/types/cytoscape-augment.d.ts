// Module augmentation for @types/cytoscape; keep this file in module mode
// (the `export {}` below) so the `declare module "cytoscape"` block merges
// with the upstream definitions instead of replacing them.
export {};

declare module "cytoscape" {
  interface NavigatorOptions {
    /** HTML element to render into. Defaults to a div appended to body. */
    container?: HTMLElement | false;
    /** Live-update frame rate while panning. 0 = instant, false = on drag-end only. */
    viewLiveFramerate?: number | false;
    /** Double-click delay in ms. */
    dblClickDelay?: number;
    /** Destroy the user-supplied container on plugin destroy. */
    removeCustomContainer?: boolean;
    /** Debounce window for re-rendering the minimap. */
    rerenderDelay?: number;
  }

  interface NavigatorInstance {
    destroy(): void;
  }

  interface Core {
    navigator(options?: NavigatorOptions): NavigatorInstance;
  }

  // Runtime-only cytoscape options not declared in the shipped d.ts.
  interface CytoscapeOptions {
    /**
     * WebGL renderer background color as `[r, g, b]` ints (0-255). The
     * renderer uses it for premultiplied-alpha blending and defaults to
     * white; set it to match the page background.
     */
    webglBgColor?: [number, number, number];
    /**
     * Per-collection texture row count for node bodies. Smaller graphs
     * benefit from fewer rows (bigger tiles, sharper labels); larger ones
     * need more rows for more concurrent textures. Defaults to 18, max 54.
     */
    webglTexRowsNodes?: number;
    /** Show a small FPS counter in the top-left of the canvas. Debug only. */
    showFps?: boolean;
  }
}
