const { BrowserWindow, session, net } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { randomUUID } = require("node:crypto");
const {
  inside,
  validateProject,
  listFilms,
  listGuides,
  serveProject,
} = require("./kit-project.cjs");

function deadline(promise, ms = 30000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "The film stopped responding. Check its source and try again.",
            ),
          ),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}
const cancelled = () => new Error("Export cancelled.");

class MotionKit {
  constructor({
    store,
    userData,
    bundledRoot,
    outputDirectory,
    registerOutput,
    resolveAudio,
    onJob,
  }) {
    Object.assign(this, {
      store,
      userData,
      bundledRoot,
      outputDirectory,
      registerOutput,
      resolveAudio,
      onJob,
    });
    this.root = null;
    this.windows = new Set();
    this.active = null;
    this.job = null;
    this.partition = session.fromPartition("forma-motionkit");
    this.partition.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    this.partition.setPermissionCheckHandler(() => false);
    this.partition.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*", "file:///*"] },
      (_details, callback) => callback({ cancel: true }),
    );
    this.partition.protocol.handle("forma-kit", (request) =>
      this.serve(request),
    );
    const binary = require("ffmpeg-static");
    this.ffmpeg = binary?.replace(
      "app.asar" + path.sep,
      "app.asar.unpacked" + path.sep,
    );
  }
  async ensure() {
    if (!this.initializing)
      this.initializing = this.initialize().catch((error) => {
        this.initializing = null;
        throw error;
      });
    return this.initializing;
  }
  async initialize() {
    const saved = await this.store.read("motionkit");
    const managed = path.join(this.userData, "motionkit");
    if (!saved?.root && !(await fs.stat(managed).catch(() => null))) {
      const temporary = path.join(
        this.userData,
        `motionkit-seeding-${randomUUID()}`,
      );
      if (!inside(this.userData, temporary))
        throw new Error("Invalid project directory.");
      try {
        await fs.cp(this.bundledRoot, temporary, { recursive: true });
        await validateProject(temporary);
        await fs.rename(temporary, managed);
      } finally {
        await fs
          .rm(temporary, { recursive: true, force: true })
          .catch(() => {});
      }
    }
    this.root = await validateProject(saved?.root || managed);
  }
  async status() {
    await this.ensure();
    return {
      root: this.root,
      source: "https://github.com/Gonzolt/motionkit",
      revision: "4c8d08e78f8132a4525b4df2c34ef2b41110d66b",
      films: await listFilms(this.root),
      guides: await listGuides(this.root),
      encoderReady:
        !!this.ffmpeg && !!(await fs.stat(this.ffmpeg).catch(() => null)),
      job: this.job,
      exports: await this.exports(),
    };
  }
  async choose(root) {
    if (this.active)
      throw new Error("Stop the current export before changing projects.");
    this.root = await validateProject(root);
    await this.store.write("motionkit", { root: this.root });
    this.initializing = Promise.resolve();
    for (const window of this.windows)
      if (!window.isDestroyed()) window.destroy();
    return this.status();
  }
  async serve(request) {
    await this.ensure();
    return serveProject(this.root, request, net);
  }
  async film(id) {
    await this.ensure();
    const film = (await listFilms(this.root)).find((film) => film.id === id);
    if (!film)
      throw new Error(
        "That film is no longer in this MotionKit project. Refresh the film list.",
      );
    return film;
  }
  window() {
    const window = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      width: 1080,
      height: 1920,
      backgroundColor: "#000000",
      webPreferences: {
        session: this.partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        offscreen: true,
      },
    });
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith("forma-kit://project/")) event.preventDefault();
    });
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    this.windows.add(window);
    window.on("closed", () => this.windows.delete(window));
    return window;
  }
  async loadFilm(window, film) {
    const errors = [];
    window.webContents.on("console-message", (details) => {
      if (details.level === "error") errors.push(details.message);
    });
    await deadline(window.loadURL(film.url + "?export"));
    for (let i = 0; i < 150; i++) {
      if (window.isDestroyed()) throw cancelled();
      if (
        await deadline(
          window.webContents.executeJavaScript("!!window.PK"),
          5000,
        )
      )
        break;
      if (i === 149)
        throw new Error(
          `The film did not initialize. ${errors.slice(-3).join(" ") || "Check that it calls MotionKit's runFilm()."}`,
        );
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    await deadline(
      window.webContents.executeJavaScript(
        "Promise.resolve(window.PK.ready).then(() => true)",
      ),
    );
    const meta = await deadline(
      window.webContents.executeJavaScript(
        "({ duration: window.PK.DURATION, width: parseFloat(getComputedStyle(document.getElementById('stage')).width), height: parseFloat(getComputedStyle(document.getElementById('stage')).height) })",
      ),
    );
    if (
      ![meta.duration, meta.width, meta.height].every(Number.isFinite) ||
      meta.duration <= 0 ||
      meta.duration > 3600 ||
      meta.width < 2 ||
      meta.height < 2 ||
      meta.width > 8192 ||
      meta.height > 8192
    )
      throw new Error("The film has an unsupported duration or frame size.");
    return meta;
  }
  async preview(id) {
    const film = await this.film(id);
    const window = this.window();
    try {
      return { ...film, ...(await this.loadFilm(window, film)) };
    } finally {
      if (!window.isDestroyed()) window.destroy();
    }
  }
  emit(patch) {
    this.job = {
      ...this.job,
      ...patch,
      revision: (this.job?.revision || 0) + 1,
    };
    this.onJob(this.job);
  }
  async start(options) {
    if (this.active) throw new Error("One export is already running.");
    if (
      !options ||
      typeof options.filmId !== "string" ||
      !["360p", "720p", "1080p", "4K"].includes(options.quality) ||
      ![24, 30, 60].includes(options.fps) ||
      !Number.isFinite(options.from) ||
      !Number.isFinite(options.to) ||
      options.from < 0 ||
      options.to <= options.from ||
      (options.audioId !== undefined && typeof options.audioId !== "string")
    )
      throw new Error("Invalid export settings.");
    await this.film(options.filmId);
    if (this.active) throw new Error("One export is already running.");
    const active = {
      cancelled: false,
      window: null,
      process: null,
      completion: null,
    };
    this.active = active;
    this.job = {
      id: randomUUID(),
      filmId: options.filmId,
      status: "preparing",
      progress: 0,
      frame: 0,
      total: 0,
      message: "Loading the film",
      revision: 0,
    };
    this.emit({});
    active.completion = this.render(active, options)
      .catch((error) => {
        this.emit({
          status: active.cancelled ? "cancelled" : "failed",
          message: active.cancelled
            ? "Export stopped. No unfinished video was added."
            : error.message,
        });
      })
      .finally(() => {
        if (this.active === active) this.active = null;
      });
    return this.job;
  }
  async render(active, options) {
    let partial;
    let audioCopy;
    try {
      if (!this.ffmpeg || !(await fs.stat(this.ffmpeg).catch(() => null)))
        throw new Error(
          "The bundled FFmpeg encoder is missing. Reinstall Forma or run npm ci from source.",
        );
      const film = await this.film(options.filmId);
      if (active.cancelled) throw cancelled();
      active.window = this.window();
      const meta = await this.loadFilm(active.window, film);
      if (options.from >= meta.duration || options.to > meta.duration + 0.001)
        throw new Error("Choose a range within the film's duration.");
      const duration = Math.min(options.to, meta.duration) - options.from;
      const shortEdge = { "360p": 360, "720p": 720, "1080p": 1080, "4K": 2160 }[
        options.quality
      ];
      const scale = shortEdge / Math.min(meta.width, meta.height);
      const width = Math.max(2, Math.round((meta.width * scale) / 2) * 2);
      const height = Math.max(2, Math.round((meta.height * scale) / 2) * 2);
      if (Math.max(width, height) > 7680)
        throw new Error(
          "Choose a smaller resolution for this film's aspect ratio.",
        );
      const total = Math.max(1, Math.round(duration * options.fps));
      const debugger_ = active.window.webContents.debugger;
      debugger_.attach("1.3");
      await deadline(debugger_.sendCommand("Page.enable"));
      await deadline(
        debugger_.sendCommand("Emulation.setDeviceMetricsOverride", {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: false,
        }),
      );
      const directory = this.outputDirectory();
      await fs.mkdir(directory, { recursive: true });
      const name = `${film.id.replace(/[^a-z0-9_-]/gi, "-").slice(0, 65)}-${new Date().toISOString().replace(/[:.]/g, "-")}-${this.job.id.slice(0, 6)}.mp4`;
      const output = path.join(directory, name);
      partial = path.join(directory, `.${this.job.id}.exporting.mp4`);
      let audio;
      if (options.audioId) {
        audio = await this.resolveAudio(options.audioId);
        if (!audio)
          throw new Error(
            "The selected soundtrack is no longer available. Reimport it.",
          );
        audioCopy = path.join(
          this.userData,
          `motionkit-audio-${this.job.id}${path.extname(audio)}`,
        );
        await fs.copyFile(audio, audioCopy);
        audio = audioCopy;
      }
      if (active.cancelled) throw cancelled();
      const args = [
        "-y",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-framerate",
        String(options.fps),
        "-i",
        "-",
        ...(audio
          ? [
              "-ss",
              String(options.from),
              "-i",
              audio,
              "-map",
              "0:v:0",
              "-map",
              "1:a:0",
              "-af",
              "apad",
              "-c:a",
              "aac",
              "-b:a",
              "192k",
            ]
          : ["-an"]),
        "-t",
        String(total / options.fps),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-vf",
        "scale=in_range=full:out_range=limited,format=yuv420p",
        "-r",
        String(options.fps),
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_range",
        "tv",
        "-movflags",
        "+faststart",
        partial,
      ];
      const encoder = spawn(this.ffmpeg, args, {
        stdio: ["pipe", "ignore", "pipe"],
        windowsHide: true,
      });
      active.process = encoder;
      let errorLog = "";
      encoder.stderr.on("data", (data) => {
        errorLog = (errorLog + data).slice(-12000);
      });
      encoder.stdin.on("error", () => {});
      let spawnError;
      encoder.on("error", (error) => {
        spawnError = error;
      });
      const closed = new Promise((resolve) =>
        encoder.once("close", (code) => resolve(code)),
      );
      active.closed = closed;
      this.emit({
        status: "rendering",
        total,
        message: "Rendering MotionKit frames",
      });
      for (let i = 0; i < total; i++) {
        if (active.cancelled || active.window.isDestroyed()) throw cancelled();
        if (spawnError) throw spawnError;
        if (encoder.exitCode !== null)
          throw new Error(`The encoder stopped. ${errorLog.slice(-1500)}`);
        await deadline(
          active.window.webContents.executeJavaScript(
            `window.PK.frame(${(options.from + i / options.fps).toFixed(7)}); true`,
          ),
        );
        const frame = await deadline(
          debugger_.sendCommand("Page.captureScreenshot", {
            format: "jpeg",
            quality: 100,
            captureBeyondViewport: false,
            fromSurface: true,
          }),
        );
        if (!encoder.stdin.write(Buffer.from(frame.data, "base64"))) {
          const drain = once(encoder.stdin, "drain");
          const result = await deadline(
            Promise.race([
              drain.then(() => "drain"),
              closed.then(() => "closed"),
            ]),
            60000,
          );
          if (result === "closed")
            throw new Error(`The encoder stopped. ${errorLog.slice(-1500)}`);
        }
        if (i % 3 === 0 || i === total - 1)
          this.emit({
            frame: i + 1,
            progress: Math.min(96, ((i + 1) / total) * 96),
          });
      }
      this.emit({
        status: "encoding",
        progress: 97,
        message: "Finishing the MP4",
      });
      encoder.stdin.end();
      const code = await deadline(closed, 120000);
      if (active.cancelled) throw cancelled();
      if (code !== 0)
        throw new Error(
          `FFmpeg could not finish the video. ${errorLog.slice(-1500)}`,
        );
      this.emit({
        status: "verifying",
        progress: 99,
        message: "Verifying the finished video",
      });
      await deadline(this.verify(partial, active, !!audio), 60000);
      if (active.cancelled) throw cancelled();
      const size = (await fs.stat(partial)).size;
      if (size < 100) throw new Error("The encoder produced an empty file.");
      await fs.rename(partial, output);
      partial = null;
      const media = await this.registerOutput(output);
      const record = {
        id: media.id,
        title: film.name,
        filmId: film.id,
        name,
        path: output,
        size,
        duration: total / options.fps,
        width,
        height,
        fps: options.fps,
        createdAt: Date.now(),
        hasAudio: !!audio,
      };
      const records = await this.store.read("exports", []);
      await this.store.write("exports", [record, ...records].slice(0, 500));
      this.emit({
        status: "completed",
        progress: 100,
        message: "Your video is ready",
        result: { ...record, url: media.url },
      });
    } finally {
      if (active.process && active.process.exitCode === null)
        active.process.kill();
      if (active.closed) await deadline(active.closed, 5000).catch(() => {});
      if (active.window && !active.window.isDestroyed())
        active.window.destroy();
      if (partial) await fs.rm(partial, { force: true }).catch(() => {});
      if (audioCopy) await fs.rm(audioCopy, { force: true }).catch(() => {});
    }
  }
  async verify(filename, active, hasAudio) {
    await new Promise((resolve, reject) => {
      const child = spawn(
        this.ffmpeg,
        [
          "-v",
          "error",
          "-i",
          filename,
          "-map",
          "0:v:0",
          ...(hasAudio ? ["-map", "0:a:0", "-frames:a", "1"] : []),
          "-frames:v",
          "1",
          "-f",
          "null",
          "-",
        ],
        { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
      );
      active.process = child;
      active.closed = new Promise((resolve) => child.once("close", resolve));
      let log = "";
      child.stderr.on("data", (data) => {
        log = (log + data).slice(-3000);
      });
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`The exported MP4 could not be decoded. ${log}`)),
      );
    });
  }
  async exports() {
    const records = await this.store.read("exports", []);
    if (!Array.isArray(records))
      throw new Error(
        "Your export library could not be read. Existing files are preserved.",
      );
    return Promise.all(
      records.map(async (record) => ({
        ...record,
        url: `forma-media://local/${record.id}`,
        missing: !(await fs.stat(record.path).catch(() => null))?.isFile(),
      })),
    );
  }
  async cancel() {
    const active = this.active;
    if (!active) return;
    active.cancelled = true;
    active.process?.kill();
    if (active.window && !active.window.isDestroyed()) active.window.destroy();
    await active.completion;
  }
  async close() {
    await this.cancel();
    for (const window of this.windows)
      if (!window.isDestroyed()) window.destroy();
  }
}
module.exports = { MotionKit, deadline };
