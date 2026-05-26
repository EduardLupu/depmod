"use client";

import { ClassificationSwatch } from "@/components/classification-swatch";
import { CLASSIFICATION_COLORS, SELECTED_COLOR } from "@/lib/colors";
import type { Classification } from "@depmod/types";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";

export interface ModuleNodeData extends Record<string, unknown> {
  basename: string;
  fullPath: string;
  classification: Classification;
  loc: number;
  instability: number;
  isRoot: boolean;
  isSelected: boolean;
}

export const MODULE_NODE_TYPE = "module" as const;

function ModuleNodeImpl({ data }: NodeProps) {
  const d = data as ModuleNodeData;
  const accent = CLASSIFICATION_COLORS[d.classification];
  return (
    <div
      className="flex h-[60px] w-[200px] items-center gap-3 rounded-lg border-2 bg-neutral-950 px-3 shadow-md"
      style={{
        borderColor: d.isSelected ? SELECTED_COLOR : d.isRoot ? accent : "#262626",
        boxShadow: d.isRoot ? `0 0 0 1px ${accent}55` : undefined,
      }}
      title={d.fullPath}
    >
      <Handle type="target" position={Position.Top} style={{ background: "#525252" }} />
      <ClassificationSwatch classification={d.classification} size={12} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-xs text-neutral-100" title={d.fullPath}>
          {d.basename}
        </div>
        <div className="mt-0.5 flex gap-2 text-[10px] tabular-nums text-neutral-500">
          <span style={{ color: accent }}>{d.classification}</span>
          <span>LOC {d.loc}</span>
          <span>I {d.instability.toFixed(2)}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: "#525252" }} />
    </div>
  );
}

export const ModuleNode = memo(ModuleNodeImpl);
