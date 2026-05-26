---
"depmod-ui": minor
---

Add a daily background check for new `depmod-ui` versions. Print a one-line
notice on the user's next invocation when an upgrade is available. Uses
[`update-notifier`](https://github.com/yeoman/update-notifier) — the same
pattern npm itself uses ("New minor version of npm available!").

Respects `NO_UPDATE_NOTIFIER=1` and `--no-update-notifier` for CI scripts
and self-suppresses in non-TTY contexts. Cached at the OS-standard config
dir (e.g. `~/.config/configstore/update-notifier-depmod-ui.json`).
