const fs = require("node:fs/promises");
const path = require("node:path");
const { hash, revisions } = require("../electron/motionkit-workspace.cjs");

// electron-builder omits .gitkeep even from extraResources. Restore missing
// tracked files and verify the entire snapshot before an installer is produced.
exports.default = async (context) => {
  const resources = context.packager.getResourcesDir(context.appOutDir);
  const source = path.join(context.packager.projectDir, "vendor/motionkit");
  const destination = path.join(resources, "motionkit");
  for (const [file, expected] of Object.entries(
    revisions.versions[revisions.current],
  )) {
    const target = path.join(destination, file);
    if (!(await fs.stat(target).catch(() => null))) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(source, file), target);
    }
    if ((await hash(target)) !== expected)
      throw new Error(`Packaged MotionKit file failed verification: ${file}`);
  }
};
