import {
  ArrowDown,
  ArrowRight,
  Check,
  Film,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { EditSession, MediaFile, Page, Preferences } from "../types";
import { bytes, duration } from "../lib/bridge";
import { templates } from "../lib/skills";
import { Composer } from "./Composer";
import { useEffect, useRef, useState } from "react";
interface Props {
  page: Page;
  session: EditSession;
  preferences: Preferences;
  progress: number | null;
  onChange: (p: Partial<EditSession>) => void;
  onImport: () => void;
  onRun: () => void;
  onStop: () => void;
  onMore: () => void;
  onNotice: (s: string) => void;
  onTemplate: (t: (typeof templates)[number]) => void;
  onEditor: () => void;
  onDelete: () => void;
}
export function Workspace(props: Props) {
  const { page, session, progress, onImport, onNotice } = props;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = session.files.find((f) => f.id === previewId);
  const total = session.files.reduce((n, f) => n + f.size, 0);
  const seconds = session.files.reduce((n, f) => n + (f.duration || 0), 0);
  return (
    <main className={`workspace page-${page}`}>
      <i className="crop crop-tl" />
      <i className="crop crop-tr" />
      <i className="crop crop-bl" />
      <i className="crop crop-br" />
      {page === "editor" ? (
        <>
          <div className="workspace-meta eyebrow">
            <span>
              N°01 <span className="meta-dash">—</span> {session.title}
            </span>
            <span>
              {progress !== null
                ? "DEMO PREVIEW"
                : session.files.length
                  ? `${session.files.length} FILE${session.files.length === 1 ? "" : "S"} · ${duration(seconds)} · ${bytes(total)}`
                  : "NOTHING LOADED"}
              <span className="meta-indicator" />
            </span>
          </div>
          <div className="creative-stage">
            <div className="intro">
              <div className="intro-kicker eyebrow">
                <span />
                FROM RAW TO REMARKABLE
                <span />
              </div>
              <h1>
                Drop it in. <em>Say the word.</em>
              </h1>
              <p>Video, audio or images — drag them anywhere on this window.</p>
            </div>
            <div className="hero">
              <img
                src="./hands.png"
                alt="Two outstretched hands reaching toward each other"
                draggable={false}
              />
              <div className="spark-target">
                <div className="spark-label eyebrow">
                  {progress !== null
                    ? `DEMO — ${Math.floor(progress)}%`
                    : session.files.length
                      ? `${session.files.length} FILE${session.files.length === 1 ? "" : "S"} RECEIVED`
                      : "DROP FILES HERE"}
                  <ArrowDown size={11} />
                </div>
                <span className="leader-line" />
                <button
                  className="spark"
                  aria-label="Choose media files"
                  disabled={progress !== null}
                  onClick={onImport}
                >
                  <span className="spark-ring" />
                  <span className="spark-core">
                    <Plus size={12} />
                  </span>
                </button>
              </div>
            </div>
            {session.plan && (
              <div className="plan-card">
                <div className="plan-title">
                  <span className="plan-check">
                    <Check size={16} />
                  </span>
                  <div>
                    <span className="eyebrow">
                      DEMO COMPLETE · NO VIDEO RENDERED
                    </span>
                    <h2>{session.plan.title}</h2>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Dismiss edit plan"
                    onClick={() => props.onChange({ plan: undefined })}
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>
                <p>{session.plan.summary}</p>
                <ol>
                  {session.plan.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                <span className="plan-note">
                  Your brief is saved. Real editing and exports will arrive with
                  an execution engine.
                </span>
              </div>
            )}
          </div>
          <Composer {...props} onPreview={setPreviewId} />
          {(session.prompt || session.files.length > 0) &&
            progress === null && (
              <button
                className="delete-session"
                aria-label="Delete this edit"
                onClick={props.onDelete}
              >
                <Trash2 size={13} />
                Delete edit
              </button>
            )}
        </>
      ) : page === "templates" ? (
        <div className="library-page">
          <span className="eyebrow">A HEAD START</span>
          <h1>
            Find your <em>starting point.</em>
          </h1>
          <p>A few thoughtful directions. Make any of them your own.</p>
          <div className="template-grid">
            {templates.map((t) => (
              <button
                className="template-card"
                key={t.number}
                disabled={progress !== null}
                onClick={() => props.onTemplate(t)}
              >
                <div className={`template-art template-art-${t.number}`}>
                  <span className="template-number">{t.number}</span>
                  <span className="template-shape" />
                </div>
                <div className="template-copy">
                  <span className="eyebrow">{t.category}</span>
                  <h2>{t.title}</h2>
                  <p>{t.description}</p>
                  <span className="template-action">
                    Use this template
                    <ArrowRight size={16} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="library-note eyebrow">
            A TEMPLATE SETS YOUR BRIEF AND SKILLS. YOU BRING THE FOOTAGE.
          </div>
        </div>
      ) : (
        <div className="library-page">
          <span className="eyebrow">THE FINISHED WORK</span>
          <h1>
            Your story, <em>ready to share.</em>
          </h1>
          <p>Finished exports will have a home here.</p>
          <div className="saved-empty">
            <div className="empty-icon">
              <Film size={30} strokeWidth={1} />
            </div>
            <h2>Something good is on its way.</h2>
            <p>
              This early edition saves your edit sessions in the sidebar.
              <br />
              Video rendering and the export library are coming next.
            </p>
            <button className="button primary" onClick={props.onEditor}>
              Back to your edit
              <ArrowRight size={16} />
            </button>
            <span className="eyebrow">NO VIDEO EXPORTS YET</span>
          </div>
        </div>
      )}
      {preview && (
        <MediaPreview
          file={preview}
          onClose={() => setPreviewId(null)}
          onNotice={onNotice}
        />
      )}
    </main>
  );
}
function MediaPreview({
  file,
  onClose,
  onNotice,
}: {
  file: MediaFile;
  onClose: () => void;
  onNotice: (s: string) => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const close = dialog.current?.querySelector<HTMLButtonElement>("button");
    close?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const media =
          dialog.current?.querySelector<HTMLMediaElement>("video,audio");
        if (!media) {
          e.preventDefault();
          close?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => {
      document.removeEventListener("keydown", handler, true);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="preview-scrim" onClick={onClose}>
      <section
        ref={dialog}
        className="media-preview"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${file.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="preview-header">
          <span>{file.name}</span>
          <button className="button" onClick={onClose}>
            Close preview
          </button>
        </div>
        {file.missing ? (
          <p className="preview-missing">
            This source file has moved or is unavailable. Remove it and reimport
            the file.
          </p>
        ) : file.kind === "image" ? (
          <img
            src={file.url}
            alt={file.name}
            onError={() =>
              onNotice("This image cannot be previewed. Try PNG, JPEG or WebP.")
            }
          />
        ) : file.kind === "audio" ? (
          <audio
            controls
            src={file.url}
            onError={() =>
              onNotice("This audio codec is unavailable. Try WAV or MP3.")
            }
          />
        ) : (
          <video
            controls
            src={file.url}
            onError={() =>
              onNotice(
                "This video codec cannot be previewed. Try H.264 MP4 or WebM.",
              )
            }
          />
        )}
        <div className="preview-footer eyebrow">
          SOURCE PREVIEW · {file.extension} · {bytes(file.size)}
        </div>
      </section>
    </div>
  );
}
