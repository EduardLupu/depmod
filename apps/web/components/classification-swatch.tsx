"use client";

import { getClassificationStyle } from "@/lib/classification-style";
import type { Classification } from "@depmod/types";
import type { CSSProperties } from "react";

interface ClassificationSwatchProps {
  classification: Classification;
  /** Pixel size of the icon box. */
  size?: number;
  className?: string;
}

/**
 * Mini shape + colour marker matching the Cytoscape canvas node style.
 */
export function ClassificationSwatch({
  classification,
  size = 10,
  className = "",
}: ClassificationSwatchProps) {
  const { color, shape, borderStyle } = getClassificationStyle(classification);
  const border =
    borderStyle === "dashed"
      ? "1.5px dashed"
      : borderStyle === "double"
        ? "2px double"
        : "1.5px solid";

  const base: CSSProperties = {
    width: size,
    height: size,
    backgroundColor: color,
    border: `${border} ${color}`,
    flexShrink: 0,
  };

  if (shape === "diamond") {
    return (
      <span
        className={className}
        style={{
          ...base,
          transform: "rotate(45deg)",
          borderRadius: 1,
        }}
        aria-hidden="true"
      />
    );
  }

  if (shape === "round-rectangle" || shape === "rectangle") {
    return (
      <span
        className={className}
        style={{
          ...base,
          borderRadius: shape === "round-rectangle" ? Math.max(2, size * 0.25) : 0,
        }}
        aria-hidden="true"
      />
    );
  }

  if (shape === "round-hexagon" || shape === "octagon") {
    const clip =
      shape === "octagon"
        ? "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)"
        : "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)";
    return (
      <span
        className={className}
        style={{
          ...base,
          clipPath: clip,
        }}
        aria-hidden="true"
      />
    );
  }

  if (shape === "vee") {
    return (
      <span
        className={className}
        style={{
          width: 0,
          height: 0,
          borderLeft: `${size * 0.45}px solid transparent`,
          borderRight: `${size * 0.45}px solid transparent`,
          borderTop: `${size}px solid ${color}`,
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={className}
      style={{
        ...base,
        borderRadius: "50%",
      }}
      aria-hidden="true"
    />
  );
}
