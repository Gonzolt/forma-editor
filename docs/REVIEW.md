# Forma integration review

This review covered Claude connection/setup, the Electron IPC boundary, MotionKit project lifecycle, preview and export, the main editing engine, update reporting, local persistence, the principal UI flows, and production npm dependencies.

## Fixed

| Finding                                                                                                 | Change                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A stale saved Claude path hid otherwise valid installations.                                            | Discovery falls back to native/Homebrew/WinGet/PATH locations; rediscovery is a button rather than a file picker.                                                                                                             |
| Missing Claude Code sent users into a terminal/setup-guide workflow.                                    | Guided install downloads the official native bootstrap, validates size and SHA256, installs the stable channel, then starts browser sign-in. Downloads and sign-in can be cancelled.                                          |
| API-key controls competed with the account flow even though edits do not use that key.                  | Account connection is primary; API-key storage is in a clearly labelled advanced section.                                                                                                                                     |
| Existing MotionKit workspaces never received bundled updates; status reported a hardcoded old revision. | Versioned project-copy migration, canonical file manifests, local-edit preservation, conflict reporting, original-project retention, and actual tracked base revision. External projects are not overwritten.                 |
| The new upstream social layer was unavailable in Forma.                                                 | Native campaign variant preview/export, vertical/feed/square formats, full-resolution carousel PNG export, and upstream post-copy checks/clipboard handoff. Four films and 29 guides ship with the app.                       |
| Edits and MotionKit exports had separate locks and could compete concurrently.                          | A shared job gate reserves asynchronous preflight, prevents competing jobs, and is drained before shutdown.                                                                                                                   |
| An account could appear ready while a new sign-in was pending.                                          | Pending setup/sign-in is excluded from edit readiness; account changes are blocked while an edit is running.                                                                                                                  |
| Process timeouts could resolve as ordinary exit results.                                                | Explicit timeout errors and a nonzero-exit check for the Claude planner.                                                                                                                                                      |
| The planner used a broad read-tool allow rule.                                                          | Reads are allowed under its generated working directory, with Claude Code's outside-working-directory block, hooks/connectors disabled and no extra MCP configuration. This is CLI permission enforcement, not an OS sandbox. |
| Main-editor export verification read only headers.                                                      | Full H.264/AAC decode is required before the final rename and library registration; a failed decode leaves no saved output.                                                                                                   |
| New carousel exports could hang on renderer initialization or show cropped previews.                    | Navigation precedes debugger commands, module readiness is awaited, protocol commands have deadlines, and preview fitting waits for the rendered slide.                                                                       |
| Sidebar version and some connection/help text were stale.                                               | Version comes from the package metadata; help text describes the current real editing and update flows.                                                                                                                       |

## Verification

Packaged-app checks caught an omitted upstream placeholder that prevented strict project migration from starting. The package hook now restores missing tracked resources and verifies the full MotionKit manifest before producing an installer.

- Production dependency audit: no reported npm production advisories at review time; this does not audit FFmpeg/Chromium independently.
- Unit checks: persistence/IPC validation, discovered/expired paths, installer integrity and command boundaries, project migration/manifests, variant/crop/copy data validation, job reservation and existing edit-plan logic.
- Claude UI checks use an isolated installation/authentication fixture, covering setup cancellation, browser handoff, token isolation, both themes, rediscovery, restart and explicit sign-out. They do not install software or change a real account.
- Native social checks render a selected variant into an actual H.264 MP4 with a 4:5 crop, export six distinct 1080×1350 PNGs, verify cancellation cleanup, check copy and intercept the clipboard handoff without changing the user's clipboard.
- Main-editor checks use generated video/audio and a deterministic test planner: actual source analysis/contact sheets, H.264/AAC rendering, full decode, cancellation, and rejecting a failed decode before library registration. No paid Claude calls are used.
- Existing desktop, MotionKit, update and upstream MotionKit tests are retained. Platform release builds run these checks before publication.

## Remaining product limits

- Raw-footage editing plans from contact sheets and measurements. It is not frame-by-frame visual reasoning and does not currently transcribe speech for automatic captions.
- New campaigns are authored in project JSON/HTML. Bulk matrices, in-app campaign authoring, Python voice/transcription setup and social-account publishing remain separate workflows; the native studio does not pretend to run them.
- Copy checks use the upstream presets. Platform limits and safe zones can change; preview the destination app before publishing.
- Model usage follows the connected Claude Code account. Tests validate the integration without making paid model calls or completing a new human OAuth login.
- Editing checks for Claude Code 2.1.257 or later before sending footage, because older releases lack the outside-working-directory read block. Organization-managed configuration still applies. [Official permission setting](https://code.claude.com/docs/en/settings-reference#permissions-blockreadsoutsideworkingdirectories).
- Installers remain unsigned/unnotarized until platform signing credentials are configured.
