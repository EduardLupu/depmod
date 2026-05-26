import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Monorepo root for file tracing so workspace packages (`@depmod/*`) resolve.
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
};

export default config;
