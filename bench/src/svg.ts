import { logHistogram } from "./metrics.js";
import type { BenchResult } from "./types.js";

const PALETTE: Record<string, string> = {
  primary: "#4f7fdf",
  medium: "#5cb573",
  stress: "#e0a955",
  stretch: "#dc6555",
};

const BG = "#0f0f0f";
const AXIS = "#3a3a3a";
const TEXT = "#d4d4d4";
const TEXT_DIM = "#8a8a8a";

/**
 * Scatter chart: parser wall-clock vs total LOC, one labelled dot per target.
 * Both axes are linear; the reader judges scaling by-eye, which is the point
 * of an evaluation plot. Returns a standalone SVG string.
 */
export function scatterParserPerf(results: readonly BenchResult[]): string {
  const W = 720;
  const H = 440;
  const PAD = { l: 64, r: 24, t: 28, b: 56 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const xs = results.map((r) => r.row.totalLOC);
  const ys = results.map((r) => r.row.parseMs);
  const xMax = niceCeil(Math.max(1, ...xs));
  const yMax = niceCeil(Math.max(1, ...ys));

  const xToPx = (v: number) => PAD.l + (innerW * v) / xMax;
  const yToPx = (v: number) => PAD.t + innerH - (innerH * v) / yMax;

  const xTicks = ticks(xMax, 5);
  const yTicks = ticks(yMax, 5);

  const lines: string[] = [];
  lines.push(svgHeader(W, H));
  lines.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`);
  lines.push(title("Parser wall-clock vs codebase size", W / 2, 18));

  // axes
  lines.push(
    `<line x1="${PAD.l}" y1="${PAD.t + innerH}" x2="${PAD.l + innerW}" y2="${PAD.t + innerH}" stroke="${AXIS}" stroke-width="1"/>`,
  );
  lines.push(
    `<line x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${PAD.t + innerH}" stroke="${AXIS}" stroke-width="1"/>`,
  );

  // x ticks
  for (const t of xTicks) {
    const x = xToPx(t);
    lines.push(
      `<line x1="${x}" y1="${PAD.t + innerH}" x2="${x}" y2="${PAD.t + innerH + 4}" stroke="${AXIS}"/>`,
      `<text x="${x}" y="${PAD.t + innerH + 18}" fill="${TEXT_DIM}" font-size="10" text-anchor="middle">${formatLOC(t)}</text>`,
    );
  }
  // y ticks
  for (const t of yTicks) {
    const y = yToPx(t);
    lines.push(
      `<line x1="${PAD.l - 4}" y1="${y}" x2="${PAD.l}" y2="${y}" stroke="${AXIS}"/>`,
      `<text x="${PAD.l - 8}" y="${y + 4}" fill="${TEXT_DIM}" font-size="10" text-anchor="end">${formatMs(t)}</text>`,
      `<line x1="${PAD.l}" y1="${y}" x2="${PAD.l + innerW}" y2="${y}" stroke="${AXIS}" stroke-opacity="0.3"/>`,
    );
  }

  lines.push(
    axisLabel("total LOC", PAD.l + innerW / 2, H - 14, "middle"),
    axisLabel("parse time (ms)", -(PAD.t + innerH / 2), 16, "middle", -90),
  );

  // points
  for (const r of results) {
    const color = PALETTE[r.target.tier] ?? "#888";
    const cx = xToPx(r.row.totalLOC);
    const cy = yToPx(r.row.parseMs);
    lines.push(
      `<circle cx="${cx}" cy="${cy}" r="6" fill="${color}" stroke="${BG}" stroke-width="1.5"/>`,
      `<text x="${cx + 10}" y="${cy + 4}" fill="${TEXT}" font-size="11">${r.target.name}</text>`,
    );
  }

  // legend
  const legendX = PAD.l + 16;
  let legendY = PAD.t + 12;
  for (const tier of ["primary", "medium", "stress", "stretch"] as const) {
    lines.push(
      `<circle cx="${legendX}" cy="${legendY}" r="4" fill="${PALETTE[tier]}"/>`,
      `<text x="${legendX + 10}" y="${legendY + 4}" fill="${TEXT_DIM}" font-size="10">${tier}</text>`,
    );
    legendY += 14;
  }

  lines.push("</svg>");
  return lines.join("\n");
}

/**
 * Histogram: log-2-binned distribution of node degree (Ca + Ce) for a single
 * target. The long tail is the headline architectural finding the thesis
 * Chapter 4 needs to discuss.
 */
export function histogramDegrees(result: BenchResult): string {
  const W = 720;
  const H = 440;
  const PAD = { l: 64, r: 24, t: 28, b: 56 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const bins = logHistogram(result.degrees);
  const yMax = niceCeil(Math.max(1, ...bins.map((b) => b.count)));
  const yToPx = (v: number) => PAD.t + innerH - (innerH * v) / yMax;
  const barW = bins.length === 0 ? 0 : innerW / bins.length;

  const lines: string[] = [];
  lines.push(svgHeader(W, H));
  lines.push(`<rect width="${W}" height="${H}" fill="${BG}"/>`);
  lines.push(title(`Node-degree distribution · ${result.target.name}`, W / 2, 18));

  lines.push(
    `<line x1="${PAD.l}" y1="${PAD.t + innerH}" x2="${PAD.l + innerW}" y2="${PAD.t + innerH}" stroke="${AXIS}" stroke-width="1"/>`,
    `<line x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${PAD.t + innerH}" stroke="${AXIS}" stroke-width="1"/>`,
  );

  for (const t of ticks(yMax, 5)) {
    const y = yToPx(t);
    lines.push(
      `<line x1="${PAD.l - 4}" y1="${y}" x2="${PAD.l}" y2="${y}" stroke="${AXIS}"/>`,
      `<text x="${PAD.l - 8}" y="${y + 4}" fill="${TEXT_DIM}" font-size="10" text-anchor="end">${t}</text>`,
      `<line x1="${PAD.l}" y1="${y}" x2="${PAD.l + innerW}" y2="${y}" stroke="${AXIS}" stroke-opacity="0.3"/>`,
    );
  }

  const color = PALETTE[result.target.tier] ?? "#888";
  bins.forEach((bin, i) => {
    if (bin.count === 0) return;
    const x = PAD.l + i * barW;
    const y = yToPx(bin.count);
    const h = PAD.t + innerH - y;
    lines.push(
      `<rect x="${x + 1}" y="${y}" width="${Math.max(0, barW - 2)}" height="${h}" fill="${color}" fill-opacity="0.85"/>`,
      `<text x="${x + barW / 2}" y="${y - 4}" fill="${TEXT_DIM}" font-size="9" text-anchor="middle">${bin.count}</text>`,
    );
  });

  bins.forEach((bin, i) => {
    const x = PAD.l + i * barW + barW / 2;
    lines.push(
      `<text x="${x}" y="${PAD.t + innerH + 14}" fill="${TEXT_DIM}" font-size="10" text-anchor="middle">${bin.label}</text>`,
    );
  });

  lines.push(
    axisLabel("degree (Ca + Ce)", PAD.l + innerW / 2, H - 14, "middle"),
    axisLabel("module count", -(PAD.t + innerH / 2), 16, "middle", -90),
  );

  lines.push("</svg>");
  return lines.join("\n");
}

function svgHeader(w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif">`;
}

function title(text: string, x: number, y: number): string {
  return `<text x="${x}" y="${y}" fill="${TEXT}" font-size="13" font-weight="600" text-anchor="middle">${text}</text>`;
}

function axisLabel(
  text: string,
  x: number,
  y: number,
  anchor: "start" | "middle" | "end",
  rotate?: number,
): string {
  const transform = rotate !== undefined ? `transform="rotate(${rotate})"` : "";
  return `<text x="${x}" y="${y}" fill="${TEXT_DIM}" font-size="11" text-anchor="${anchor}" ${transform}>${text}</text>`;
}

function ticks(max: number, count: number): number[] {
  if (max <= 0) return [0];
  const step = max / count;
  const out: number[] = [];
  for (let i = 0; i <= count; i++) out.push(Math.round(step * i));
  return out;
}

function niceCeil(v: number): number {
  if (v <= 10) return Math.max(1, Math.ceil(v));
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

function formatLOC(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return String(v);
}

function formatMs(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${v}ms`;
}
