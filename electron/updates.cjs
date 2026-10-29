const fs = require("node:fs/promises");
const path = require("node:path");
const semver = require("semver");

const APP_REPOSITORY = "Gonzolt/forma-editor";
const KIT_REPOSITORY = "Gonzolt/motionkit";
const KIT_BASE_REVISION = require("./motionkit-revisions.json").current;
const SHA = /^[a-f0-9]{40}$/i;

async function smallText(filename) {
  try {
    if ((await fs.stat(filename)).size > 1024 * 1024) return null;
    return (await fs.readFile(filename, "utf8")).trim();
  } catch {
    return null;
  }
}

// Read Git's revision without requiring Git or running project scripts/hooks.
async function gitRevision(root) {
  let directory = path.join(root, ".git");
  const stat = await fs.stat(directory).catch(() => null);
  if (!stat) return null;
  if (stat.isFile()) {
    const pointer = await smallText(directory);
    if (!pointer?.startsWith("gitdir: ")) return null;
    directory = path.resolve(root, pointer.slice(8));
  }
  const head = await smallText(path.join(directory, "HEAD"));
  if (SHA.test(head || "")) return head.toLowerCase();
  const ref = head?.startsWith("ref: ") ? head.slice(5) : null;
  if (
    !ref ||
    !ref.startsWith("refs/") ||
    !/^[a-z0-9/_\-.]+$/i.test(ref) ||
    ref.split("/").some((part) => !part || part === "." || part === "..")
  )
    return null;
  const common = await smallText(path.join(directory, "commondir"));
  const base = common ? path.resolve(directory, common) : directory;
  const loose = await smallText(path.join(base, ref));
  if (SHA.test(loose || "")) return loose.toLowerCase();
  const packed = await smallText(path.join(base, "packed-refs"));
  const line = packed?.split(/\r?\n/).find((line) => line.endsWith(" " + ref));
  const revision = line?.split(" ")[0];
  return SHA.test(revision || "") ? revision.toLowerCase() : null;
}

function appRelease(currentVersion, release) {
  if (!release || release.draft || release.prerelease)
    return {
      state: "unpublished",
      available: false,
      currentVersion,
      latestVersion: null,
      releaseUrl: `https://github.com/${APP_REPOSITORY}/releases`,
    };
  const tag = release.tag_name;
  const version = typeof tag === "string" && semver.valid(tag);
  if (!version || semver.prerelease(version))
    throw new Error(
      "GitHub's latest release does not have a stable version tag.",
    );
  return {
    state: semver.gt(version, currentVersion) ? "available" : "current",
    available: semver.gt(version, currentVersion),
    currentVersion,
    latestVersion: version,
    releaseUrl: `https://github.com/${APP_REPOSITORY}/releases/tag/${encodeURIComponent(tag)}`,
  };
}

class UpdateService {
  constructor({ version, store, fetch, kitContext, onChange = () => {} }) {
    Object.assign(this, { version, store, fetch, kitContext, onChange });
    this.cache = null;
    this.pending = null;
    this.controller = null;
    this.closing = false;
    this.state = {
      checking: false,
      checkedAt: null,
      app: {
        state: "idle",
        available: false,
        currentVersion: version,
        latestVersion: null,
        releaseUrl: `https://github.com/${APP_REPOSITORY}/releases`,
      },
      motionkit: {
        state: "idle",
        available: false,
        currentRevision: null,
        latestRevision: null,
        mode: "unknown",
        root: "",
        sourceUrl: `https://github.com/${KIT_REPOSITORY}`,
      },
    };
  }
  snapshot() {
    return structuredClone(this.state);
  }
  emit() {
    this.onChange(this.snapshot());
  }
  async json(key, url, signal) {
    const cached = this.cache[key];
    const response = await this.fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": `Forma/${this.version}`,
        ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
      },
      credentials: "omit",
      signal,
    });
    if (response.status === 304 && cached?.data) return cached.data;
    if (!response.ok) {
      const error = new Error(
        response.status === 403 || response.status === 429
          ? "GitHub's public request limit was reached. Try again later."
          : response.status === 404
            ? "No public release or repository was found."
            : "GitHub could not complete the update check. Try again later.",
      );
      error.status = response.status;
      throw error;
    }
    const text = await response.text();
    if (text.length > 1024 * 1024)
      throw new Error("GitHub returned an oversized update response.");
    const data = JSON.parse(text);
    this.cache[key] = { etag: response.headers.get("etag"), data };
    return data;
  }
  async refreshContext() {
    try {
      const context = await this.kitContext();
      const current = context.revision || null;
      const latest = this.state.motionkit.latestRevision;
      this.state.motionkit = {
        ...this.state.motionkit,
        root: context.root,
        mode: context.mode,
        currentRevision: current,
        available: !!current && !!latest && current !== latest,
        state:
          this.state.motionkit.state === "error"
            ? "error"
            : !latest
              ? "idle"
              : !current
                ? "unknown"
                : current !== latest
                  ? "available"
                  : "current",
      };
    } catch {
      this.state.motionkit = {
        ...this.state.motionkit,
        state: "error",
        currentRevision: null,
        mode: "unknown",
        available: false,
        error:
          "The current MotionKit project could not be read. Choose a project, then check again.",
      };
    }
    this.emit();
    return this.snapshot();
  }
  check() {
    if (this.pending) return this.pending;
    this.closing = false;
    this.pending = this.performCheck().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  async performCheck() {
    if (!this.cache) {
      const saved = await this.store
        .read("github-update-cache", {})
        .catch(() => ({}));
      this.cache =
        saved && typeof saved === "object" && !Array.isArray(saved)
          ? saved
          : {};
    }
    if (this.closing) return this.snapshot();
    this.state.checking = true;
    this.emit();
    this.controller = new AbortController();
    const timer = setTimeout(() => this.controller?.abort(), 12000);
    try {
      await this.refreshContext();
      const signal = this.controller.signal;
      const [app, kit] = await Promise.allSettled([
        this.json(
          "app",
          `https://api.github.com/repos/${APP_REPOSITORY}/releases/latest`,
          signal,
        ),
        this.json(
          "motionkit",
          `https://api.github.com/repos/${KIT_REPOSITORY}/commits?per_page=1`,
          signal,
        ),
      ]);
      if (app.status === "fulfilled" || app.reason.status === 404) {
        if (app.status === "rejected") delete this.cache.app;
        try {
          this.state.app = appRelease(
            this.version,
            app.status === "fulfilled" ? app.value : null,
          );
        } catch (error) {
          this.state.app = {
            ...this.state.app,
            state: "error",
            error: error.message,
          };
        }
      } else {
        if (this.cache.app?.data) {
          try {
            this.state.app = appRelease(this.version, this.cache.app.data);
          } catch {
            /* Keep the last known result. */
          }
        }
        this.state.app = {
          ...this.state.app,
          state: "error",
          error: app.reason.status
            ? app.reason.message
            : "Could not reach GitHub. Your app is ready to use offline.",
        };
      }
      if (kit.status === "fulfilled" && SHA.test(kit.value?.[0]?.sha || "")) {
        const latest = kit.value[0].sha.toLowerCase();
        const current = this.state.motionkit.currentRevision;
        this.state.motionkit = {
          ...this.state.motionkit,
          latestRevision: latest,
          available: !!current && current !== latest,
          state: !current
            ? "unknown"
            : current !== latest
              ? "available"
              : "current",
          error: undefined,
        };
      } else {
        this.state.motionkit = {
          ...this.state.motionkit,
          state: "error",
          error:
            kit.status === "rejected" && kit.reason.status
              ? kit.reason.message
              : "Could not check MotionKit on GitHub. Your project is ready to use offline.",
        };
      }
      await this.store.write("github-update-cache", this.cache).catch(() => {});
    } finally {
      clearTimeout(timer);
      this.controller = null;
      this.state.checking = false;
      this.state.checkedAt = Date.now();
      this.emit();
    }
    return this.snapshot();
  }
  async close() {
    this.closing = true;
    this.controller?.abort();
    await this.pending?.catch(() => {});
  }
}
module.exports = {
  UpdateService,
  appRelease,
  gitRevision,
  APP_REPOSITORY,
  KIT_REPOSITORY,
  KIT_BASE_REVISION,
};
