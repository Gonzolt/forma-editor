import { ArrowUpRight, Check, Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { desktop } from "../lib/bridge";
import type { ClaudeStatus } from "../types";
import "../claude.css";

export function ClaudeAccount() {
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    const accept = (next: ClaudeStatus) => {
      if (alive) setStatus(next);
    };
    const refresh = () =>
      desktop!.claude
        .status()
        .then(accept)
        .catch(() => {
          if (alive) setError("Could not check your Claude connection.");
        });
    const unsubscribe = desktop.claude.onStatus(accept);
    window.addEventListener("focus", refresh);
    void refresh();
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("focus", refresh);
    };
  }, []);
  async function act(action: () => Promise<ClaudeStatus | null | void>) {
    setBusy(true);
    setError("");
    try {
      const next = await action();
      if (next) setStatus(next);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message.replace(
              /^Error invoking remote method '[^']+': (Error: )?/,
              "",
            )
          : "Could not complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  const signedIn = status?.state === "signed-in";
  const connecting = !!status?.installing || !!status?.signingIn;
  const needsSetup = !status?.executable || status.state === "error";
  return (
    <section className="claude-account" aria-label="Claude Code account">
      <span className="eyebrow">YOUR CREATIVE PARTNER</span>
      <div className="claude-account-status" role="status">
        {signedIn && !connecting && <Check size={19} />}
        <div>
          <strong>
            {status?.installing
              ? "Setting up Claude for you"
              : status?.signingIn
                ? "Finish signing in in your browser"
                : signedIn
                  ? "Connected to Claude"
                  : status?.state === "checking" || !status
                    ? "Finding Claude…"
                    : "Connect your Claude account"}
          </strong>
          <p>
            {status?.installing
              ? status.installMessage
              : status?.signingIn
                ? "Complete the browser sign-in. Forma will connect automatically."
                : signedIn
                  ? [status.email, status.plan ? `${status.plan} plan` : null]
                      .filter(Boolean)
                      .join(" · ") || "Your Claude Code account is ready."
                  : "Forma finds Claude Code automatically. If it is missing, we’ll install it and take you straight to sign-in."}
          </p>
        </div>
      </div>
      <div className="claude-account-actions">
        {connecting ? (
          <>
            {status?.installing && (
              <progress
                aria-label="Claude installation progress"
                value={status.installProgress}
                max={100}
              />
            )}
            {status?.loginUrl && (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void act(() => desktop!.claude.open("login"))}
              >
                Open sign-in page <ArrowUpRight size={14} />
              </button>
            )}
            <button
              className="button"
              disabled={busy}
              onClick={() => void act(() => desktop!.claude.cancel())}
            >
              Cancel connection
            </button>
          </>
        ) : signedIn ? (
          <p className="claude-ready">
            <Check size={14} /> Ready to edit. No API key or file selection
            needed.
          </p>
        ) : (
          <button
            className="button primary"
            disabled={
              !desktop || busy || !status || status.state === "checking"
            }
            onClick={() => void act(() => desktop!.claude.connect())}
          >
            {!needsSetup ? <ArrowUpRight size={15} /> : <Download size={15} />}
            {!needsSetup
              ? "Connect Claude"
              : status?.state === "error"
                ? "Repair & connect Claude"
                : "Install & connect Claude"}
          </button>
        )}
      </div>
      {!signedIn && !connecting && needsSetup && (
        <p className="field-help">
          Setup uses Anthropic’s official download and verifies its checksum. A
          new installation downloads about 300 MB.
        </p>
      )}
      <details className="claude-options">
        <summary>Connection options</summary>
        <div className="claude-account-actions">
          <button
            className="button"
            disabled={!desktop || busy || connecting}
            onClick={() => void act(() => desktop!.claude.status())}
          >
            <RefreshCw size={14} /> Check connection
          </button>
          <button
            className="button"
            disabled={!desktop || busy || connecting}
            onClick={() => void act(() => desktop!.claude.discover())}
          >
            Find Claude automatically
          </button>
          {signedIn && (
            <button
              className="button"
              disabled={busy || connecting}
              onClick={() => void act(() => desktop!.claude.connect())}
            >
              Switch account
            </button>
          )}
          <button
            className="text-button"
            disabled={!desktop || busy || connecting}
            onClick={() => void act(() => desktop!.claude.repair())}
          >
            <Download size={14} /> Update or repair Claude Code
          </button>
          <button
            className="text-button"
            disabled={!desktop || busy || connecting}
            onClick={() => void act(() => desktop!.claude.open("setup"))}
          >
            Setup guide <ArrowUpRight size={13} />
          </button>
        </div>
        {signedIn && !connecting && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void act(() => desktop!.claude.logout())}
          >
            Sign out of Claude Code
          </button>
        )}
        <p className="field-help">
          Claude Code keeps your credentials. Signing out here also signs out
          its shared account.
        </p>
      </details>
      <p className="field-help">
        Run edit uses Claude to plan from still frames, then Forma renders the
        video on this device.
      </p>
      {(error || status?.error) && (
        <p className="inline-error" role="alert">
          {error || status?.error}
        </p>
      )}
    </section>
  );
}
