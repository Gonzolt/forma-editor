import { Minus, Moon, Settings2, Square, Sun, X } from "lucide-react";
import { desktop } from "../lib/bridge";
export function Brand({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand ${large ? "brand-large" : ""}`}>
      <span className="brand-symbol" aria-hidden="true">
        <i />
      </span>
      <span>
        forma<span className="brand-period">.</span>
      </span>
    </span>
  );
}
export function TitleBar({
  onSettings,
  onError,
  theme,
  onToggleTheme,
}: {
  onSettings: () => void;
  onError: (message: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const control = async (action: "minimize" | "maximize" | "close") => {
    try {
      if (desktop) await desktop.window(action);
      else onError("Window controls are available in the desktop app.");
    } catch {
      onError("The window action could not be completed.");
    }
  };
  return (
    <header className="titlebar">
      <div className="titlebar-drag">
        <Brand />
        <span className="titlebar-description">
          A LITTLE DIRECTION. A BEAUTIFUL EDIT.
        </span>
      </div>
      <div className="window-controls">
        <button
          className="icon-button theme-toggle"
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          title={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className="icon-button title-settings"
          aria-label="Open settings"
          onClick={onSettings}
        >
          <Settings2 size={16} />
        </button>
        <span className="vertical-rule" />
        <button
          aria-label="Minimize window"
          onClick={() => void control("minimize")}
        >
          <Minus size={14} />
        </button>
        <button
          aria-label="Maximize window"
          onClick={() => void control("maximize")}
        >
          <Square size={11} />
        </button>
        <button
          className="window-close"
          aria-label="Close window"
          onClick={() => void control("close")}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
