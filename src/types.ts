export type Aspect = "9:16" | "16:9" | "1:1" | "4:5";
export type Page = "editor" | "saved" | "templates" | "motionkit";
export type SettingsTab =
  "Claude" | "Skills" | "Export" | "Storage" | "Shortcuts" | "Updates";
export interface MediaFile {
  id: string;
  name: string;
  size: number;
  kind: "video" | "audio" | "image";
  extension: string;
  url: string;
  duration?: number;
  missing?: boolean;
}
export interface EditSession {
  id: string;
  title: string;
  prompt: string;
  files: MediaFile[];
  skills: string[];
  aspect: Aspect;
  length: string;
  quality: string;
  updatedAt: number;
  plan?: EditPlan;
}
export interface EditPlan {
  title: string;
  steps: string[];
  summary: string;
}
export interface Preferences {
  theme: "light" | "dark";
  sidebarCollapsed: boolean;
  demoMode: boolean;
  defaultModel: string;
  outputDirectory: string;
  defaultAspect: Aspect;
  defaultQuality: string;
  enabledSkills: string[];
}
export interface AppState {
  sessions: EditSession[];
  activeId?: string;
  preferences: Preferences;
}
export interface ConnectionInfo {
  hasKey: boolean;
  encryptionAvailable: boolean;
}
export interface ClaudeStatus {
  state: "checking" | "missing" | "signed-in" | "signed-out" | "error";
  executable: string | null;
  email: string | null;
  plan: string | null;
  authMethod: string | null;
  signingIn: boolean;
  loginUrl: string | null;
  error: string | null;
}
export interface DesktopBridge {
  claude: {
    status: () => Promise<ClaudeStatus>;
    login: () => Promise<ClaudeStatus>;
    cancel: () => Promise<ClaudeStatus>;
    logout: () => Promise<ClaudeStatus>;
    chooseExecutable: () => Promise<ClaudeStatus | null>;
    open: (target: "setup" | "login") => Promise<void>;
    onStatus: (callback: (status: ClaudeStatus) => void) => () => void;
  };
  updates: {
    status: () => Promise<UpdateStatus>;
    check: () => Promise<UpdateStatus>;
    open: (target: "forma" | "motionkit") => Promise<void>;
    onStatus: (callback: (status: UpdateStatus) => void) => () => void;
  };
  motionKit: {
    status: () => Promise<MotionKitStatus>;
    preview: (id: string) => Promise<KitPreview>;
    export: (options: KitExportOptions) => Promise<KitJob>;
    cancel: () => Promise<void>;
    exports: () => Promise<VideoExport[]>;
    chooseProject: () => Promise<MotionKitStatus | null>;
    openProject: () => Promise<void>;
    revealExport: (id: string) => Promise<void>;
    onJob: (callback: (job: KitJob) => void) => () => void;
  };
  setTheme: (theme: "light" | "dark") => Promise<void>;
  platform: string;
  window: (action: "minimize" | "maximize" | "close") => Promise<void>;
  load: () => Promise<AppState | null>;
  save: (state: AppState) => Promise<void>;
  importFiles: () => Promise<MediaFile[]>;
  importDropped: (files: File[]) => Promise<MediaFile[]>;
  connection: () => Promise<ConnectionInfo>;
  saveKey: (key: string) => Promise<void>;
  removeKey: () => Promise<void>;
  chooseOutput: () => Promise<string | null>;
  openOutput: () => Promise<void>;
  onCloseRequest: (callback: () => void) => () => void;
  closeReady: () => Promise<void>;
}
export type UpdateState =
  "idle" | "current" | "available" | "unpublished" | "unknown" | "error";
export interface UpdateStatus {
  checking: boolean;
  checkedAt: number | null;
  app: {
    state: UpdateState;
    available: boolean;
    currentVersion: string;
    latestVersion: string | null;
    releaseUrl: string;
    error?: string;
  };
  motionkit: {
    state: UpdateState;
    available: boolean;
    currentRevision: string | null;
    latestRevision: string | null;
    mode: "bundled" | "git" | "external" | "unknown";
    root: string;
    sourceUrl: string;
    error?: string;
  };
}
export interface KitFilm {
  id: string;
  name: string;
  brand: string;
  url: string;
}
export interface KitGuide {
  id: string;
  name: string;
  description: string;
  content: string;
}
export interface KitPreview extends KitFilm {
  duration: number;
  width: number;
  height: number;
}
export interface KitExportOptions {
  filmId: string;
  quality: "360p" | "720p" | "1080p" | "4K";
  fps: number;
  from: number;
  to: number;
  audioId?: string;
}
export interface VideoExport {
  id: string;
  title: string;
  filmId: string;
  name: string;
  path: string;
  url: string;
  size: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  createdAt: number;
  hasAudio: boolean;
  missing?: boolean;
}
export interface KitJob {
  id: string;
  filmId: string;
  status:
    | "preparing"
    | "rendering"
    | "encoding"
    | "verifying"
    | "completed"
    | "cancelled"
    | "failed";
  progress: number;
  frame: number;
  total: number;
  message: string;
  revision: number;
  result?: VideoExport;
}
export interface MotionKitStatus {
  root: string;
  source: string;
  revision: string;
  films: KitFilm[];
  guides: KitGuide[];
  encoderReady: boolean;
  job: KitJob | null;
  exports: VideoExport[];
}
declare global {
  interface Window {
    forma?: DesktopBridge;
  }
}
