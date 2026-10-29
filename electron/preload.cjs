const { contextBridge, ipcRenderer, webUtils } = require("electron");
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("forma", {
  claude: {
    connect: () => invoke("claude:connect"),
    repair: () => invoke("claude:repair"),
    discover: () => invoke("claude:discover"),
    status: () => invoke("claude:status"),
    login: () => invoke("claude:login"),
    cancel: () => invoke("claude:cancel"),
    logout: () => invoke("claude:logout"),
    chooseExecutable: () => invoke("claude:choose"),
    open: (target) => invoke("claude:open", target),
    onStatus: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on("claude:status", handler);
      return () => ipcRenderer.removeListener("claude:status", handler);
    },
  },
  updates: {
    status: () => invoke("updates:status"),
    check: () => invoke("updates:check"),
    open: (target) => invoke("updates:open", target),
    onStatus: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on("updates:status", handler);
      return () => ipcRenderer.removeListener("updates:status", handler);
    },
  },
  motionKit: {
    status: () => invoke("motionkit:status"),
    preview: (id, variant) => invoke("motionkit:preview", id, variant),
    carousel: (id, index) => invoke("motionkit:carousel", id, index),
    exportCarousel: (id) => invoke("motionkit:carousel-export", id),
    posts: (id) => invoke("motionkit:posts", id),
    copyPost: (id, index) => invoke("motionkit:copy-post", id, index),
    revealCarousel: (id) => invoke("motionkit:reveal-carousel", id),
    export: (options) => invoke("motionkit:export", options),
    cancel: () => invoke("motionkit:cancel"),
    exports: () => invoke("motionkit:exports"),
    chooseProject: () => invoke("motionkit:choose"),
    useBundled: () => invoke("motionkit:use-bundled"),
    openProject: () => invoke("motionkit:open-project"),
    revealExport: (id) => invoke("motionkit:reveal", id),
    onJob: (callback) => {
      const handler = (_event, job) => callback(job);
      ipcRenderer.on("motionkit:job", handler);
      return () => ipcRenderer.removeListener("motionkit:job", handler);
    },
  },
  edit: {
    start: (options) => invoke("edit:start", options),
    cancel: () => invoke("edit:cancel"),
    onJob: (callback) => {
      const handler = (_event, job) => callback(job);
      ipcRenderer.on("edit:job", handler);
      return () => ipcRenderer.removeListener("edit:job", handler);
    },
  },
  setTheme: (theme) => invoke("theme:set", theme),
  platform: process.platform,
  window: (action) => invoke("window", action),
  load: () => invoke("state:load"),
  save: (state) => invoke("state:save", state),
  importFiles: () => invoke("media:pick"),
  importDropped: (files) =>
    invoke(
      "media:drop",
      Array.from(files).map((file) => webUtils.getPathForFile(file)),
    ),
  connection: () => invoke("connection:status"),
  saveKey: (key) => invoke("connection:save", key),
  removeKey: () => invoke("connection:remove"),
  chooseOutput: () => invoke("output:choose"),
  openOutput: () => invoke("output:open"),
  onCloseRequest: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("close:request", handler);
    return () => ipcRenderer.removeListener("close:request", handler);
  },
  closeReady: () => invoke("close:ready"),
});
