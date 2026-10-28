import {
  ArrowUpRight,
  Check,
  ChevronRight,
  FolderOpen,
  KeyRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ConnectionInfo, Preferences, SettingsTab } from "../types";
import { desktop } from "../lib/bridge";
import { skills } from "../lib/skills";
import { UpdatesPanel, type UpdatesPanelProps } from "./UpdatesPanel";
interface Props {
  initialTab: SettingsTab;
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
  onMotionKit: () => void;
  updates: UpdatesPanelProps;
}
export function SettingsModal({
  initialTab,
  preferences,
  onChange,
  onClose,
  onNotice,
  onMotionKit,
  updates,
}: Props) {
  const [tab, setTab] = useState(initialTab);
  const [key, setKey] = useState("");
  const [connection, setConnection] = useState<ConnectionInfo>({
    hasKey: false,
    encryptionAvailable: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    desktop
      ?.connection()
      .then(setConnection)
      .catch(() => setError("Could not read the connection settings."));
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current
      ?.querySelector<HTMLButtonElement>(".settings-close")
      ?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const nodes = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ) || []),
        ];
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [onClose]);
  const saveKey = async () => {
    if (!desktop) return;
    setSaving(true);
    setError("");
    try {
      await desktop.saveKey(key);
      setKey("");
      setConnection(await desktop.connection());
      onNotice(
        "API key encrypted and saved locally. Claude execution is not connected in this edition.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the key.");
    } finally {
      setSaving(false);
    }
  };
  const chooseOutput = async () => {
    try {
      const directory = await desktop?.chooseOutput();
      if (directory) onChange({ outputDirectory: directory });
    } catch {
      setError("Could not choose an output folder.");
    }
  };
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <aside className="settings-nav">
          <h2 id="settings-title">
            Settings<span>.</span>
          </h2>
          <nav aria-label="Settings sections">
            {(
              [
                "Claude",
                "Skills",
                "Export",
                "Storage",
                "Shortcuts",
                "Updates",
              ] as SettingsTab[]
            ).map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => {
                  setTab(t);
                  setError("");
                }}
              >
                {t}
                <ChevronRight size={14} />
              </button>
            ))}
          </nav>
          <span className="eyebrow">
            MAKE IT YOURS.
            <br />
            FORMA · EARLY EDITION
          </span>
        </aside>
        <div className="settings-content">
          <button
            className="icon-button settings-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={19} />
          </button>
          <span className="eyebrow">
            {tab === "Claude" ? "YOUR CREATIVE PARTNER" : "YOUR WORKSPACE"}
          </span>
          <h3>
            {tab === "Claude"
              ? "A helping hand."
              : tab === "Skills"
                ? "The right little tools."
                : tab === "Export"
                  ? "Ready for the world."
                  : tab === "Storage"
                    ? "Everything in its place."
                    : tab === "Updates"
                      ? "A little newer."
                      : "A quicker way."}
          </h3>
          {tab === "Claude" && (
            <>
              <div className="connection-status">
                <span className="status-dot accent" />
                <div>
                  <strong>
                    {connection.hasKey
                      ? "API key saved"
                      : "Claude is not connected"}
                  </strong>
                  <p>
                    {connection.hasKey
                      ? "Stored securely. Execution adapter coming next."
                      : "Claude account sign-in is coming in a later edition."}
                  </p>
                </div>
              </div>
              <div className="coming-feature">
                <span className="eyebrow">CLAUDE ACCOUNT</span>
                <p>
                  Account sign-in and AI execution are not available in this
                  foundation build.
                </p>
              </div>
              <div className="settings-divider eyebrow">
                OR PREPARE AN API KEY
              </div>
              <label className="field-label" htmlFor="api-key">
                Anthropic API key
              </label>
              <div className="key-input">
                <KeyRound size={15} />
                <input
                  id="api-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="sk-ant-…"
                  disabled={!connection.encryptionAvailable}
                />
                <button
                  className="button"
                  onClick={() => void saveKey()}
                  disabled={!key || saving || !connection.encryptionAvailable}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
              <p className="field-help">
                {desktop
                  ? connection.encryptionAvailable
                    ? "Encrypted by your operating system. Never sent from this build."
                    : "OS encryption is unavailable. Key storage is disabled."
                  : "Secure key storage is available in the desktop app."}
              </p>
              {connection.hasKey && (
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await desktop?.removeKey();
                      setConnection(await desktop!.connection());
                    } catch {
                      setError("Could not remove the key.");
                    }
                  }}
                >
                  Remove saved key
                </button>
              )}
              <label className="field-label" htmlFor="default-model">
                Preferred model{" "}
                <span className="field-hint">FOR FUTURE CONNECTION</span>
              </label>
              <select
                id="default-model"
                className="full-select"
                value={preferences.defaultModel}
                onChange={(e) => onChange({ defaultModel: e.target.value })}
              >
                <option>Claude Sonnet</option>
                <option>Claude Opus</option>
                <option>Claude Haiku</option>
              </select>
              <div className="demo-setting">
                <div>
                  <strong>Take it for a spin</strong>
                  <p>
                    Explore a simulated edit and get an example plan.
                    <br />
                    No AI calls, charges, or video rendering.
                  </p>
                </div>
                <button
                  className={`button ${preferences.demoMode ? "outline" : "primary"}`}
                  onClick={() => onChange({ demoMode: !preferences.demoMode })}
                >
                  {preferences.demoMode ? (
                    <>
                      <Check size={14} />
                      Demo enabled
                    </>
                  ) : (
                    <>
                      Enable demo
                      <ArrowUpRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </>
          )}
          {tab === "Skills" && (
            <>
              <p className="settings-description">
                Choose which tools appear in your composer. These prompt skills
                are currently used by the demo workflow.
              </p>
              <div className="skill-settings">
                {skills.map((s) => (
                  <label className="skill-setting" key={s.id}>
                    <s.icon size={19} />
                    <span>
                      <strong>{s.label}</strong>
                      <small>{s.description}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={preferences.enabledSkills.includes(s.id)}
                      onChange={(e) =>
                        onChange({
                          enabledSkills: e.target.checked
                            ? [...preferences.enabledSkills, s.id]
                            : preferences.enabledSkills.filter(
                                (x) => x !== s.id,
                              ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="field-help">
                MotionKit’s repository includes its own editing, motion, audio
                and finishing guides.
              </p>
              <button className="button" onClick={onMotionKit}>
                Browse MotionKit skills
                <ArrowUpRight size={14} />
              </button>
            </>
          )}
          {tab === "Export" && (
            <>
              <p className="settings-description">
                Set the starting point for new edit briefs. Choose MotionKit
                export settings in its studio.
              </p>
              <label className="field-label" htmlFor="default-aspect">
                Default format
              </label>
              <select
                id="default-aspect"
                className="full-select"
                value={preferences.defaultAspect}
                onChange={(e) =>
                  onChange({
                    defaultAspect: e.target
                      .value as Preferences["defaultAspect"],
                  })
                }
              >
                {["9:16", "16:9", "1:1", "4:5"].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
              <label className="field-label" htmlFor="default-quality">
                Default resolution
              </label>
              <select
                id="default-quality"
                className="full-select"
                value={preferences.defaultQuality}
                onChange={(e) => onChange({ defaultQuality: e.target.value })}
              >
                {["720p", "1080p", "4K"].map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </select>
              <div className="settings-note">
                MotionKit can export real MP4 videos. Prompt-based AI editing
                remains a demo workflow.
              </div>
            </>
          )}
          {tab === "Storage" && (
            <>
              <p className="settings-description">
                Your edit sessions save automatically on this device. Imported
                media stays in its original location.
              </p>
              <label className="field-label">Export folder</label>
              <div className="folder-path">
                <FolderOpen size={18} />
                <span>{preferences.outputDirectory || "Videos / Forma"}</span>
              </div>
              <button
                className="button"
                disabled={!desktop}
                onClick={() => void chooseOutput()}
              >
                Choose folder
                <FolderOpen size={15} />
              </button>
              <div className="settings-note">
                If you move a source file, reimport it to reconnect its preview.
                API keys are kept separately from project data using operating
                system encryption.
              </div>
            </>
          )}
          {tab === "Updates" && <UpdatesPanel {...updates} />}
          {tab === "Shortcuts" && (
            <div className="shortcut-list">
              {[
                ["New edit", "Ctrl / ⌘ N"],
                ["Run / stop demo", "Ctrl / ⌘ Enter"],
                ["Settings", "Ctrl / ⌘ ,"],
                ["Attach files", "Ctrl / ⌘ O"],
                ["Close dialog", "Escape"],
                ["Pick a skill", "/"],
                ["Mention a file", "@"],
              ].map(([l, k]) => (
                <div key={l}>
                  <span>{l}</span>
                  <kbd>{k}</kbd>
                </div>
              ))}
            </div>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="settings-footer eyebrow">
            THOUGHTFULLY MADE. STILL TAKING SHAPE.
          </div>
        </div>
      </div>
    </div>
  );
}
