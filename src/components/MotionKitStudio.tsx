import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clapperboard,
  FolderOpen,
  Music2,
  Play,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { bytes, desktop, duration } from "../lib/bridge";
import type {
  KitExportOptions,
  KitGuide,
  KitJob,
  KitPreview,
  MediaFile,
  MotionKitStatus,
  VideoExport,
} from "../types";

interface Props {
  status: MotionKitStatus | null;
  job: KitJob | null;
  busy: boolean;
  error: string;
  onRefresh: () => Promise<void>;
  onNotice: (text: string) => void;
  onLibrary: () => void;
}
export function MotionKitStudio({
  status,
  job,
  busy,
  error,
  onRefresh,
  onNotice,
  onLibrary,
}: Props) {
  const [tab, setTab] = useState<"films" | "skills">("films");
  const [selected, setSelected] = useState("");
  const [preview, setPreview] = useState<KitPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [quality, setQuality] = useState<KitExportOptions["quality"]>("1080p");
  const [fps, setFps] = useState(30);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(0);
  const [audio, setAudio] = useState<MediaFile | null>(null);
  const [guide, setGuide] = useState<KitGuide | null>(null);
  const [search, setSearch] = useState("");
  const [watch, setWatch] = useState<VideoExport | null>(null);
  const [starting, setStarting] = useState(false);
  const previousProject = useRef("");
  useEffect(() => {
    if (!status) return;
    if (
      previousProject.current !== status.root ||
      !status.films.some((f) => f.id === selected)
    ) {
      previousProject.current = status.root;
      setSelected(status.films[0]?.id || "");
      setRefreshKey((n) => n + 1);
    }
  }, [status, selected]);
  useEffect(() => {
    if (!selected || !desktop) {
      setPreview(null);
      return;
    }
    let active = true;
    setPreview(null);
    setPreviewError("");
    desktop.motionKit
      .preview(selected)
      .then((result) => {
        if (active) {
          setPreview(result);
          setFrom(0);
          setTo(result.duration);
        }
      })
      .catch((error) => {
        if (active)
          setPreviewError(
            error instanceof Error
              ? error.message
              : "The film could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [selected, refreshKey]);
  const chooseProject = async () => {
    try {
      if (await desktop?.motionKit.chooseProject()) {
        await onRefresh();
        setRefreshKey((n) => n + 1);
      }
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "Could not open that project.",
      );
    }
  };
  const attachAudio = async () => {
    try {
      const files = await desktop?.importFiles();
      const track = files?.find((file) => file.kind === "audio");
      if (track) setAudio(track);
      else if (files?.length)
        onNotice(
          "Choose an audio file for the soundtrack, such as WAV, MP3 or M4A.",
        );
    } catch {
      onNotice("The soundtrack could not be imported.");
    }
  };
  const start = async () => {
    if (!preview || !desktop) return;
    setStarting(true);
    try {
      await desktop.motionKit.export({
        filmId: selected,
        quality,
        fps,
        from,
        to,
        ...(audio ? { audioId: audio.id } : {}),
      });
    } catch (error) {
      onNotice(
        error instanceof Error ? error.message : "The export could not start.",
      );
    } finally {
      setStarting(false);
    }
  };
  const matchingJob = job?.filmId === selected ? job : null;
  const rangeInvalid =
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to <= from ||
    to > (preview?.duration || 0) + 0.001;
  return (
    <main className="workspace kit-workspace">
      <div className="kit-heading">
        <div>
          <span className="eyebrow">MOTIONKIT · YOUR LOCAL STUDIO</span>
          <h1>
            A little motion.
            <br />
            <em>A finished film.</em>
          </h1>
          <p>
            Explore your films, read the editing guides, and export a real MP4.
          </p>
        </div>
        <div className="kit-project-actions">
          <button
            className="button"
            disabled={!desktop || busy}
            onClick={() => void chooseProject()}
          >
            <FolderOpen size={14} />
            Choose project
          </button>
          <button
            className="icon-button"
            aria-label="Refresh MotionKit project"
            disabled={busy}
            onClick={() => {
              void onRefresh();
              setRefreshKey((n) => n + 1);
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
      <div className="kit-project-row">
        <span className="eyebrow">PROJECT</span>
        <span className="kit-path" title={status?.root}>
          {status?.root || "Preparing your MotionKit workspace…"}
        </span>
        <button
          className="text-button"
          disabled={!status}
          onClick={() =>
            void desktop?.motionKit
              .openProject()
              .catch(() => onNotice("Could not open the project folder."))
          }
        >
          Open folder
          <FolderOpen size={12} />
        </button>
      </div>
      <div className="kit-tabs" role="group" aria-label="MotionKit sections">
        <button
          className={tab === "films" ? "active" : ""}
          onClick={() => setTab("films")}
        >
          <Clapperboard size={15} />
          Films <span className="mono">{status?.films.length || 0}</span>
        </button>
        <button
          className={tab === "skills" ? "active" : ""}
          onClick={() => setTab("skills")}
        >
          <BookOpen size={15} />
          Editing skills{" "}
          <span className="mono">{status?.guides.length || 0}</span>
        </button>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error}
          <button className="text-button" onClick={() => void onRefresh()}>
            Retry
          </button>
        </div>
      )}
      {!status && !error && (
        <p className="kit-loading" role="status">
          Preparing the included MotionKit project…
        </p>
      )}
      {status && tab === "films" && (
        <div className="kit-editor">
          <section className="kit-viewer">
            <div className="kit-viewer-header">
              <label>
                <span className="sr-only">MotionKit film</span>
                <select
                  aria-label="MotionKit film"
                  value={selected}
                  disabled={busy}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {status.films.map((film) => (
                    <option key={film.id} value={film.id}>
                      {film.brand} / {film.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="eyebrow">
                {preview
                  ? `${preview.width} × ${preview.height} · ${duration(preview.duration)}`
                  : "LOADING FILM"}
              </span>
            </div>
            <div className="kit-frame">
              {preview ? (
                <iframe
                  key={`${status.root}:${selected}:${refreshKey}`}
                  title="MotionKit film preview"
                  src={preview.url}
                  sandbox="allow-scripts allow-same-origin"
                  allow="autoplay"
                />
              ) : (
                <div className="kit-preview-placeholder">
                  <Clapperboard size={28} strokeWidth={1} />
                  <p>
                    {previewError ||
                      (status.films.length
                        ? "Loading your film…"
                        : "This project has no films yet. Add a film to its brands folder, then refresh.")}
                  </p>
                </div>
              )}
            </div>
            <div className="kit-preview-note">
              <span className="status-dot accent" />
              <span>
                Live MotionKit preview. Use the film’s player to play and scrub.
              </span>
            </div>
          </section>
          <section
            className="kit-export-panel"
            aria-labelledby="kit-export-title"
          >
            <span className="eyebrow">FROM PREVIEW TO MP4</span>
            <h2 id="kit-export-title">Make it a video.</h2>
            <p>
              Export the selected film as it is. Its original aspect ratio stays
              intact.
            </p>
            <div className="kit-fields">
              <label>
                Resolution
                <select
                  aria-label="MotionKit export quality"
                  disabled={busy}
                  value={quality}
                  onChange={(e) =>
                    setQuality(e.target.value as KitExportOptions["quality"])
                  }
                >
                  <option value="360p">360p · quick preview</option>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="4K">4K</option>
                </select>
              </label>
              <label>
                Frame rate
                <select
                  aria-label="MotionKit frame rate"
                  disabled={busy}
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                >
                  {[24, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n} fps
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <span className="field-label">
              Export range <span className="field-hint">SECONDS</span>
            </span>
            <div className="kit-fields kit-range">
              <label>
                From
                <input
                  aria-label="MotionKit start time"
                  type="number"
                  min={0}
                  max={preview?.duration}
                  step="0.1"
                  disabled={busy || !preview}
                  value={from}
                  onChange={(e) => setFrom(e.target.valueAsNumber)}
                />
              </label>
              <label>
                To
                <input
                  aria-label="MotionKit end time"
                  type="number"
                  min="0.01"
                  max={preview?.duration}
                  step="0.1"
                  disabled={busy || !preview}
                  value={to}
                  onChange={(e) => setTo(e.target.valueAsNumber)}
                />
              </label>
            </div>
            <span className="field-label">Soundtrack</span>
            <div className="kit-audio">
              <Music2 size={15} />
              <span>{audio?.name || "No soundtrack · silent video"}</span>
              {audio ? (
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label="Remove MotionKit soundtrack"
                  onClick={() => setAudio(null)}
                >
                  <X size={14} />
                </button>
              ) : (
                <button
                  className="text-button"
                  disabled={busy || !desktop}
                  onClick={() => void attachAudio()}
                >
                  Attach
                </button>
              )}
            </div>
            <p className="field-help">
              Attach a finished audio mix to include sound. Voice and music are
              not generated automatically.
            </p>
            {!status.encoderReady && (
              <p className="inline-error">
                FFmpeg is missing. Reinstall Forma or run npm ci from source.
              </p>
            )}
            <button
              className={`button kit-export-button ${busy ? "outline" : "primary"}`}
              disabled={
                starting ||
                (!busy && (!preview || rangeInvalid || !status.encoderReady))
              }
              onClick={() =>
                void (busy
                  ? desktop?.motionKit
                      .cancel()
                      .catch(() => onNotice("Could not stop the export."))
                  : start())
              }
            >
              {busy ? (
                <>
                  <Square size={12} fill="currentColor" />
                  Stop export
                </>
              ) : (
                <>
                  {starting ? "Starting…" : "Export MP4"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
            {matchingJob && (
              <div
                className={`kit-job kit-job-${matchingJob.status}`}
                role="status"
              >
                <div className="kit-job-label">
                  <span>
                    {matchingJob.status === "completed" ? (
                      <Check size={14} />
                    ) : null}
                    {matchingJob.message}
                  </span>
                  <span className="mono">
                    {Math.floor(matchingJob.progress)}%
                  </span>
                </div>
                {busy && (
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label="MotionKit export progress"
                    aria-valuenow={matchingJob.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span style={{ width: `${matchingJob.progress}%` }} />
                  </div>
                )}
                {matchingJob.total > 0 && busy && (
                  <p className="field-help">
                    {matchingJob.frame} / {matchingJob.total} frames
                  </p>
                )}
                {matchingJob.result && matchingJob.status === "completed" && (
                  <div className="kit-finished-actions">
                    <button
                      className="button"
                      onClick={() => setWatch(matchingJob.result!)}
                    >
                      <Play size={13} />
                      Watch video
                    </button>
                    <button className="text-button" onClick={onLibrary}>
                      Saved videos
                      <ArrowRight size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="kit-honesty-note">
              The editor prompt does not change these films yet. Open the
              project folder to edit their source, then refresh the preview.
            </div>
          </section>
        </div>
      )}
      {status && tab === "skills" && (
        <section className="kit-guides">
          <div className="kit-guides-heading">
            <div>
              <h2>A thoughtful set of tools.</h2>
              <p>
                Editing, captions, sound, motion and finishing guides from your
                MotionKit repository.
              </p>
            </div>
            <label>
              <span className="sr-only">Search MotionKit skills</span>
              <input
                type="search"
                placeholder="Find a skill…"
                aria-label="Search MotionKit skills"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="kit-guide-grid">
            {status.guides
              .filter((guide) =>
                `${guide.name} ${guide.name.replace(/-/g, " ")} ${guide.description}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((guide) => (
                <button
                  key={guide.id}
                  className="kit-guide-card"
                  onClick={() => setGuide(guide)}
                >
                  <BookOpen size={17} />
                  <h3>{guide.name.replace(/-/g, " ")}</h3>
                  <p>{guide.description}</p>
                  <span>
                    Read guide
                    <ArrowRight size={14} />
                  </span>
                </button>
              ))}
          </div>
          <p className="kit-honesty-note">
            These are the repository’s real instructions and supporting
            workflows. Reading a guide does not run its scripts or connect an AI
            agent.
          </p>
        </section>
      )}
      {guide && (
        <NativeDialog
          title={guide.name.replace(/-/g, " ")}
          onClose={() => setGuide(null)}
        >
          <pre className="kit-guide-text">{guide.content}</pre>
        </NativeDialog>
      )}
      {watch && (
        <NativeDialog title="Export preview" onClose={() => setWatch(null)}>
          <video className="kit-watch-video" controls src={watch.url} />
          <p className="field-help">
            {watch.name} · {bytes(watch.size)}
          </p>
        </NativeDialog>
      )}
    </main>
  );
}

export function NativeDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="kit-dialog"
      role="dialog"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const rect = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="kit-dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close MotionKit dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function SavedVideos({
  videos,
  onMotionKit,
  onNotice,
}: {
  videos: VideoExport[];
  onMotionKit: () => void;
  onNotice: (message: string) => void;
}) {
  return (
    <main className="workspace">
      <div className="library-page">
        <span className="eyebrow">THE FINISHED WORK</span>
        <h1>
          Your story, <em>ready to share.</em>
        </h1>
        <p>Finished edits and MotionKit exports, saved on this device.</p>
        {videos.length ? (
          <div className="kit-export-grid">
            {videos.map((video) => (
              <article className="kit-video-card" key={video.id}>
                {video.missing ? (
                  <div className="kit-video-missing">
                    This video has moved or is no longer available.
                  </div>
                ) : (
                  <video
                    controls
                    preload="metadata"
                    aria-label={`Play ${video.name}`}
                    src={video.url}
                  />
                )}
                <div className="kit-video-copy">
                  <h2>{video.title}</h2>
                  <p className="mono">
                    {duration(video.duration)} · {video.width} × {video.height}{" "}
                    · {video.fps} fps
                  </p>
                  <p>
                    {video.hasAudio ? "With soundtrack" : "Silent video"} ·{" "}
                    {bytes(video.size)}
                  </p>
                  <button
                    className="button"
                    disabled={video.missing}
                    onClick={() =>
                      void desktop?.motionKit
                        .revealExport(video.id)
                        .catch(() =>
                          onNotice("The export could not be located."),
                        )
                    }
                  >
                    <FolderOpen size={14} />
                    Show in folder
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="saved-empty">
            <div className="empty-icon">
              <Clapperboard size={30} strokeWidth={1} />
            </div>
            <h2>Let’s make something move.</h2>
            <p>
              Run an edit or export a MotionKit film, and your finished video
              will appear here.
            </p>
            <button className="button primary" onClick={onMotionKit}>
              Open MotionKit
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
