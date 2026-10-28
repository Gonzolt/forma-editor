const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  safeStorage,
  shell,
  session,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { JsonStore, validateState } = require("./store.cjs");
const { extensions, registerFiles } = require("./media.cjs");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "forma-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
const dev = process.argv.includes("--dev");
if (process.env.FORMA_TEST_DATA)
  app.setPath("userData", process.env.FORMA_TEST_DATA);
let win,
  store,
  registry = {},
  outputDirectory,
  allowClose = false;
const productionUrl = pathToFileURL(
  path.join(__dirname, "../dist/index.html"),
).href;
const allowedUrl = dev ? "http://127.0.0.1:5173/" : productionUrl;
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (
      !win ||
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame ||
      event.senderFrame.url.split("#")[0] !== allowedUrl
    )
      throw new Error("Untrusted request.");
    return fn(...args);
  });
}
async function importPaths(paths) {
  const files = await registerFiles(paths, registry);
  await store.write("media", registry);
  return files;
}
function createWindow() {
  allowClose = false;
  win = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 760,
    minHeight: 660,
    frame: false,
    backgroundColor: "#F1F0EB",
    title: "Forma",
    icon: path.join(__dirname, "../build/icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (url !== allowedUrl) event.preventDefault();
  });
  win.on("close", (event) => {
    if (!allowClose) {
      event.preventDefault();
      win.webContents.send("close:request");
    }
  });
  win.on("closed", () => {
    win = null;
  });
  win.once("ready-to-show", () => win.show());
  win.loadURL(allowedUrl);
}
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  } else if (app.isReady()) createWindow();
});
if (gotLock)
  app
    .whenReady()
    .then(async () => {
      store = new JsonStore(app.getPath("userData"));
      try {
        registry = await store.read("media", {});
        outputDirectory = await store.read(
          "output",
          path.join(app.getPath("videos"), "Forma"),
        );
      } catch (error) {
        dialog.showErrorBox("Forma could not load your library", error.message);
        app.exit(1);
        return;
      }
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      protocol.handle("forma-media", async (request) => {
        const url = new URL(request.url);
        const filename =
          url.hostname === "local"
            ? registry[url.pathname.slice(1)]
            : undefined;
        if (!filename)
          return new Response("Media not registered", { status: 404 });
        try {
          return await net.fetch(pathToFileURL(filename).href, {
            headers: request.headers,
          });
        } catch {
          return new Response("Media missing. Please reimport.", {
            status: 404,
          });
        }
      });
      handle("window", (action) => {
        if (action === "minimize") win.minimize();
        else if (action === "maximize")
          win.isMaximized() ? win.unmaximize() : win.maximize();
        else if (action === "close") win.close();
      });
      handle("close:ready", async () => {
        await store.queue;
        allowClose = true;
        win.close();
      });
      handle("state:load", async () => {
        const state = await store.read("state");
        if (!state) return null;
        validateState(state);
        for (const s of state.sessions)
          for (const file of s.files) {
            const filename = registry[file.id];
            file.missing =
              !filename ||
              !(await fs.stat(filename).catch(() => null))?.isFile();
            file.url = `forma-media://local/${file.id}`;
          }
        state.preferences.outputDirectory = outputDirectory;
        return state;
      });
      handle("state:save", (state) =>
        store.write("state", validateState(state)),
      );
      handle("media:pick", async () => {
        const result = await dialog.showOpenDialog(win, {
          title: "Bring your story in",
          properties: ["openFile", "multiSelections"],
          filters: [{ name: "Video, audio & images", extensions }],
        });
        return result.canceled ? [] : importPaths(result.filePaths);
      });
      handle("media:drop", (paths) => importPaths(paths));
      handle("connection:status", async () => ({
        hasKey: !!(await store.read("credential")),
        encryptionAvailable:
          safeStorage.isEncryptionAvailable() &&
          (process.platform !== "linux" ||
            safeStorage.getSelectedStorageBackend() !== "basic_text"),
      }));
      handle("connection:save", async (key) => {
        if (
          typeof key !== "string" ||
          !/^sk-ant-[A-Za-z0-9_-]{12,500}$/.test(key)
        )
          throw new Error(
            "Enter a valid Anthropic API key beginning with sk-ant-.",
          );
        if (
          !safeStorage.isEncryptionAvailable() ||
          (process.platform === "linux" &&
            safeStorage.getSelectedStorageBackend() === "basic_text")
        )
          throw new Error(
            "OS encryption is unavailable. Your key was not saved.",
          );
        await store.write("credential", {
          encrypted: safeStorage.encryptString(key).toString("base64"),
        });
      });
      handle("connection:remove", () => store.write("credential", null));
      handle("output:choose", async () => {
        const result = await dialog.showOpenDialog(win, {
          title: "Choose your export folder",
          defaultPath: outputDirectory,
          properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled) return null;
        outputDirectory = result.filePaths[0];
        await store.write("output", outputDirectory);
        return outputDirectory;
      });
      handle("output:open", async () => {
        await fs.mkdir(outputDirectory, { recursive: true });
        const error = await shell.openPath(outputDirectory);
        if (error) throw new Error(error);
      });
      createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox("Forma could not start", error.message);
      app.exit(1);
    });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
