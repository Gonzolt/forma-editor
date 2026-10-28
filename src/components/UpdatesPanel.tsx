import { ArrowUpRight, RefreshCw } from "lucide-react";
import { desktop } from "../lib/bridge";
import type { UpdateState, UpdateStatus } from "../types";
export interface UpdatesPanelProps {
  status: UpdateStatus | null;
  onCheck: () => Promise<void>;
  onOpen: (target: "forma" | "motionkit") => Promise<void>;
}
function label(state?: UpdateState) {
  return state === "available"
    ? "UPDATE AVAILABLE"
    : state === "current"
      ? "UP TO DATE"
      : state === "error"
        ? "CHECK UNAVAILABLE"
        : state === "unpublished"
          ? "NO RELEASE YET"
          : state === "unknown"
            ? "REVISION UNKNOWN"
            : "AWAITING CHECK";
}
export function UpdatesPanel({ status, onCheck, onOpen }: UpdatesPanelProps) {
  return (
    <section className="updates-panel" aria-label="Software updates">
      <p className="settings-description">
        Forma checks GitHub when it opens. You can also check again here.
      </p>
      <div className="update-card">
        <div className="update-card-heading">
          <h4>Forma</h4>
          <span
            className={`update-badge update-${status?.app.state || "idle"}`}
          >
            {label(status?.app.state)}
          </span>
        </div>
        <p className="update-versions">
          Installed {status?.app.currentVersion || "…"}
          {status?.app.latestVersion
            ? ` · Latest ${status.app.latestVersion}`
            : ""}
        </p>
        <p className="update-message">
          {status?.app.state === "error"
            ? status.app.error
            : status?.app.state === "available"
              ? "A newer app release is ready on GitHub."
              : status?.app.state === "current"
                ? "You have the latest stable Forma release."
                : status?.app.state === "unpublished"
                  ? "There are no published stable installers yet."
                  : "Looking for the latest stable release."}
        </p>
        <button
          className="button"
          disabled={!desktop}
          onClick={() => void onOpen("forma")}
        >
          View Forma release
          <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="update-card">
        <div className="update-card-heading">
          <h4>MotionKit</h4>
          <span
            className={`update-badge update-${status?.motionkit.state || "idle"}`}
          >
            {label(status?.motionkit.state)}
          </span>
        </div>
        <p className="update-versions">
          {status?.motionkit.mode === "bundled"
            ? "Bundled base"
            : "Project revision"}
          : {status?.motionkit.currentRevision?.slice(0, 7) || "untracked"}
          {status?.motionkit.latestRevision
            ? ` · GitHub: ${status.motionkit.latestRevision.slice(0, 7)}`
            : ""}
        </p>
        <p className="update-message">
          {status?.motionkit.state === "error"
            ? status.motionkit.error
            : status?.motionkit.state === "available"
              ? "New upstream changes are available to review."
              : status?.motionkit.state === "current"
                ? "Your tracked MotionKit base matches GitHub’s latest commit."
                : status?.motionkit.state === "unknown"
                  ? "GitHub was checked. This external project has no readable Git revision to compare."
                  : "Checking the repository’s default branch."}
        </p>
        <button
          className="button"
          disabled={!desktop}
          onClick={() => void onOpen("motionkit")}
        >
          View MotionKit changes
          <ArrowUpRight size={14} />
        </button>
        <p className="field-help">
          Review the source update on GitHub, then select an updated project
          folder in MotionKit. Checks leave your working films untouched.
        </p>
      </div>
      <div className="update-check-row">
        <button
          className="button primary"
          disabled={!desktop || status?.checking}
          onClick={() => void onCheck()}
        >
          <RefreshCw
            size={14}
            className={status?.checking ? "update-spinning" : ""}
          />
          {status?.checking ? "Checking GitHub…" : "Check for updates"}
        </button>
        <span className="field-help" role="status">
          {!desktop
            ? "Available in the desktop app."
            : status?.checking
              ? "Checking both public repositories."
              : status?.checkedAt
                ? `Last checked ${new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(status.checkedAt)}`
                : "Checks run automatically at launch."}
        </span>
      </div>
    </section>
  );
}
