# MotionKit source

Source: https://github.com/Gonzolt/motionkit

Pinned commit: `4c8d08e78f8132a4525b4df2c34ef2b41110d66b`

`motionkit/` is an unmodified snapshot from this commit, including the example films, library, tools, editing skills and their supporting files. Forma copies it into a writable per-user project on first use. Existing user projects are never overwritten during an application upgrade.

Forma's native export adapter lives in `electron/motionkit.cjs` and follows the upstream `window.PK` frame contract. It replaces the platform-specific browser launcher with Electron's sandboxed Chromium, and ships FFmpeg through `ffmpeg-static`. Upstream's Python/voice workflows remain available in the project but are not installed or executed automatically by Forma.
