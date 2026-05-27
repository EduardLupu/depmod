---
"depmod-ui": patch
---

Fix `--watch` live reload: atomic session/progress writes so the dashboard's file watcher fires, directory-based `fs.watch`, tighter chokidar source globs, SSE + poll fallback for graph updates, and CI integration tests for the watch pipeline.
