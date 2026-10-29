const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const revisions = require("./motionkit-revisions.json");
const { inside, validateProject } = require("./kit-project.cjs");
async function hash(filename) {
  try {
    let data = await fs.readFile(filename);
    // Old Windows installers may have CRLF text; line endings alone are not a user edit.
    if (
      /\.(js|mjs|cjs|json|md|css|html|txt|py|ps1|sh|toml|yaml|yml|xml|svg|csv)$/i.test(
        filename,
      )
    )
      data = Buffer.from(data.toString("utf8").replace(/\r\n/g, "\n"));
    return createHash("sha256").update(data).digest("hex");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function prepareWorkspace({
  store,
  userData,
  bundledRoot,
  fresh = false,
}) {
  await fs.mkdir(userData, { recursive: true });
  userData = await fs.realpath(userData);
  const original = await store.read("motionkit", null);
  const saved = fresh ? null : original;
  const legacyRoot = path.join(userData, "motionkit");
  const exists = fresh
    ? null
    : await fs.stat(saved?.root || legacyRoot).catch(() => null);
  if (saved?.root && !exists)
    throw new Error(
      "Your MotionKit project has moved. Choose it again; its files were not changed.",
    );
  const source = exists
    ? await validateProject(saved?.root || legacyRoot)
    : null;
  const isManaged =
    !source ||
    source === (await fs.realpath(legacyRoot).catch(() => null)) ||
    (!!saved?.managed && inside(userData, source));
  if (!isManaged)
    return { root: source, revision: null, managed: false, conflicts: [] };
  if (saved?.revision === revisions.current && source)
    return { ...saved, root: source };
  const parentPath = path.join(userData, "motionkit-projects");
  await fs.mkdir(parentPath, { recursive: true });
  const parent = await fs.realpath(parentPath);
  if (!inside(userData, parent))
    throw new Error(
      "The managed MotionKit folder points outside Forma's data directory.",
    );
  const destination = path.join(
    parent,
    `project-${revisions.current.slice(0, 7)}-${randomUUID().slice(0, 8)}`,
  );
  if (!inside(userData, destination))
    throw new Error("Invalid workspace destination.");
  const oldFiles =
    revisions.versions[saved?.revision || revisions.legacy] || {};
  const newFiles = revisions.versions[revisions.current];
  const conflicts = [];
  let created = false;
  try {
    await fs.mkdir(destination);
    created = true;
    if (source)
      await fs.cp(source, destination, {
        recursive: true,
        verbatimSymlinks: true,
      });
    for (const [file, next] of Object.entries(newFiles)) {
      const target = path.join(destination, file);
      let parent = destination;
      let safe = true;
      for (const segment of file.split("/").slice(0, -1)) {
        parent = path.join(parent, segment);
        const entry = await fs.lstat(parent).catch(() => null);
        if (entry && (!entry.isDirectory() || entry.isSymbolicLink())) {
          safe = false;
          break;
        }
        if (!entry) await fs.mkdir(parent);
      }
      if (!safe) {
        conflicts.push(file);
        continue;
      }
      const resolvedParent = await fs.realpath(path.dirname(target));
      if (
        !inside(destination, resolvedParent) ||
        (await fs.lstat(target).catch(() => null))?.isSymbolicLink()
      ) {
        conflicts.push(file);
        continue;
      }
      const current = await hash(target);
      if (!current || current === oldFiles[file] || current === next) {
        await fs.copyFile(path.join(bundledRoot, file), target);
      } else if (oldFiles[file] !== next) conflicts.push(file);
    }
    await validateProject(destination);
    const record = {
      root: await fs.realpath(destination),
      revision: revisions.current,
      managed: true,
      conflicts,
      previousRoot: source || (fresh ? original?.root || null : null),
    };
    await store.write("motionkit", record);
    return record;
  } catch (error) {
    // Only a newly allocated app-owned directory is removed; the old project stays intact.
    if (created && inside(parent, destination))
      await fs
        .rm(destination, { recursive: true, force: true })
        .catch(() => {});
    throw error;
  }
}
module.exports = { prepareWorkspace, revisions, hash };
