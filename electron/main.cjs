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
  nativeTheme,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { JsonStore, validateState } = require("./store.cjs");
const { extensions, registerFiles } = require("./media.cjs");
const { MotionKit } = require("./motionkit.cjs");
const { EditEngine } = require("./edit-engine.cjs");
const {
  ClaudeConnection,
  signInUrl,
  SETUP_URL,
} = require("./claude-connection.cjs");
const {
  UpdateService,
  gitRevision,
  KIT_BASE_REVISION,
} = require("./updates.cjs");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "forma-kit",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
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
let motionKit;
let editEngine;
let updates;
let claudeConnection;
let quitRequested = false;
app.on("before-quit", () => {
  quitRequested = true;
});
const checkOnLaunch =
  !process.env.FORMA_TEST_DATA || !!process.env.FORMA_UPDATE_FIXTURE;
function checkUpdatesAtLaunch() {
  if (checkOnLaunch) void updates?.check().catch(() => {});
}
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
  claudeConnection?.reopen();
  win = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 760,
    minHeight: 660,
    frame: false,
    backgroundColor: nativeTheme.themeSource === "dark" ? "#1d1c19" : "#F1F0EB",
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
  win.once("ready-to-show", () => {
    win.show();
    checkUpdatesAtLaunch();
  });
  win.loadURL(allowedUrl);
}
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    checkUpdatesAtLaunch();
  } else if (app.isReady() && updates) createWindow();
});
if (gotLock)
  app
    .whenReady()
    .then(async () => {
      store = new JsonStore(app.getPath("userData"));
      try {
        const saved = await store.read("state");
        nativeTheme.themeSource =
          saved?.preferences?.theme === "dark" ? "dark" : "light";
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
      motionKit = new MotionKit({
        store,
        userData: app.getPath("userData"),
        bundledRoot: app.isPackaged
          ? path.join(process.resourcesPath, "motionkit")
          : path.join(__dirname, "../vendor/motionkit"),
        outputDirectory: () => outputDirectory,
        registerOutput: async (filename) => (await importPaths([filename]))[0],
        resolveAudio: async (id) => {
          const filename = registry[id];
          return filename &&
            /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(filename) &&
            (await fs.stat(filename).catch(() => null))?.isFile()
            ? filename
            : null;
        },
        onJob: (job) => {
          if (win && !win.isDestroyed())
            win.webContents.send("motionkit:job", job);
        },
      });
      const fixture =
        process.env.FORMA_TEST_DATA && process.env.FORMA_UPDATE_FIXTURE
          ? JSON.parse(
              await fs.readFile(process.env.FORMA_UPDATE_FIXTURE, "utf8"),
            )
          : null;
      updates = new UpdateService({
        version: app.getVersion(),
        store,
        fetch: fixture
          ? async (url) =>
              new Response(
                JSON.stringify(
                  url.includes("/releases/latest")
                    ? fixture.release
                    : fixture.commits,
                ),
                { status: 200, headers: { etag: '"fixture"' } },
              )
          : (url, options) => net.fetch(url, options),
        kitContext: async () => {
          await motionKit.ensure();
          if (!(await fs.stat(motionKit.root)).isDirectory())
            throw new Error("MotionKit project missing.");
          const revision = await gitRevision(motionKit.root);
          const managed = await fs
            .realpath(path.join(app.getPath("userData"), "motionkit"))
            .catch(() => null);
          const isManaged = motionKit.root === managed;
          return {
            root: motionKit.root,
            revision: revision || (isManaged ? KIT_BASE_REVISION : null),
            mode: revision ? "git" : isManaged ? "bundled" : "external",
          };
        },
        onChange: (state) => {
          if (win && !win.isDestroyed())
            win.webContents.send("updates:status", state);
        },
      });
      const claudeTest =
        process.env.FORMA_TEST_DATA && process.env.FORMA_CLAUDE_FIXTURE
          ? require("./claude-fixture.cjs").claudeFixture(
              process.env.FORMA_CLAUDE_FIXTURE,
              app.getPath("userData"),
            )
          : {};
      claudeConnection = new ClaudeConnection({
        store,
        ...claudeTest,
        onChange: (state) => {
          if (win && !win.isDestroyed())
            win.webContents.send("claude:status", state);
        },
      });
      editEngine = new EditEngine({
        ffmpeg: motionKit.ffmpeg,
        claude: claudeConnection,
        resolve: async (id) => {
          const filename = registry[id];
          return filename &&
            (await fs.stat(filename).catch(() => null))?.isFile()
            ? filename
            : null;
        },
        workRoot: path.join(app.getPath("temp"), "forma-edits"),
        outputDirectory: () => outputDirectory,
        registerOutput: async (filename) => (await importPaths([filename]))[0],
        store,
        onJob: (job) => {
          if (win && !win.isDestroyed()) win.webContents.send("edit:job", job);
        },
      });
      handle("edit:start", async (options) => {
        try {
          return await editEngine.start(options);
        } catch (error) {
          // IPC drops custom error fields, so the code travels in the message.
          throw new Error(
            error.code ? `[${error.code}] ${error.message}` : error.message,
          );
        }
      });
      handle("edit:cancel", () => editEngine.cancel());
      handle("claude:status", () => claudeConnection.check());
      handle("claude:login", () => claudeConnection.login());
      handle("claude:cancel", () => claudeConnection.cancelLogin());
      handle("claude:logout", () => claudeConnection.logout());
      handle("claude:choose", async () => {
        const result = await dialog.showOpenDialog(win, {
          title: "Choose the native Claude Code executable",
          properties: ["openFile"],
          ...(process.platform === "win32"
            ? { filters: [{ name: "Claude Code", extensions: ["exe"] }] }
            : {}),
        });
        return result.canceled
          ? null
          : claudeConnection.choose(result.filePaths[0]);
      });
      handle("claude:open", (target) => {
        if (target === "setup") return shell.openExternal(SETUP_URL);
        const url = claudeConnection.snapshot().loginUrl;
        if (target === "login" && url && signInUrl(url) === url)
          return shell.openExternal(url);
        throw new Error("No Claude sign-in page is available.");
      });
      handle("updates:status", () => updates.snapshot());
      handle("updates:check", () => updates.check());
      handle("updates:open", (target) => {
        if (target === "forma")
          return shell.openExternal(updates.snapshot().app.releaseUrl);
        if (target === "motionkit")
          return shell.openExternal(
            "https://github.com/Gonzolt/motionkit/commits",
          );
        throw new Error("Unknown update destination.");
      });
      protocol.handle("forma-kit", (request) => motionKit.serve(request));
      handle("motionkit:status", () => motionKit.status());
      handle("motionkit:preview", (id) => motionKit.preview(id));
      handle("motionkit:export", (options) => motionKit.start(options));
      handle("motionkit:cancel", () => motionKit.cancel());
      handle("motionkit:exports", () => motionKit.exports());
      handle("motionkit:choose", async () => {
        if (motionKit.active)
          throw new Error("Stop the export before changing projects.");
        const result = await dialog.showOpenDialog(win, {
          title: "Choose a MotionKit project",
          properties: ["openDirectory"],
        });
        if (result.canceled) return null;
        const selected = await motionKit.choose(result.filePaths[0]);
        await updates.refreshContext();
        return selected;
      });
      handle("motionkit:reveal", async (id) => {
        const record = (await motionKit.exports()).find(
          (record) => record.id === id,
        );
        if (!record || record.missing)
          throw new Error("That export has moved or is no longer available.");
        shell.showItemInFolder(record.path);
      });
      handle("motionkit:open-project", async () => {
        await motionKit.ensure();
        const error = await shell.openPath(motionKit.root);
        if (error) throw new Error(error);
      });
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
      handle("theme:set", (theme) => {
        if (!["light", "dark"].includes(theme))
          throw new Error("Invalid theme.");
        nativeTheme.themeSource = theme;
        win.setBackgroundColor(theme === "dark" ? "#1d1c19" : "#F1F0EB");
      });
      handle("window", (action) => {
        if (action === "minimize") win.minimize();
        else if (action === "maximize")
          win.isMaximized() ? win.unmaximize() : win.maximize();
        else if (action === "close") win.close();
      });
      handle("close:ready", async () => {
        await editEngine.close();
        await claudeConnection.close();
        await updates.close();
        await motionKit.close();
        await store.queue;
        allowClose = true;
        // app.quit() was cancelled when the first close was deferred for saving.
        // Resume it explicitly: macOS otherwise keeps the windowless app alive.
        if (quitRequested) app.quit();
        else win.close();
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
        if (!win) createWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox("Forma could not start", error.message);
      app.exit(1);
    });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
