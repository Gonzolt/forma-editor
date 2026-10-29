# Forma

A little direction. A beautiful edit.

A Windows and macOS desktop foundation for an approachable, prompt-driven video editor. Built with Electron, React and TypeScript, with warm paper colors, local typography and the supplied hands illustration. MotionKit is now integrated for live film previews, editing guides and native MP4 exports.

![Forma main window](docs/preview.png)

<details>
<summary>Dark mode preview</summary>

![Forma in dark mode](docs/dark-mode.png)

</details>

<details>
<summary>MotionKit studio preview</summary>

![MotionKit studio in Forma](docs/motionkit.png)

</details>

## What works today

- Native frameless window with minimize, maximize, close and single-instance handling.
- Light and dark modes using the sun/moon control in the title bar. Your choice is saved locally.
- A sliding sidebar: click the edge arrow, use Enter/Space, or drag it inward/outward. Its position is remembered between launches.
- Native file selection and whole-window file drop for video, audio and images.
- File metadata, duration when the codec supports it, source previews and removing attachments.
- Prompt composer that widens for longer briefs and grows with wrapped text, with bounded scrolling, suggestions, `/` skill picker and `@` file mentions.
- Configurable skill registry, output aspect, target length and resolution.
- Templates, recent edit search, automatic local session/draft saving and restart recovery.
- Settings for Claude credentials, skills, export defaults, storage and shortcuts.
- API-key storage encrypted with Electron `safeStorage`; keys never enter saved projects or the renderer after saving.
- Guided Claude connection: automatic discovery, checksum-verified installation when needed, browser sign-in, connection refresh and cancellation. No executable or credential file picker is required. Credentials remain managed by Claude Code.
- **Run edit** makes real videos: Claude Code plans the cut from still frames of your footage and Forma renders it with the bundled FFmpeg (see below).
- A cancelable **demo mode** for when Claude Code is not connected, producing an example plan.
- A real MotionKit studio with four bundled films, a live player, all 29 upstream editing guides, a project-folder picker and refresh after source edits.
- MotionKit Social studio: choose hook/message/CTA combinations, preview and export a selected promo as 9:16, 4:5 or 1:1 MP4, export carousel slides as full-resolution PNGs, and review/copy campaign posts with the upstream platform/brand checks.
- Safe bundled-workspace upgrades in a new copy, preserving user edits, conflicts and the previous project. External projects stay untouched; **Use included MotionKit** opens a fresh bundled project.
- Native H.264 MP4 exports at 360p/720p/1080p/4K and 24/30/60 fps, with a selectable time range, optional AAC soundtrack, actual frame progress and cancellation.
- Finished exports in Saved videos, with playback, file reveal and recovery after restart.
- Automatic launch checks for stable Forma releases and the latest MotionKit commit on their public GitHub repositories, with an update indicator and Settings → Updates.
- Responsive layout, visible keyboard focus, modal focus management and reduced-motion support.

## What is intentionally pending

Run edit does not transcribe speech (so no automatic captions), add sound effects, interpolate frames, or apply glitch and RGB-split effects; Claude says so in the plan's notes when a brief asks for them. Clip timings come from still frames, so cuts can be off by about a frame interval. It does not rewrite MotionKit films. File previews depend on Electron's supported codecs; importing a MOV or MKV does not guarantee its codec can be previewed.

Voice dictation and a timeline editor are pending. A saved API key is not used for edits; Run edit uses your Claude Code sign-in. MotionKit's guides are readable in the app, and their supporting scripts are included in the working project; they are not automatically installed or executed. Video files are never uploaded: Claude receives your brief, file names, measurements and JPEG contact sheets of still frames.

## How Run edit works

1. **Look.** For each attached file Forma reads its duration, size and frame rate with FFmpeg and draws contact sheets of still frames (hardware-decoded where available). Music gets loudness levels, onset/beat times and a likely drop. With **Silence cut** on, speech pauses are measured.
2. **Plan.** Forma runs your installed Claude Code in print mode (`claude -p`) with your brief, the measurements and read-only access to the contact sheets, and the model chosen under Settings → Claude. MCP servers, plugins, hooks and your Claude Code settings are not loaded, and only the Read and Glob tools are available. Claude returns a structured edit decision list.
3. **Render.** Forma checks the plan against the real sources, then renders it with FFmpeg in one pass: clip trims in timeline order, fill or fit-with-blurred-background framing for the chosen aspect ratio, speed changes and freeze frames, zoom punches, camera shake, white flashes, motion blur, per-clip moods, one overall grade with optional vignette and grain, dip-to-black transitions, text overlays, and the chosen music mixed over the clips' own sound. Output is H.264/AAC MP4 at the chosen resolution, 60 fps when any source is 50 fps or more and 30 fps otherwise.
4. **Finish.** The video is checked, saved to your output folder and added to **Saved videos**; the plan card shows it with Claude's steps and notes. **Stop** cancels at any stage and removes unfinished files.

Runs use your Claude Code plan's usage.

## Sign in through Claude Code

1. Open **Settings → Claude**. Forma finds an existing installation and signed-in account automatically, including standard native, Homebrew and WinGet locations. Stale saved paths no longer hide a working installation.
2. Choose **Connect Claude** or **Install & connect Claude**. If installation is needed, Forma downloads the native bootstrap binary from Anthropic's fixed official release endpoint, verifies its exact size and SHA256 against the release manifest, and runs the official `install stable` bootstrap command. Then finish the browser sign-in. No shell commands or location files are required. **Repair & connect Claude** can restore a broken installation.
3. **Check connection** reads `claude auth status --json`. Forma exposes only the account email, plan and authentication method. Credentials and refresh remain with Claude Code. A successful check describes the CLI's saved authentication status, not an end-to-end model request. Editing requires Claude Code 2.1.257 or later for restricted file reads; **Connection options → Update or repair Claude Code** updates an existing installation while retaining its account.
4. **Cancel connection** stops a pending installation or sign-in without signing out an existing account. **Connection options** contains automatic rediscovery, the setup guide, account switching and explicit shared-account sign-out. API-key storage is optional and lives under a separate advanced disclosure; Run edit does not use that key.

This companion uses your existing Claude Code installation and account configuration. It does not bundle Claude Code or reuse its OAuth tokens for API calls. Anthropic's [CLI reference](https://code.claude.com/docs/en/cli-reference) describes these commands. Run edit starts the same installed CLI in print mode under your account; see "How Run edit works".

## MotionKit workflow

1. Choose **MotionKit** in the sidebar. On first use, Forma seeds a writable MotionKit project in its app data folder from the pinned source snapshot. Existing projects are preserved during upgrades.
2. Choose a film. The embedded upstream player supports playback, scrubbing, looping and safe-zone guides.
3. Choose **Editing skills** to read and search the actual upstream guides, including `motionkit`, `i-hate-editing`, captions, effects, editing, audio and finishing.
4. Use **Open folder** to edit the real project files, or **Choose project** to select an existing MotionKit checkout. Refresh reloads the film list and preview. Films retain MotionKit's deterministic `render(t)` and `window.PK` contract.
5. Choose a resolution, frame rate and time range, then **Export MP4**. Its authored aspect ratio is preserved. If you attach a soundtrack, it is aligned with the film timeline, padded or trimmed to the exported range, and muxed as AAC. Without an attached soundtrack, the export is silent; in-film browser audio is not captured.
6. Watch real frame progress or choose **Stop export**. An unfinished encode is removed rather than added to your library. A successful encode is checked with FFmpeg before its final filename and Saved videos record are created.

Forma uses Electron's bundled Chromium and a bundled FFmpeg executable for this path. It needs no system Node, Chrome, Python, FFmpeg or WSL when installed. Advanced upstream Python, voice, transcription and third-party workflows still have their own dependencies and are not part of the native film export path. External network assets are blocked in the sandboxed film renderer; keep a film's assets inside its project.

Choose **MotionKit → Social studio** to use the new campaign layer. The included launch brief has three hooks, two messages and two CTAs (12 combinations); each selected combination is actually passed to the film's `?v=` parameter for preview and export. Feed and square exports crop the rendered frames; preview crop guides are omitted from exports. **Carousel slides** previews any slide and exports all six as 1080×1350 PNGs. **Post copy** uses the reviewed bundled `checkPost()` helper on campaign data, never JavaScript from a chosen project; copying is local and nothing is posted to a social account.

Campaign content remains project-authored JSON/HTML. Bulk variant matrices, campaign authoring through an agent, Python voice/transcription and external account publishing are not exposed as native UI workflows. The supporting upstream sources and four new skill guides are included.

The native adapter also fixes the stage's grid sizing in served HTML, so the authored canvas stays centered in small previews and lower-resolution exports. It does not change the user's source files.

## Startup update checks

Both [Forma](https://github.com/Gonzolt/forma-editor) and [MotionKit](https://github.com/Gonzolt/motionkit) are public GitHub repositories.

Every application launch, including reopening the window on macOS, starts a background check:

- **Forma:** query GitHub's latest published, stable release and compare its semantic version with the installed app. Drafts and prereleases are excluded. **View Forma release** opens the official version's release page to download the appropriate installer.
- **MotionKit:** query the latest commit on the repository's default branch. Managed copies compare against their bundled base revision. Existing Git checkouts read their loose/packed/worktree HEAD without requiring a Git executable. A project with no readable revision is labeled untracked rather than up to date. **View MotionKit changes** opens the upstream commit history.

Results appear in **Settings → Updates**, with a title-bar indicator and one notification when a different version is found. **Check for updates** retries both checks. Cached ETags reduce repeated transfers; a 12-second network deadline, offline handling and rate-limit messages keep the editor available. Requests use public GitHub metadata; footage and credentials stay local.

GitHub checks are read-only. Install the downloaded Forma release when ready. A new Forma version upgrades its managed MotionKit project using the included snapshot, preserving local edits and retaining the original folder. To use newer upstream code before an app release, review it and choose an updated external project in the studio. The update checker never downloads or executes repository code automatically.

## Publishing the next app version

Update `package.json` and its lockfile, commit the tested changes, then push a matching stable tag such as `v0.4.1`. `.github/workflows/release.yml` validates that the tag matches the package version, creates a draft release, tests/builds Windows x64 and both Mac architectures, uploads installers directly to that release, and publishes it after all builds succeed. Only published stable releases become the launch check's latest version. Regular branch builds continue to avoid publishing.

Installers remain unsigned/not notarized until platform signing is configured. Release installation is manual; no application binary is downloaded or executed by the update checker.

## Run locally

Use Node.js 24 and Git.

```sh
npm ci
npm run dev
```

Or build once and launch the desktop app:

```sh
npm run build
npm start
```

`npm run dev:web` opens the UI development server at `http://127.0.0.1:5173`. The browser preview supports file inputs and draft metadata; native dialogs, durable source-file access, OS encryption and window controls require Electron. Reimport browser files after reloading.

## Try the workflow

1. Attach media with the spark button, paperclip, `Ctrl/⌘ O`, or a file drop.
2. Click an attached file to preview it.
3. Write a brief or choose a suggestion. Select skills and an output format.
4. Sign in under Settings → Claude (see above), then choose **Run edit** (`Ctrl/⌘ Enter`). Progress shows each stage; **Stop** cancels. The finished video plays in the plan card and appears in Saved videos.
5. Without a Claude Code sign-in, Run edit opens Settings → Claude. If **Enable demo** is on there, it runs the simulated demo instead, which creates an example plan and states that no video was rendered.

## Build desktop packages

```sh
# Windows x64 installer, on Windows
npm run dist:win

# Apple Silicon, on macOS
npm run dist:mac -- --arm64

# Intel Mac, on macOS
npm run dist:mac -- --x64
```

Packages appear in `release/`. The GitHub Actions workflow tests and builds Windows x64, macOS Apple Silicon and macOS Intel. To download private workflow artifacts, run it manually with **Upload installers and screenshots** enabled; this requires available GitHub artifact storage. Routine push builds do not upload artifacts. It does not publish a release. The initial Windows installer is unsigned; macOS builds are not notarized. Public distribution should add platform signing credentials and notarization. A macOS build cannot be verified on Windows.

## Checks

```sh
npm test
npm run build
npm run test:desktop
npm run test:motionkit
npm run test:updates
npm run test:claude
npm run test:social
npm run test:edit
```

Unit tests cover persistence, import registration, IPC state validation, the pinned MotionKit films/guides and project asset boundaries. Desktop smoke tests use isolated temporary profiles. They check the original editor and appearance controls, and additionally render actual MotionKit frames, reject empty black frames, decode the resulting H.264 MP4, test AAC soundtrack muxing, cancel an active render, play a finished export and restore the library after restart. Screenshots and a short rendered test film are saved in `test-results/`. No real credentials or AI calls are used.

## Where things live

- `src/components/`: TitleBar, Sidebar, Workspace/Hero, Composer, SettingsModal.
- `src/theme.css`: colors and font tokens. All fonts ship locally.
- `src/lib/skills.ts`: declarative skill and template registries.
- `src/lib/engine.ts`: isolated offline demo adapter; real editing uses `electron/edit-engine.cjs`.
- `src/lib/bridge.ts` and `src/types.ts`: typed UI/desktop boundary and browser fallback.
- `electron/main.cjs`: native services and validated IPC handlers.
- `electron/preload.cjs`: narrow, context-isolated bridge. No arbitrary filesystem, shell or IPC access is exposed.
- `electron/media.cjs`: supported imports and stable file registration.
- `electron/store.cjs`: bounded state validation and serialized atomic writes.
- `electron/motionkit.cjs`: sandboxed offscreen Chromium frame rendering, FFmpeg jobs, cancellation and verified export history.
- `electron/motionkit-workspace.cjs` and `motionkit-revisions.json`: version-aware, edit-preserving project upgrades and canonical upstream file manifests.
- `electron/motionkit-social.cjs`: bounded campaign loading, validated variants, carousel metadata, trusted copy checks and feed crops.
- `electron/claude-connection.cjs` and `claude-install.cjs`: automatic discovery, guided native installation, browser sign-in and account metadata.
- `electron/job-gate.cjs`: shared preflight reservation and cross-engine render exclusivity.
- `electron/kit-project.cjs`: project discovery, skill loading and constrained local asset serving.
- `electron/updates.cjs`: public GitHub release/commit checks, ETag cache, version comparison and Git revision reading.
- `vendor/motionkit/` and `vendor/UPSTREAM.md`: pinned original upstream source and provenance.
- `tools/prepare-ffmpeg.cjs` and `tools/before-pack.cjs`: install and package the encoder for the correct OS/CPU target, including Intel builds made on Apple Silicon.
- `.github/workflows/desktop.yml`: per-platform test and package jobs.
- `.github/workflows/release.yml` and `tools/release-assets.cjs`: stable tag validation and public release installers.

Local data uses Electron's per-user app data directory (`%APPDATA%/forma-editor` on Windows; `~/Library/Application Support/forma-editor` on macOS). Projects, source paths, output preferences, verified export history and encrypted credentials are separate files. Bundled MotionKit workspaces live in versioned `motionkit-projects/` folders. An upgrade copies the current managed workspace, applies upstream changes only to unmodified files, preserves local edits and reports conflicts; the original project is kept. Older `motionkit/` workspaces migrate automatically. Selecting an external project stores its location without changing its source. Source media stays where it was imported. Missing media is marked for reimport. Video and carousel exports default to the operating system's video folder under Forma.

## Next integration boundary

Real raw-footage editing already uses Claude Code and FFmpeg. Further work is campaign/film authoring in the app, local speech transcription and captions, batch variant queues, and platform signing/notarization. The review findings and verification scope are recorded in [docs/REVIEW.md](docs/REVIEW.md).

## Design assets

The hands image was supplied for this project. Fonts are bundled through Fontsource; their licenses ship with the respective packages. The minimal ring-and-dot app icon is reproducible with `tools/create-icon.ps1` on Windows. MotionKit's source and asset provenance is in `vendor/UPSTREAM.md`. The `ffmpeg-static` package includes its binary's license and build information, which ship alongside the unpacked encoder. The application has no analytics or remote font requests.
