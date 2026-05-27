---
"depmod-ui": patch
---

Fix npm installs: the published tarball was missing `dist/index.js` because `prepack` did not run the CLI build (`tsup`) before packing. `prepack` now runs `build` then `prepare-package`, and `prepublishOnly` runs the full monorepo build.
