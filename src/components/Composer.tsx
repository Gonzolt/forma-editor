import {
  ArrowRight,
  Check,
  FileImage,
  Mic,
  Paperclip,
  Plus,
  Square,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import type { Aspect, EditSession, Preferences } from "../types";
import { duration } from "../lib/bridge";
import { skills, suggestions } from "../lib/skills";
import { phases } from "../lib/engine";
interface Props {
  session: EditSession;
  preferences: Preferences;
  progress: number | null;
  running: "demo" | "edit" | null;
  stage: string;
  connected: boolean;
  onChange: (patch: Partial<EditSession>) => void;
  onImport: () => void;
  onRun: () => void;
  onStop: () => void;
  onMore: () => void;
  onPreview: (id: string) => void;
  onNotice: (message: string) => void;
}
export function Composer({
  session,
  preferences,
  progress,
  running,
  stage,
  connected,
  onChange,
  onImport,
  onRun,
  onStop,
  onMore,
  onPreview,
  onNotice,
}: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [picker, setPicker] = useState<"skills" | "files" | null>(null);
  const working = progress !== null;
  const selected = session.skills;
  const toggle = (id: string) =>
    onChange({
      skills: selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    });
  const fill = (text: string) => {
    onChange({ prompt: text });
    textarea.current?.focus();
  };
  const insert = (text: string) => {
    const pos = textarea.current?.selectionStart ?? session.prompt.length;
    const before = session.prompt.slice(0, pos).replace(/[/@]$/, "");
    onChange({ prompt: `${before}${text} ${session.prompt.slice(pos)}` });
    setPicker(null);
    textarea.current?.focus();
  };
  return (
    <div className="composer-wrap">
      {working ? (
        <div className="progress-block" role="status">
          <div className="progress-label eyebrow">
            <span>
              {running === "edit" ? (
                stage.toUpperCase()
              ) : (
                <>
                  DEMO STEP {Math.min(4, Math.floor(progress / 25) + 1)} / 4 —{" "}
                  {phases[Math.min(3, Math.floor(progress / 25))].toUpperCase()}
                </>
              )}
            </span>
            <span>{Math.floor(progress)}%</span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={
              running === "edit" ? "Edit progress" : "Demo edit progress"
            }
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : (
        <div className="suggestions">
          <span className="eyebrow">
            TRY <ArrowRight size={13} />
          </span>
          {suggestions.map((s, i) => (
            <button
              key={s}
              className={`suggestion suggestion-${i}`}
              onClick={() => fill(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <section className="composer" aria-label="Edit composer">
        {session.files.length > 0 && (
          <div className="file-chips">
            {session.files.map((f) => (
              <div
                className={`file-chip ${f.missing ? "missing" : ""}`}
                key={f.id}
              >
                <button
                  className="file-preview-button"
                  onClick={() => onPreview(f.id)}
                  aria-label={`Preview ${f.name}`}
                >
                  <span className="file-extension">{f.extension}</span>
                  <span className="filename">{f.name}</span>
                  <span className="mono file-duration">
                    {f.missing ? (
                      "REIMPORT"
                    ) : f.kind === "image" ? (
                      <FileImage size={13} />
                    ) : (
                      duration(f.duration)
                    )}
                  </span>
                </button>
                <button
                  className="file-remove"
                  aria-label={`Remove ${f.name}`}
                  disabled={working}
                  onClick={() =>
                    onChange({
                      files: session.files.filter((x) => x.id !== f.id),
                      plan: undefined,
                    })
                  }
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="prompt-area">
          <label className="sr-only" htmlFor="edit-prompt">
            Describe your edit
          </label>
          <textarea
            id="edit-prompt"
            ref={textarea}
            rows={2}
            value={session.prompt}
            disabled={working}
            maxLength={10000}
            placeholder="Describe the edit…"
            onChange={(e) => {
              const text = e.target.value;
              onChange({ prompt: text, plan: undefined });
              setPicker(
                text.endsWith("/")
                  ? "skills"
                  : text.endsWith("@")
                    ? "files"
                    : null,
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPicker(null);
            }}
          />
          <span className="composer-help">
            A little direction goes a long way.{" "}
            <span>
              Type <kbd>/</kbd> for skills, <kbd>@</kbd> for a file
            </span>
          </span>
          {picker && (
            <div
              className="prompt-picker"
              role="group"
              aria-label={
                picker === "skills" ? "Choose a skill" : "Mention a file"
              }
            >
              <div className="picker-heading eyebrow">
                {picker === "skills"
                  ? "A LITTLE HELP WITH…"
                  : "POINT TO A FILE"}
                <button
                  className="icon-button"
                  aria-label="Close picker"
                  onClick={() => setPicker(null)}
                >
                  <X size={12} />
                </button>
              </div>
              {picker === "skills" ? (
                skills
                  .filter((s) => preferences.enabledSkills.includes(s.id))
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        if (!selected.includes(s.id)) toggle(s.id);
                        insert(`/${s.id}`);
                      }}
                    >
                      <s.icon size={16} />
                      <span>
                        {s.label}
                        <small>{s.description}</small>
                      </span>
                      {selected.includes(s.id) && <Check size={14} />}
                    </button>
                  ))
              ) : session.files.length ? (
                session.files.map((f) => (
                  <button key={f.id} onClick={() => insert(`@"${f.name}"`)}>
                    <Paperclip size={14} />
                    {f.name}
                  </button>
                ))
              ) : (
                <p>Import a file to mention it here.</p>
              )}
            </div>
          )}
        </div>
        <div className="composer-tools">
          <button
            className="tool-button"
            aria-label="Attach media files"
            disabled={working}
            onClick={onImport}
          >
            <Paperclip size={17} />
          </button>
          <button
            className="tool-button"
            aria-label="Voice input information"
            disabled={working}
            onClick={() =>
              onNotice(
                "Voice input is planned for a later version. For now, type your brief here.",
              )
            }
          >
            <Mic size={17} />
          </button>
          <span className="vertical-rule" />
          <span className="eyebrow skills-label">SKILLS</span>
          {skills
            .filter((s) => preferences.enabledSkills.includes(s.id))
            .map((s) => (
              <button
                key={s.id}
                className={`skill-chip ${selected.includes(s.id) ? "selected" : ""}`}
                title={s.description}
                aria-pressed={selected.includes(s.id)}
                disabled={working}
                onClick={() => toggle(s.id)}
              >
                <s.icon size={12} />
                {s.label}
              </button>
            ))}
          <button
            className="skill-chip more-chip"
            disabled={working}
            onClick={onMore}
          >
            <Plus size={12} />
            More
          </button>
        </div>
        <div className="output-bar">
          <div className="output-settings">
            <span className="eyebrow format-label">FORMAT</span>
            <div
              className="aspect-control"
              role="group"
              aria-label="Output aspect ratio"
            >
              {(["9:16", "16:9", "1:1", "4:5"] as Aspect[]).map((a) => (
                <button
                  key={a}
                  className={session.aspect === a ? "selected" : ""}
                  aria-label={`${a} aspect ratio`}
                  aria-pressed={session.aspect === a}
                  disabled={working}
                  onClick={() => onChange({ aspect: a })}
                >
                  <span className={`ratio-icon ratio-${a.replace(":", "-")}`} />
                  <span>{a}</span>
                </button>
              ))}
            </div>
            <label className="select-label">
              <span>Length:</span>
              <select
                aria-label="Video length"
                value={session.length}
                disabled={working}
                onChange={(e) => onChange({ length: e.target.value })}
              >
                {["Auto", "15 seconds", "30 seconds", "60 seconds"].map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <label className="select-label quality">
              <span>Export:</span>
              <select
                aria-label="Export quality"
                value={session.quality}
                disabled={working}
                onChange={(e) => onChange({ quality: e.target.value })}
              >
                {["720p", "1080p", "4K"].map((q) => (
                  <option value={q} key={q}>
                    MP4 · {q}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="run-controls">
            <kbd className="run-shortcut">
              {navigator.platform.includes("Mac") ? "⌘" : "CTRL"} ↵
            </kbd>
            <button
              className={`button run-button ${working ? "outline" : "primary"}`}
              onClick={working ? onStop : onRun}
            >
              {working ? (
                <>
                  <Square size={11} fill="currentColor" />
                  Stop
                </>
              ) : (
                <>
                  Run edit
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </section>
      <div className="composer-footnote">
        <span className="small-cross" aria-hidden="true">
          +
        </span>
        {connected
          ? "CLAUDE SEES STILL FRAMES AND YOUR BRIEF · YOUR VIDEO RENDERS ON THIS DEVICE"
          : preferences.demoMode
            ? "DEMO MODE · EDIT PLANS ONLY · NO VIDEO RENDERING"
            : "YOUR FILES STAY ON YOUR DEVICE. YOUR STORY STAYS YOURS."}
      </div>
    </div>
  );
}
