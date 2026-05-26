import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Scope test discovery to the package's own `test/` directory so cloned
    // OSS target repos under `.targets-cache/` (which contain their own
    // .test.ts / .spec.ts files) don't get sucked in.
    include: ["test/**/*.test.ts"],
    exclude: [".targets-cache/**", "node_modules/**", "dist/**"],
  },
});
