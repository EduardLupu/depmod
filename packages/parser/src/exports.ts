import type { Export } from "@depmod/types";
import type { SourceFile } from "ts-morph";

const MAX_TYPE_LENGTH = 240;

/**
 * Extract every export declared in `sourceFile`, paired with its (possibly truncated)
 * type string from the type checker. Default exports are reported with name `"default"`.
 */
export function extractExports(sourceFile: SourceFile): Export[] {
  const out: Export[] = [];
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    const first = declarations[0];
    if (!first) {
      out.push({ name, type: "unknown" });
      continue;
    }
    let typeStr = "unknown";
    try {
      typeStr = first.getType().getText(first);
    } catch {
      // The type checker can throw on partial/invalid programs; we keep the export but
      // record the failure as `unknown` so the schema stays valid.
      typeStr = "unknown";
    }
    out.push({ name, type: truncate(typeStr) });
  }
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

function truncate(s: string): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_TYPE_LENGTH
    ? `${collapsed.slice(0, MAX_TYPE_LENGTH - 1)}…`
    : collapsed;
}
