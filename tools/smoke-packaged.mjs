import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const arch = process.argv[2] || process.arch;
const binary =
  process.platform === "win32"
    ? "release/win-unpacked/Forma.exe"
    : `release/mac${arch === "arm64" ? "-arm64" : ""}/Forma.app/Contents/MacOS/Forma`;
const executable = path.join(root, binary);
if (!fs.existsSync(executable))
  throw new Error(`Packaged Forma is missing: ${executable}`);
for (const script of ["smoke-claude.mjs", "smoke-social.mjs"]) {
  const result = spawnSync(
    process.execPath,
    [path.join(root, "tools", script)],
    {
      cwd: root,
      env: { ...process.env, FORMA_EXECUTABLE: executable },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
