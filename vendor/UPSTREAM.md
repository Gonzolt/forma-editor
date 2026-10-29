# MotionKit source

Source: https://github.com/Gonzolt/motionkit

Pinned commit: `0036c211a093183ae5d3f82e667ed63da31d8ac2`

`motionkit/` contains this commit's source, with text line endings normalized for packaging, including four example films, social campaigns, carousel rendering, copy checks, 29 editing guides and their supporting files. Forma seeds a writable per-user project. Upgrades create a new project copy, apply upstream changes only to unmodified files, and keep local edits plus the original project. External projects stay under the user's control.

Forma's native export adapter lives in `electron/motionkit.cjs` and follows the upstream `window.PK` frame contract. It replaces the platform-specific browser launcher with Electron's sandboxed Chromium, and ships FFmpeg through `ffmpeg-static`. Upstream's Python/voice workflows remain available in the project but are not installed or executed automatically by Forma.
