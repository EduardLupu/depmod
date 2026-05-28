/** True when built for GitHub Pages static export (no CLI server session). */
export const isStaticDemo = process.env.NEXT_PUBLIC_DEPMOD_STATIC === "1";

/** Base path prefix for GitHub Pages project sites (e.g. `/depmod`). */
export function staticBasePath(): string {
  return process.env.NEXT_PUBLIC_DEPMOD_BASE_PATH ?? "";
}

export function staticDemoGraphUrl(): string {
  return `${staticBasePath()}/demo/graph.json`;
}

export function staticDemoSourceUrl(nodeId: string): string {
  const segments = nodeId.replace(/\\/g, "/").split("/").filter(Boolean);
  return `${staticBasePath()}/demo/sources/${segments.map((s) => encodeURIComponent(s)).join("/")}.json`;
}
