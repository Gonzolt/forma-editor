import {
  ArrowUpRight,
  Clapperboard,
  Film,
  Grid2X2,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { EditSession, Page } from "../types";
import { relativeTime } from "../lib/bridge";
import { useState } from "react";
interface Props {
  sessions: EditSession[];
  activeId: string;
  page: Page;
  demo: boolean;
  onPage: (p: Page) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onSettings: () => void;
  busy: boolean;
  filmCount: number;
  videoCount: number;
}
export function Sidebar({
  sessions,
  activeId,
  page,
  demo,
  onPage,
  onNew,
  onSelect,
  onSettings,
  busy,
  filmCount,
  videoCount,
}: Props) {
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const recents = sessions
    .filter((s) => s.prompt || s.files.length)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button
          className="button primary new-edit"
          onClick={onNew}
          disabled={busy}
        >
          <Plus size={17} />
          <span>New edit</span>
          <kbd>{navigator.platform.includes("Mac") ? "⌘" : "CTRL"} N</kbd>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${page === "motionkit" ? "active" : ""}`}
            onClick={() => onPage("motionkit")}
          >
            <Clapperboard size={17} />
            <span>MotionKit</span>
            <span className="mono">{filmCount}</span>
          </button>
          <button
            className={`nav-item ${page === "saved" ? "active" : ""}`}
            onClick={() => onPage("saved")}
          >
            <Film size={17} />
            <span>Saved videos</span>
            <span className="mono">{videoCount}</span>
          </button>
          <button
            className={`nav-item ${page === "templates" ? "active" : ""}`}
            onClick={() => onPage("templates")}
          >
            <Grid2X2 size={17} />
            <span>Templates</span>
            <span className="mono">03</span>
          </button>
        </nav>
        <div className="recents-heading">
          <span className="eyebrow">YOUR EDITS</span>
          <button
            className="icon-button"
            aria-label="Search recent edits"
            aria-expanded={searching}
            onClick={() => setSearching(!searching)}
          >
            <Search size={14} />
          </button>
        </div>
        {searching && (
          <input
            autoFocus
            className="search-input"
            placeholder="Find an edit…"
            aria-label="Search edits"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        <div className="recent-list">
          {recents
            .filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
            .slice(0, 30)
            .map((s) => (
              <button
                key={s.id}
                className={`recent-item ${s.id === activeId && page === "editor" ? "active" : ""}`}
                onClick={() => onSelect(s.id)}
                disabled={busy}
              >
                <span>{s.title}</span>
                <span className="mono">{relativeTime(s.updatedAt)}</span>
              </button>
            ))}
          {recents.length === 0 && (
            <div className="recents-empty">
              Good stories start somewhere.
              <br />
              Your edits will live here.
            </div>
          )}
        </div>
      </div>
      <div className="sidebar-bottom">
        <div className={`connection-card ${demo ? "demo-connection" : ""}`}>
          <div className="eyebrow connection-label">
            <span className={`status-dot ${demo ? "accent" : ""}`} />
            {demo ? "DEMO WORKSPACE" : "MAKE ROOM FOR AN IDEA"}
          </div>
          <p>
            {demo ? (
              <>
                A little practice.
                <br />
                <em>A lot of possibility.</em>
              </>
            ) : (
              <>
                Your footage.
                <br />
                <em>A helping hand.</em>
              </>
            )}
          </p>
          <span className="connection-description">
            {demo
              ? "Explore the workflow. No video rendering yet."
              : "Connect your tools and make something yours."}
          </span>
          <button className="button connection-button" onClick={onSettings}>
            {demo ? "Manage connection" : "Connect Claude"}
            <ArrowUpRight size={15} />
          </button>
        </div>
        <button className="nav-item settings-row" onClick={onSettings}>
          <SlidersHorizontal size={16} />
          <span>Settings</span>
          <kbd>⌘ / CTRL ,</kbd>
        </button>
        <div className="sidebar-edition eyebrow">
          FORMA STUDIO <span>EARLY EDITION · 0.3</span>
        </div>
      </div>
    </aside>
  );
}
