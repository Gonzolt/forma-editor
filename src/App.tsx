import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ArrowRight, Check, FolderOpen, Upload, X } from "lucide-react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { SidebarPanel } from "./components/SidebarPanel";
import { MotionKitStudio, SavedVideos } from "./components/MotionKitStudio";
import { useMotionKit } from "./lib/useMotionKit";
import { useUpdates } from "./lib/useUpdates";
import { Workspace } from "./components/Workspace";
import { SettingsModal } from "./components/SettingsModal";
import {
  accept,
  browserFiles,
  defaults,
  desktop,
  loadState,
  saveState,
} from "./lib/bridge";
import { makeDemoPlan, phases } from "./lib/engine";
import { templates } from "./lib/skills";
import type {
  AppState,
  EditJob,
  EditSession,
  MediaFile,
  Page,
  Preferences,
  SettingsTab,
} from "./types";

function createSession(p: Preferences): EditSession {
  return {
    id: crypto.randomUUID(),
    title: "Untitled edit",
    prompt: "",
    files: [],
    skills: ["auto"].filter((s) => p.enabledSkills.includes(s)),
    aspect: p.defaultAspect,
    length: "Auto",
    quality: p.defaultQuality,
    updatedAt: Date.now(),
  };
}
async function metadata(file: MediaFile): Promise<MediaFile> {
  if (file.kind === "image" || file.missing) return file;
  return new Promise((resolve) => {
    const element = document.createElement(
      file.kind === "audio" ? "audio" : "video",
    );
    const finish = () => {
      clearTimeout(timeout);
      const result = Number.isFinite(element.duration)
        ? { ...file, duration: element.duration }
        : file;
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute("src");
      element.load();
      resolve(result);
    };
    const timeout = setTimeout(finish, 4000);
    element.preload = "metadata";
    element.onloadedmetadata = finish;
    element.onerror = finish;
    element.src = file.url;
  });
}
export default function App() {
  const [state, setState] = useState<AppState>({
    sessions: [],
    preferences: defaults,
  });
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState("");
  const [page, setPage] = useState<Page>("editor");
  const [settings, setSettings] = useState<SettingsTab | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  // "edit" runs Claude Code and FFmpeg; "demo" is the offline simulation.
  const [runMode, setRunMode] = useState<"demo" | "edit">("demo");
  const [stage, setStage] = useState("");
  const [claudeReady, setClaudeReady] = useState(false);
  // Stop can arrive while the edit is still starting; remember it for when start settles.
  const starting = useRef<{ stopped: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const latest = useRef(state);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const saveRevision = useRef(0);
  const dragDepth = useRef(0);
  latest.current = state;
  const session =
    state.sessions.find((s) => s.id === state.activeId) || state.sessions[0];
  const working = progress !== null;
  const kit = useMotionKit(ready);
  const notify = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(""), 7500);
  }, []);
  const closeSettings = useCallback(() => setSettings(null), []);
  const updates = useUpdates(ready, notify);
  useEffect(() => {
    if (kit.job?.status === "completed")
      notify("MotionKit export ready. Your video is in Saved videos.");
    else if (kit.job?.status === "failed" || kit.job?.status === "cancelled")
      notify(kit.job.message);
  }, [kit.job?.id, kit.job?.status, notify]);
  useLayoutEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = state.preferences.theme;
    desktop
      ?.setTheme(state.preferences.theme)
      .catch(() => notify("Could not update the native window theme."));
  }, [ready, state.preferences.theme, notify]);
  useEffect(() => {
    let alive = true;
    loadState()
      .then((s) => {
        if (!alive) return;
        if (!s.sessions.length) {
          const session = createSession(s.preferences);
          s = { ...s, sessions: [session], activeId: session.id };
        }
        if (!s.sessions.some((x) => x.id === s.activeId))
          s.activeId = s.sessions[0].id;
        setState(s);
        setReady(true);
      })
      .catch((e) =>
        setFatal(
          e instanceof Error
            ? e.message
            : "Your workspace could not be loaded.",
        ),
      );
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const revision = ++saveRevision.current;
    setSaved(false);
    saveState(state)
      .then(() => {
        if (revision === saveRevision.current) {
          setSaved(true);
          setSaveError("");
        }
      })
      .catch(() => {
        setSaveError(
          "Changes could not be saved. Keep this window open and retry.",
        );
      });
  }, [state, ready]);
  useEffect(
    () =>
      desktop?.onCloseRequest(async () => {
        try {
          if (ready) await saveState(latest.current);
          await desktop?.closeReady();
        } catch {
          setSaveError(
            "Could not save before closing. Keep this window open and retry.",
          );
        }
      }),
    [ready],
  );
  const changeSession = (patch: Partial<EditSession>) =>
    setState((s) => ({
      ...s,
      sessions: s.sessions.map((x) =>
        x.id === s.activeId
          ? {
              ...x,
              ...patch,
              title: patch.prompt?.trim()
                ? patch.prompt.trim().slice(0, 38).replace(/\s+/g, " ")
                : x.title,
              updatedAt: Date.now(),
            }
          : x,
      ),
    }));
  const changePreferences = (patch: Partial<Preferences>) =>
    setState((s) => ({
      ...s,
      preferences: { ...s.preferences, ...patch },
      sessions: patch.enabledSkills
        ? s.sessions.map((x) => ({
            ...x,
            skills: x.skills.filter((id) => patch.enabledSkills!.includes(id)),
          }))
        : s.sessions,
    }));
  const newEdit = (template?: (typeof templates)[number]) => {
    if (working) return;
    if (
      state.sessions.filter((s) => s.files.length || s.prompt).length >= 100
    ) {
      notify(
        "Your library has 100 edits. Delete an older edit before starting another.",
      );
      return;
    }
    const next = createSession(state.preferences);
    if (template)
      Object.assign(next, {
        title: template.title,
        prompt: template.prompt,
        skills: template.skills.filter((id) =>
          state.preferences.enabledSkills.includes(id),
        ),
        aspect: template.aspect,
      });
    setState((s) => ({
      ...s,
      activeId: next.id,
      sessions: [next, ...s.sessions.filter((x) => x.files.length || x.prompt)],
    }));
    setPage("editor");
    setTimeout(
      () =>
        document.querySelector<HTMLTextAreaElement>("#edit-prompt")?.focus(),
      50,
    );
  };
  const addFiles = async (files: MediaFile[]) => {
    if (!files.length) {
      notify(
        "Choose video, audio or image files. Supported formats include MP4, MOV, WAV, PNG and JPEG.",
      );
      return;
    }
    const activeId = latest.current.activeId;
    const enriched = await Promise.all(files.slice(0, 100).map(metadata));
    setState((s) => ({
      ...s,
      sessions: s.sessions.map((x) =>
        x.id === activeId
          ? {
              ...x,
              plan: undefined,
              updatedAt: Date.now(),
              files: [
                ...x.files.filter((f) => !enriched.some((n) => n.id === f.id)),
                ...enriched,
              ].slice(0, 100),
            }
          : x,
      ),
    }));
    setPage("editor");
    notify(
      `${enriched.length} ${enriched.length === 1 ? "file" : "files"} added. Click a file to preview it.`,
    );
  };
  const importFiles = async () => {
    if (working) return;
    try {
      if (desktop) {
        const files = await desktop.importFiles();
        if (files.length) await addFiles(files);
      } else fileInput.current?.click();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not import those files.");
    }
  };
  const stop = () => {
    if (runMode === "edit") {
      setStage("Stopping");
      if (starting.current) starting.current.stopped = true;
      else void desktop?.edit.cancel().catch(() => {});
      return;
    }
    setProgress(null);
    notify("Demo stopped. Your brief and files are saved.");
  };
  const startDemo = () => {
    setRunMode("demo");
    setProgress(0);
  };
  const run = () => {
    if (!session) return;
    if (working) {
      stop();
      return;
    }
    if (!session.files.length) {
      notify("Add some footage first. Click the spark or attach a file.");
      return;
    }
    if (session.files.some((f) => f.missing)) {
      notify(
        "Some source files are missing. Remove them and reimport before continuing.",
      );
      return;
    }
    if (!session.prompt.trim()) {
      notify("Tell us what you have in mind, or try one of the suggestions.");
      document.querySelector<HTMLTextAreaElement>("#edit-prompt")?.focus();
      return;
    }
    setPage("editor");
    changeSession({ plan: undefined });
    if (!desktop) {
      startDemo();
      return;
    }
    setRunMode("edit");
    setStage("Starting");
    setProgress(0);
    const attempt = (starting.current = { stopped: false });
    desktop.edit
      .start({
        sessionId: session.id,
        prompt: session.prompt,
        fileIds: session.files.map((f) => f.id),
        skills: session.skills,
        aspect: session.aspect,
        length: session.length,
        quality: session.quality,
        model: state.preferences.defaultModel,
      })
      .then(() => {
        if (attempt.stopped) void desktop?.edit.cancel().catch(() => {});
      })
      .catch((error: unknown) => {
        setProgress(null);
        setStage("");
        if (attempt.stopped) {
          notify("Edit stopped. Your brief and files are saved.");
          return;
        }
        const message = (error instanceof Error ? error.message : "")
          .replace(/^.*?Error: /, "")
          .trim();
        if (message.startsWith("[claude-unavailable]")) {
          if (state.preferences.demoMode) {
            notify("Claude Code is not connected, so this run is the demo.");
            startDemo();
            return;
          }
          setSettings("Claude");
        }
        notify(
          message.replace(/^\[[\w-]+\] /, "") || "The edit could not start.",
        );
      })
      .finally(() => {
        if (starting.current === attempt) starting.current = null;
      });
  };
  useEffect(() => {
    if (!ready || !desktop) return;
    void desktop.claude
      .status()
      .then((s) => setClaudeReady(s.state === "signed-in"))
      .catch(() => {});
    return desktop.claude.onStatus((s) =>
      setClaudeReady(s.state === "signed-in"),
    );
  }, [ready]);
  useEffect(
    () =>
      desktop?.edit.onJob((job: EditJob) => {
        if (["completed", "failed", "cancelled"].includes(job.status)) {
          setProgress(null);
          setStage("");
          if (job.status === "completed" && job.plan) {
            const plan = job.plan;
            setState((s) => ({
              ...s,
              sessions: s.sessions.map((x) =>
                x.id === job.sessionId
                  ? { ...x, plan, updatedAt: Date.now() }
                  : x,
              ),
            }));
            void kit.refresh();
            notify("Your edit is ready. It is also in Saved videos.");
          } else notify(job.message);
        } else {
          setProgress(job.progress);
          setStage(job.message);
        }
      }),
    // kit.refresh and notify are stable callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    if (!working || !session || runMode !== "demo") return;
    const snapshot = session;
    const start = performance.now();
    const timer = setInterval(() => {
      const value = Math.min(100, (performance.now() - start) / 70);
      if (value >= 100) {
        clearInterval(timer);
        setProgress(null);
        setState((s) => ({
          ...s,
          sessions: s.sessions.map((x) =>
            x.id === snapshot.id
              ? { ...x, plan: makeDemoPlan(snapshot), updatedAt: Date.now() }
              : x,
          ),
        }));
        notify(
          "Demo complete. Your example edit plan is ready. No video was rendered.",
        );
      } else setProgress(value);
    }, 100);
    return () => clearInterval(timer);
    // A run uses a fixed snapshot. Changes are locked until it ends or is stopped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, runMode]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if ([",", "n", "o", "enter"].includes(key)) e.preventDefault();
      if (settings || document.querySelector('[role="dialog"]')) return;
      if (key === ",") setSettings("Claude");
      else if (key === "n") newEdit();
      else if (key === "o") void importFiles();
      else if (key === "enter") run();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = working ? "none" : "copy";
    };
    const leave = (e: DragEvent) => {
      e.preventDefault();
      if (--dragDepth.current <= 0) {
        dragDepth.current = 0;
        setDragging(false);
      }
    };
    const drop = async (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (working) {
        notify("Stop the edit before adding more files.");
        return;
      }
      if (!e.dataTransfer) return;
      try {
        const files = Array.from(e.dataTransfer.files);
        await addFiles(
          desktop
            ? await desktop.importDropped(files)
            : await browserFiles(files),
        );
      } catch (error) {
        notify(
          error instanceof Error
            ? error.message
            : "Could not import these files.",
        );
      }
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  });
  const deleteEdit = () => {
    if (
      !window.confirm(
        "Delete this edit session? Your source media will stay on your device.",
      )
    )
      return;
    const next = createSession(state.preferences);
    setState((s) => {
      const remaining = s.sessions.filter((x) => x.id !== s.activeId);
      return {
        ...s,
        sessions: remaining.length ? remaining : [next],
        activeId: remaining[0]?.id || next.id,
      };
    });
    notify("Edit deleted. Source files are unchanged.");
  };
  if (fatal)
    return (
      <div className="boot-error">
        <h1>Your workspace needs a moment.</h1>
        <p>{fatal}</p>
        <p>
          Existing data has been preserved. Restart Forma after checking the
          workspace files.
        </p>
        <button className="button" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!ready || !session)
    return (
      <div className="boot-loading">
        <span className="brand">forma.</span>
        <span className="eyebrow">OPENING YOUR WORKSPACE</span>
      </div>
    );
  return (
    <div className="app-shell">
      <TitleBar
        onSettings={() => setSettings("Claude")}
        onError={notify}
        onUpdates={() => setSettings("Updates")}
        updatesAvailable={updates.available}
        theme={state.preferences.theme}
        onToggleTheme={() =>
          changePreferences({
            theme: state.preferences.theme === "dark" ? "light" : "dark",
          })
        }
      />
      <div className="app-body">
        <SidebarPanel
          collapsed={state.preferences.sidebarCollapsed}
          onChange={(sidebarCollapsed) =>
            changePreferences({ sidebarCollapsed })
          }
        >
          <Sidebar
            sessions={state.sessions}
            activeId={session.id}
            page={page}
            demo={state.preferences.demoMode}
            connected={claudeReady}
            onPage={setPage}
            onNew={() => newEdit()}
            onSelect={(id) => {
              setState((s) => ({ ...s, activeId: id }));
              setPage("editor");
            }}
            onSettings={() => setSettings("Claude")}
            busy={working}
            filmCount={kit.status?.films.length || 0}
            videoCount={
              kit.status?.exports.filter((video) => !video.missing).length || 0
            }
          />
        </SidebarPanel>
        {page === "motionkit" ? (
          <MotionKitStudio
            status={kit.status}
            job={kit.job}
            busy={kit.busy}
            error={kit.error}
            onRefresh={kit.refresh}
            onNotice={notify}
            onLibrary={() => setPage("saved")}
          />
        ) : page === "saved" ? (
          <SavedVideos
            videos={kit.status?.exports || []}
            onMotionKit={() => setPage("motionkit")}
            onNotice={notify}
          />
        ) : (
          <Workspace
            page={page}
            session={session}
            preferences={state.preferences}
            progress={progress}
            onChange={changeSession}
            onImport={() => void importFiles()}
            onRun={run}
            running={working ? runMode : null}
            stage={stage}
            connected={claudeReady}
            onStop={stop}
            onMore={() => setSettings("Skills")}
            onNotice={notify}
            onTemplate={newEdit}
            onEditor={() => setPage("editor")}
            onDelete={deleteEdit}
          />
        )}
      </div>
      <footer className="statusbar">
        <div>
          <span
            className={`status-dot ${working || kit.busy ? "accent pulse" : "accent"}`}
          />
          <span>
            {kit.busy
              ? `MotionKit — ${kit.job?.message}`
              : working
                ? runMode === "edit"
                  ? `Editing — ${stage}`
                  : `Demo — ${phases[Math.min(3, Math.floor(progress / 25))]}`
                : "Ready — local workspace"}
          </span>
          <span className="status-separator" />
          <span className="save-status">
            {saveError ? (
              "SAVE FAILED"
            ) : saved ? (
              <>
                <Check size={11} />
                All changes saved
              </>
            ) : (
              "Saving…"
            )}
          </span>
        </div>
        <button
          title={state.preferences.outputDirectory || "Videos / Forma"}
          onClick={() =>
            void (desktop
              ? desktop
                  .openOutput()
                  .catch(() => notify("The output folder could not be opened."))
              : Promise.resolve(
                  notify("Open the desktop app to access the export folder."),
                ))
          }
        >
          <FolderOpen size={12} />
          <span>
            Output
            <ArrowRight size={11} />
            {state.preferences.outputDirectory
              ? state.preferences.outputDirectory
                  .split(/[\\/]/)
                  .slice(-2)
                  .join(" / ")
              : "Videos / Forma"}
          </span>
        </button>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <span className="toast-dot" />
          <p>{notice}</p>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {saveError && (
        <div className="save-error" role="alert">
          {saveError}
          <button
            className="button"
            onClick={() =>
              void saveState(latest.current)
                .then(() => {
                  setSaveError("");
                  setSaved(true);
                })
                .catch(() =>
                  notify(
                    "Saving is still unavailable. Check your available disk space.",
                  ),
                )
            }
          >
            Retry save
          </button>
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <Upload size={35} strokeWidth={1} />
          <h2>
            {working ? "An edit is in motion." : "A story is about to start."}
          </h2>
          <p>
            {working
              ? "Stop the edit before adding more footage."
              : "Drop your video, audio or images here."}
          </p>
        </div>
      )}
      {settings && (
        <SettingsModal
          initialTab={settings}
          preferences={state.preferences}
          onChange={changePreferences}
          onClose={closeSettings}
          onNotice={notify}
          onMotionKit={() => {
            closeSettings();
            setPage("motionkit");
          }}
          updates={{
            status: updates.status,
            onCheck: updates.check,
            onOpen: updates.open,
          }}
        />
      )}
      <input
        ref={fileInput}
        className="sr-only"
        tabIndex={-1}
        type="file"
        multiple
        accept={accept}
        onChange={async (e) => {
          try {
            const files = Array.from(e.target.files || []);
            if (files.length) await addFiles(await browserFiles(files));
          } catch {
            notify("Could not import these files.");
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
