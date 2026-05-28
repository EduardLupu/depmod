import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Monorepo root for file tracing so workspace packages (`@depmod/*`) resolve.
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const isStatic = process.env.DEPMOD_STATIC === "1";
const basePath = process.env.DEPMOD_BASE_PATH ?? "";

const config: NextConfig = {
  reactStrictMode: true,
  ...(isStatic
    ? { output: "export", basePath, trailingSlash: true }
    : { output: "standalone", outputFileTracingRoot: monorepoRoot }),
};

export default config;
