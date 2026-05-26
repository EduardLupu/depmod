import { readFileSync } from "node:fs";
import type { BenchTarget, BenchTier, TargetsFile } from "./types.js";

const TIERS: readonly BenchTier[] = ["primary", "medium", "stress", "stretch"];

export function loadTargets(path: string): TargetsFile {
  const raw: unknown = JSON.parse(readFileSync(path, "utf-8"));
  return validateTargets(raw);
}

export function validateTargets(raw: unknown): TargetsFile {
  if (!raw || typeof raw !== "object" || !("targets" in raw)) {
    throw new Error("targets file must be an object with a `targets` array");
  }
  const { targets } = raw as { targets: unknown };
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error("targets.targets must be a non-empty array");
  }

  const seen = new Set<string>();
  const out: BenchTarget[] = [];
  for (const entry of targets) {
    if (!entry || typeof entry !== "object") {
      throw new Error("each target must be an object");
    }
    const t = entry as Record<string, unknown>;
    const name = requireString(t.name, "name");
    if (seen.has(name)) throw new Error(`duplicate target name: ${name}`);
    seen.add(name);

    const repo = requireString(t.repo, "repo");
    if (!/^https:\/\/.+\.git$/.test(repo) && !/^git@.+:.+\.git$/.test(repo)) {
      throw new Error(`target ${name}: repo must be an https://…git or git@…:…git URL`);
    }

    const ref = t.ref === null || t.ref === undefined ? null : requireString(t.ref, "ref");
    const tier = requireTier(t.tier, name);
    const subdir =
      t.subdir === undefined || t.subdir === null
        ? undefined
        : requireString(t.subdir, "subdir").replace(/^\/+|\/+$/g, "");
    const description =
      t.description === undefined || t.description === null
        ? undefined
        : requireString(t.description, "description");
    const cacheName =
      t.cacheName === undefined || t.cacheName === null
        ? undefined
        : requireString(t.cacheName, "cacheName");

    out.push({
      name,
      repo,
      ref,
      tier,
      subdir: subdir || undefined,
      description,
      cacheName,
    });
  }
  return { targets: out };
}

export function filterTargets(
  targets: readonly BenchTarget[],
  options: { only: Set<string> | null; tier: BenchTier | null },
): BenchTarget[] {
  return targets.filter((t) => {
    if (options.only && !options.only.has(t.name)) return false;
    if (options.tier && t.tier !== options.tier) return false;
    return true;
  });
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`expected non-empty string for ${field}`);
  }
  return value.trim();
}

function requireTier(value: unknown, name: string): BenchTier {
  if (typeof value !== "string" || !TIERS.includes(value as BenchTier)) {
    throw new Error(`target ${name}: tier must be one of ${TIERS.join(", ")}`);
  }
  return value as BenchTier;
}
