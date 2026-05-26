// Ambient declaration for the cytoscape-navigator package (no top-level
// export; keep this file in script/global mode so the `declare module`
// below creates a fresh module declaration instead of trying to augment one).
declare module "cytoscape-navigator" {
  import type { Ext } from "cytoscape";
  const ext: Ext;
  export default ext;
}
