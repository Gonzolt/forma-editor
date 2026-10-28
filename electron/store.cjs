const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

class JsonStore {
  constructor(directory) {
    this.directory = directory;
    this.queue = Promise.resolve();
  }
  async read(name, fallback = null) {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.directory, name + ".json"), "utf8"),
      );
    } catch (error) {
      if (error.code === "ENOENT") return fallback;
      throw new Error(
        `Cannot read ${name}. Your existing data has been preserved.`,
        { cause: error },
      );
    }
  }
  write(name, value) {
    const write = async () => {
      await fs.mkdir(this.directory, { recursive: true });
      const target = path.join(this.directory, name + ".json");
      const temp = target + "." + randomUUID() + ".tmp";
      try {
        await fs.writeFile(temp, JSON.stringify(value, null, 2), {
          mode: 0o600,
        });
        await fs.rename(temp, target);
      } finally {
        await fs.rm(temp, { force: true });
      }
    };
    const result = this.queue.then(write);
    this.queue = result.catch(() => {});
    return result;
  }
}
function validateState(state) {
  const fail = () => {
    throw new Error("Invalid project data.");
  };
  if (
    !state ||
    typeof state !== "object" ||
    !Array.isArray(state.sessions) ||
    state.sessions.length > 100
  )
    fail();
  if (Buffer.byteLength(JSON.stringify(state)) > 8 * 1024 * 1024)
    throw new Error("Project storage limit reached. Remove older sessions.");
  const str = (s, max = 20000) => typeof s === "string" && s.length <= max;
  const aspects = ["9:16", "16:9", "1:1", "4:5"];
  for (const s of state.sessions) {
    if (
      !str(s.id, 100) ||
      !str(s.title, 150) ||
      !str(s.prompt) ||
      !Array.isArray(s.files) ||
      s.files.length > 100 ||
      !Array.isArray(s.skills) ||
      s.skills.length > 10 ||
      !s.skills.every((x) => str(x, 50)) ||
      !aspects.includes(s.aspect) ||
      !["Auto", "15 seconds", "30 seconds", "60 seconds"].includes(s.length) ||
      !["720p", "1080p", "4K"].includes(s.quality) ||
      !Number.isFinite(s.updatedAt)
    )
      fail();
    for (const f of s.files)
      if (
        !str(f.id, 100) ||
        !str(f.name, 500) ||
        !str(f.url, 1000) ||
        !str(f.extension, 10) ||
        !["video", "audio", "image"].includes(f.kind) ||
        !Number.isFinite(f.size) ||
        f.size < 0 ||
        (f.duration !== undefined &&
          (!Number.isFinite(f.duration) || f.duration < 0))
      )
        fail();
    if (
      s.plan &&
      (!str(s.plan.title, 150) ||
        !str(s.plan.summary, 2000) ||
        !Array.isArray(s.plan.steps) ||
        s.plan.steps.length > 20 ||
        !s.plan.steps.every((x) => str(x, 2000)))
    )
      fail();
  }
  const p = state.preferences;
  if (
    !p ||
    (p.theme !== undefined && !["light", "dark"].includes(p.theme)) ||
    (p.sidebarCollapsed !== undefined &&
      typeof p.sidebarCollapsed !== "boolean") ||
    typeof p.demoMode !== "boolean" ||
    !str(p.defaultModel, 100) ||
    !str(p.outputDirectory, 2000) ||
    !aspects.includes(p.defaultAspect) ||
    !["720p", "1080p", "4K"].includes(p.defaultQuality) ||
    !Array.isArray(p.enabledSkills) ||
    p.enabledSkills.length > 10 ||
    !p.enabledSkills.every((x) => str(x, 50))
  )
    fail();
  if (state.activeId !== undefined && !str(state.activeId, 100)) fail();
  return state;
}
module.exports = { JsonStore, validateState };
