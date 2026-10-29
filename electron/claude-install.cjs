const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const BASE = "https://downloads.claude.ai/claude-code-releases";
function trusted(response, requested) {
  const url = new URL(response.url || requested);
  if (
    !response.ok ||
    url.protocol !== "https:" ||
    url.hostname !== "downloads.claude.ai" ||
    url.username ||
    url.password
  )
    throw new Error(
      "Claude Code's download service is unavailable. Try again later.",
    );
}
async function installClaude({
  fetch,
  run,
  workRoot,
  platform = process.platform,
  arch = process.arch,
  env,
  signal,
  onProgress = () => {},
}) {
  if (
    !["win32", "darwin", "linux"].includes(platform) ||
    !["x64", "arm64"].includes(arch)
  )
    throw new Error(
      "Install Claude Code using Anthropic's setup guide for this system.",
    );
  const request = async (url) => {
    const response = await fetch(url, {
      signal,
      credentials: "omit",
      cache: "no-store",
    });
    trusted(response, url);
    return response;
  };
  const small = async (url) => {
    const response = await request(url);
    if (Number(response.headers.get("content-length")) > 128000)
      throw new Error("Unexpected Claude Code download metadata.");
    const text = await response.text();
    if (text.length > 128000)
      throw new Error("Unexpected Claude Code download metadata.");
    return text;
  };
  onProgress({
    message: "Finding the official Claude Code installer…",
    progress: 0,
  });
  const version = (await small(`${BASE}/latest`)).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error(
      "Claude Code's download service returned an invalid version.",
    );
  const manifest = JSON.parse(await small(`${BASE}/${version}/manifest.json`));
  const target = `${platform}-${arch}`;
  const item = manifest.platforms?.[target];
  if (
    !/^[a-f0-9]{64}$/i.test(item?.checksum || "") ||
    !Number.isInteger(item?.size) ||
    item.size < 1 ||
    item.size > 512 * 1024 * 1024
  )
    throw new Error("Claude Code's installer metadata could not be verified.");
  await fs.mkdir(workRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(workRoot, "install-"));
  const binary = path.join(
    directory,
    platform === "win32" ? "claude.exe" : "claude",
  );
  let handle;
  try {
    const response = await request(
      `${BASE}/${version}/${target}/${path.basename(binary)}`,
    );
    if (!response.body)
      throw new Error("The Claude Code installer download was empty.");
    handle = await fs.open(binary, "wx", 0o700);
    const hash = createHash("sha256");
    let received = 0,
      last = 0;
    for await (const value of response.body) {
      if (signal?.aborted) throw new Error("Installation cancelled.");
      const chunk = Buffer.from(value);
      received += chunk.length;
      if (received > item.size)
        throw new Error("The installer download was larger than expected.");
      hash.update(chunk);
      await handle.writeFile(chunk);
      if (Date.now() - last > 250) {
        onProgress({
          message: "Downloading Claude Code…",
          progress: Math.min(94, Math.floor((received / item.size) * 94)),
        });
        last = Date.now();
      }
    }
    await handle.close();
    handle = null;
    if (
      received !== item.size ||
      hash.digest("hex") !== item.checksum.toLowerCase()
    )
      throw new Error(
        "The Claude Code download failed its checksum check. Nothing was installed.",
      );
    if (signal?.aborted) throw new Error("Installation cancelled.");
    onProgress({ message: "Installing verified Claude Code…", progress: 96 });
    // This is the same native bootstrap command used by Anthropic's installer.
    const result = await run(binary, ["install", "stable"], {
      env,
      cwd: directory,
      signal,
      timeout: 600000,
    });
    if (result.code !== 0)
      throw new Error(
        "Claude Code could not finish installation. Try again or open the setup guide.",
      );
    onProgress({
      message: "Claude Code installed. Checking your account…",
      progress: 100,
    });
  } finally {
    await handle?.close().catch(() => {});
    // mkdtemp allocated this exact child of the app's installer directory.
    if (path.dirname(directory) === path.resolve(workRoot))
      await fs
        .rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 200,
        })
        .catch(() => {});
  }
}
module.exports = { installClaude, BASE, trusted };
