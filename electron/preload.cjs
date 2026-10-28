const { contextBridge, ipcRenderer, webUtils } = require("electron");
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("forma", {
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
