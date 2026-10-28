import type { AppState, MediaFile, Preferences } from "../types";
export const defaults: Preferences = {
  demoMode: false,
  defaultModel: "Claude Sonnet",
  outputDirectory: "",
  defaultAspect: "9:16",
  defaultQuality: "1080p",
  enabledSkills: ["auto", "silence", "captions", "color", "music"],
};
const key = "forma-foundations-v1";
export const desktop = window.forma;
export async function loadState(): Promise<AppState> {
  const state = desktop
    ? await desktop.load()
    : JSON.parse(localStorage.getItem(key) || "null");
  return {
    sessions: state?.sessions || [],
    activeId: state?.activeId,
    preferences: { ...defaults, ...state?.preferences },
  };
}
export async function saveState(state: AppState) {
  if (desktop) return desktop.save(state);
  // Blob URLs only live for this page's lifetime. Preserve metadata and request a reimport next time.
  localStorage.setItem(
    key,
    JSON.stringify({
      ...state,
      sessions: state.sessions.map((s) => ({
        ...s,
        files: s.files.map((f) => ({ ...f, url: "", missing: true })),
      })),
    }),
  );
}
export const accept =
  ".mp4,.mov,.webm,.m4v,.mkv,.mp3,.wav,.m4a,.aac,.ogg,.flac,.png,.jpg,.jpeg,.webp,.gif";
export async function browserFiles(files: File[]): Promise<MediaFile[]> {
  return files
    .filter((f) =>
      /\.(mp4|mov|webm|m4v|mkv|mp3|wav|m4a|aac|ogg|flac|png|jpe?g|webp|gif)$/i.test(
        f.name,
      ),
    )
    .map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      size: f.size,
      extension: f.name.split(".").pop()!.toUpperCase(),
      kind: /\.(png|jpe?g|webp|gif)$/i.test(f.name)
        ? "image"
        : /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name)
          ? "audio"
          : "video",
      url: URL.createObjectURL(f),
    }));
}
export function duration(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}
export function bytes(size: number) {
  return size >= 1e9
    ? `${(size / 1e9).toFixed(1)} GB`
    : size >= 1e6
      ? `${(size / 1e6).toFixed(1)} MB`
      : `${Math.ceil(size / 1e3)} KB`;
}
export function relativeTime(time: number) {
  const days = Math.floor((Date.now() - time) / 86400000);
  return days === 0 ? "Today" : days === 1 ? "1d" : `${days}d`;
}
