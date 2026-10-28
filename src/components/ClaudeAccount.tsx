import { ArrowUpRight, Check, FolderOpen, RefreshCw } from "lucide-react";
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
    const unsubscribe = desktop.claude.onStatus(accept);
    desktop.claude
      .status()
      .then(accept)
      .catch(() => {
        if (alive) setError("Could not check Claude Code.");
      });
    return () => {
      alive = false;
      unsubscribe();
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
          ? error.message
          : "Could not complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  const signedIn = status?.state === "signed-in";
  const installed = !!status?.executable;
  return (
    <section className="claude-account" aria-label="Claude Code account">
      <span className="eyebrow">YOUR CLAUDE ACCOUNT</span>
      <div className="claude-account-status" role="status">
        {signedIn && !status?.signingIn && <Check size={17} />}
        <div>
          <strong>
            {status?.signingIn
              ? "Finish signing in in your browser"
              : signedIn
                ? "Claude Code is signed in"
                : status?.state === "missing"
                  ? "Install Claude Code to sign in"
                  : status?.state === "error"
                    ? "Claude Code needs attention"
                    : status?.state === "signed-out"
                      ? "Sign in to Claude Code"
                      : desktop
                        ? "Checking Claude Code…"
                        : "Available in the desktop app"}
          </strong>
          <p>
            {signedIn
              ? [status.email, status.plan ? `${status.plan} plan` : null]
                  .filter(Boolean)
                  .join(" · ") || "Your saved Claude Code account is available."
              : status?.signingIn
                ? "Complete Anthropic’s sign-in page. Forma will update when it finishes."
                : "Use Claude Code’s own sign-in with your Claude account."}
          </p>
        </div>
      </div>
      <div className="claude-account-actions">
        {status?.signingIn ? (
          <>
            {status.loginUrl && (
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
              Cancel sign-in
            </button>
          </>
        ) : installed ? (
          <>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void act(() => desktop!.claude.login())}
            >
              {signedIn ? "Sign in again" : "Sign in with Claude Code"}{" "}
              <ArrowUpRight size={14} />
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => void act(() => desktop!.claude.status())}
            >
              <RefreshCw size={14} /> Check status
            </button>
          </>
        ) : (
          <>
            <button
              className="button primary"
              disabled={!desktop || busy}
              onClick={() => void act(() => desktop!.claude.open("setup"))}
            >
              Get Claude Code <ArrowUpRight size={14} />
            </button>
            <button
              className="button"
              disabled={!desktop || busy}
              onClick={() => void act(() => desktop!.claude.status())}
            >
              <RefreshCw size={14} /> Check again
            </button>
          </>
        )}
      </div>
      {signedIn && !status?.signingIn && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void act(() => desktop!.claude.logout())}
        >
          Sign out of Claude Code
        </button>
      )}
      <p className="field-help">
        Claude Code keeps your credentials. This is a shared account: signing
        out here also signs out Claude Code.
      </p>
      <p className="field-help">
        Run edit uses this account: Claude Code reads still frames from your
        footage and plans the cut, then Forma renders the video on this device.
      </p>
      <button
        className="text-button claude-choose"
        title={status?.executable || undefined}
        disabled={!desktop || busy || status?.signingIn}
        onClick={() => void act(() => desktop!.claude.chooseExecutable())}
      >
        <FolderOpen size={13} /> Choose Claude Code location
      </button>
      {(error || status?.error) && (
        <p className="inline-error" role="alert">
          {error || status?.error}
        </p>
      )}
    </section>
  );
}
