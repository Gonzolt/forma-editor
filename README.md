# Forma

A little direction. A beautiful edit.

A Windows and macOS desktop foundation for an approachable, prompt-driven video editor. Built with Electron, React and TypeScript, with warm paper colors, local typography and the supplied hands illustration. Motion Kit is deliberately deferred.

![Forma main window](docs/preview.png)

## What works today

- Native frameless window with minimize, maximize, close and single-instance handling.
- Native file selection and whole-window file drop for video, audio and images.
- File metadata, duration when the codec supports it, source previews and removing attachments.
- Prompt composer, suggestions, `/` skill picker and `@` file mentions.
- Configurable skill registry, output aspect, target length and resolution.
- Templates, recent edit search, automatic local session/draft saving and restart recovery.
- Settings for Claude credentials, skills, export defaults, storage and shortcuts.
- API-key storage encrypted with Electron `safeStorage`; keys never enter saved projects or the renderer after saving.
- Explicit, cancelable **demo mode**, producing an example edit plan.
- Responsive layout, visible keyboard focus, modal focus management and reduced-motion support.

## What is intentionally pending

This is an application foundation, **not a functioning AI editing/rendering engine yet**. Demo progress is simulated. It does not inspect frames, transcribe audio, cut footage, add captions, generate music, send AI requests, render or export videos. The Saved videos page is an honest empty state. File previews depend on Electron's supported codecs; importing a MOV or MKV does not guarantee its codec can be previewed.

Claude account sign-in and execution, Motion Kit, voice dictation, a timeline editor and real export jobs are future integrations. A saved API key is not a verified connection. No external AI services are called and no footage is uploaded.

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
4. Open Settings → Claude → **Enable demo**. Close Settings.
5. Choose **Run edit** (`Ctrl/⌘ Enter`). Stop cancels the simulation. A completed demo creates an example plan and clearly states that no video was rendered.

## Build desktop packages

```sh
# Windows x64 installer, on Windows
npm run dist:win

# Apple Silicon, on macOS
npm run dist:mac -- --arm64

# Intel Mac, on macOS
npm run dist:mac -- --x64
```

Packages appear in `release/`. The GitHub Actions workflow builds Windows x64, macOS Apple Silicon and macOS Intel and uploads private workflow artifacts. It does not publish a release. The initial Windows installer is unsigned; macOS builds are not notarized. Public distribution should add platform signing credentials and notarization. A macOS build cannot be verified on Windows.

## Checks

```sh
npm test
npm run build
npm run test:desktop
```

Unit tests cover ordered atomic persistence, corrupt-data handling, import registration and IPC state validation. The Electron smoke test uses an isolated temporary profile and exercises import and actual protocol preview, encrypted key storage/removal, connection gating, skills, formats, demo cancellation/completion, templates, shortcuts, narrow layout and restart recovery. Screenshots are saved in `test-results/`. No real credentials or AI calls are used.

## Where things live

- `src/components/`: TitleBar, Sidebar, Workspace/Hero, Composer, SettingsModal.
- `src/theme.css`: colors and font tokens. All fonts ship locally.
- `src/lib/skills.ts`: declarative skill and template registries.
- `src/lib/engine.ts`: isolated demo adapter; replace with the real planning/rendering service.
- `src/lib/bridge.ts` and `src/types.ts`: typed UI/desktop boundary and browser fallback.
- `electron/main.cjs`: native services and validated IPC handlers.
- `electron/preload.cjs`: narrow, context-isolated bridge. No arbitrary filesystem, shell or IPC access is exposed.
- `electron/media.cjs`: supported imports and stable file registration.
- `electron/store.cjs`: bounded state validation and serialized atomic writes.
- `.github/workflows/desktop.yml`: per-platform test and package jobs.

Local data uses Electron's per-user app data directory (`%APPDATA%/forma-editor` on Windows; `~/Library/Application Support/forma-editor` on macOS). Projects, registered source paths, output preferences and encrypted credentials are separate files. Source media stays where you imported it. Missing media is marked for reimport. The future export folder defaults to Videos/Forma. No GPU capability is inferred or advertised.

## Next integration boundary

Replace `makeDemoPlan` and the simulated progress driver with a desktop job service exposing start, progress, cancel and verified output events. Keep provider secrets in the main process. Connect Claude authentication through its supported provider flow, and validate a connection before displaying it as connected. Add Motion Kit behind the same adapter later, without coupling it to the composer. Populate Saved videos only after checking that an actual output file exists.

## Design assets

The hands image was supplied for this project. Fonts are bundled through Fontsource; their licenses ship with the respective packages. The minimal ring-and-dot app icon is reproducible with `tools/create-icon.ps1` on Windows. The application has no analytics or remote font requests.
