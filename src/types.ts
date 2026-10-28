export type Aspect = "9:16" | "16:9" | "1:1" | "4:5";
export type Page = "editor" | "saved" | "templates";
export type SettingsTab =
  "Claude" | "Skills" | "Export" | "Storage" | "Shortcuts";
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
export interface DesktopBridge {
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
declare global {
  interface Window {
    forma?: DesktopBridge;
  }
}
