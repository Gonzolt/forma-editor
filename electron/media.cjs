const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const extensions = [
  "mp4",
  "mov",
  "webm",
  "m4v",
  "mkv",
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "flac",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
];
function kind(extension) {
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(extension)
    ? "image"
    : ["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(extension)
      ? "audio"
      : "video";
}
async function registerFiles(paths, registry) {
  if (!Array.isArray(paths) || paths.length > 100)
    throw new Error("Import up to 100 files at a time.");
  const files = [];
  for (const filename of paths) {
    if (typeof filename !== "string" || !path.isAbsolute(filename)) continue;
    const extension = path.extname(filename).slice(1).toLowerCase();
    if (!extensions.includes(extension)) continue;
    const stat = await fs.stat(filename);
    if (!stat.isFile()) continue;
    const existing = Object.entries(registry).find(([, p]) => p === filename);
    const id = existing?.[0] || randomUUID();
    registry[id] = filename;
    files.push({
      id,
      name: path.basename(filename),
      size: stat.size,
      extension: extension.toUpperCase(),
      kind: kind(extension),
      url: `forma-media://local/${id}`,
    });
  }
  return files;
}
module.exports = { extensions, kind, registerFiles };
