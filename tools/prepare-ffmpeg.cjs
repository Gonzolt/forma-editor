const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
async function prepare(platform = process.platform, arch = process.arch) {
  const directory = path.dirname(require.resolve("ffmpeg-static/package.json"));
  const binary = path.join(
    directory,
    platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
  );
  const marker = path.join(directory, ".forma-target");
  const target = `${platform}-${arch}`;
  if (
    (await fs.stat(binary).catch(() => null)) &&
    (await fs.readFile(marker, "utf8").catch(() => "")) === target
  )
    return;
  // Only this package's downloaded executable is replaced for the selected target.
  await fs.rm(binary, { force: true });
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(directory, "install.js")],
      {
        stdio: "inherit",
        windowsHide: true,
        env: {
          ...process.env,
          npm_config_arch: arch,
          npm_config_platform: platform,
        },
      },
    );
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`FFmpeg download failed (${code}).`)),
    );
  });
  await fs.writeFile(marker, target);
}
module.exports = prepare;
if (require.main === module)
  prepare().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
