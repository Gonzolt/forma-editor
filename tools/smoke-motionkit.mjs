import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
// Native pickers resolve Windows short names and macOS /var symlinks.
const profile = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), "forma-motionkit-")),
);
const output = path.join(profile, "Finished videos");
const artifacts = path.join(root, "test-results");
await fs.mkdir(artifacts, { recursive: true });
const env = { ...process.env, FORMA_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const errors = [];
async function launch() {
  app = await electron.launch({
    executablePath: process.env.FORMA_EXECUTABLE || require("electron"),
    args: process.env.FORMA_EXECUTABLE ? [] : [root],
    env,
  });
  const page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByRole("region", { name: "Edit composer" })).toBeVisible(
    { timeout: 20000 },
  );
  return page;
}
async function picker(paths) {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, paths);
}
async function complete(page) {
  await expect(page.locator(".kit-job-completed")).toBeVisible({
    timeout: 90000,
  });
}
try {
  let page = await launch();
  await page.getByRole("button", { name: /^MotionKit \d+$/ }).click();
  await expect(
    page.getByRole("button", { name: "Export MP4", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const status = await page.evaluate(() => window.forma.motionKit.status());
  assert.equal(status.films.length, 4);
  assert.ok(status.guides.some((guide) => guide.id === "i-hate-editing"));
  assert.ok(status.encoderReady);
  for (const film of status.films) {
    const info = await page.evaluate(
      (id) => window.forma.motionKit.preview(id),
      film.id,
    );
    assert.ok(info.duration > 0 && info.width > 0 && info.height > 0);
  }
  await assert.rejects(
    page.evaluate(() =>
      window.forma.motionKit.export({
        filmId: "../not-a-film",
        quality: "360p",
        fps: 30,
        from: 0,
        to: 0.5,
      }),
    ),
    /film/i,
  );
  const frame = page
    .frames()
    .find((frame) => frame.url().startsWith("forma-kit://"));
  await expect
    .poll(() => frame.evaluate(() => !!window.PK), { timeout: 15000 })
    .toBe(true);
  assert.deepEqual(
    await frame.evaluate(() => ({
      node: typeof require,
      bridge: typeof window.forma,
    })),
    { node: "undefined", bridge: "undefined" },
  );
  await page.getByRole("button", { name: /Editing skills/ }).click();
  await page
    .getByRole("searchbox", { name: "Search MotionKit skills" })
    .fill("i-hate-editing");
  // Search also accepts the original skill identifier via its description/name.
  await page
    .getByRole("searchbox", { name: "Search MotionKit skills" })
    .fill("raw talking-head");
  await page.getByRole("button", { name: /i hate editing/i }).click();
  await expect(
    page.getByRole("dialog", { name: /i hate editing/i }),
  ).toContainText("Never fabricate proof");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Films/ }).click();
  await picker([output]);
  await page.evaluate(() => window.forma.chooseOutput());
  await page
    .getByRole("combobox", { name: "MotionKit export quality" })
    .selectOption("360p");
  // A real render is stopped after frames start, and its partial file must disappear.
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect
    .poll(
      async () =>
        Number(
          await page
            .getByRole("progressbar", { name: "MotionKit export progress" })
            .getAttribute("aria-valuenow"),
        ),
      { timeout: 30000 },
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Stop export", exact: true }).click();
  await expect(page.locator(".kit-job-cancelled")).toBeVisible({
    timeout: 15000,
  });
  assert.equal((await fs.readdir(output)).length, 0);
  await page
    .getByRole("spinbutton", { name: "MotionKit end time" })
    .fill("0.5");
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await complete(page);
  let exports = await page.evaluate(() => window.forma.motionKit.exports());
  assert.equal(exports.length, 1);
  assert.equal(exports[0].width, 360);
  assert.equal(exports[0].height, 640);
  assert.equal(exports[0].duration, 0.5);
  assert.equal(exports[0].hasAudio, false);
  const decode = spawnSync(
    require("ffmpeg-static"),
    ["-hide_banner", "-i", exports[0].path, "-map", "0:v:0", "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(decode.status, 0, decode.stderr);
  assert.match(decode.stderr, /360x640/);
  assert.match(decode.stderr, /frame=\s*15\b/);
  const pixels = spawnSync(
    require("ffmpeg-static"),
    [
      "-v",
      "error",
      "-ss",
      "0.4",
      "-i",
      exports[0].path,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { windowsHide: true },
  );
  assert.equal(pixels.status, 0);
  assert.ok(
    [...pixels.stdout].filter((value) => value > 50).length > 1000,
    "The MotionKit film must be visible in the rendered viewport, rather than an empty black frame.",
  );
  await fs.copyFile(
    exports[0].path,
    path.join(artifacts, "motionkit-render.mp4"),
  );
  await page.getByRole("button", { name: "Watch video" }).click();
  await expect(
    page.getByRole("dialog", { name: "Export preview" }).locator("video"),
  ).toHaveJSProperty("videoWidth", 360);
  await page.keyboard.press("Escape");
  // A generated test tone verifies that the optional soundtrack is actually muxed.
  const samples = 48000;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * i) / 48000) * 4000),
      44 + i * 2,
    );
  const soundtrack = path.join(profile, "test-tone.wav");
  await fs.writeFile(soundtrack, wav);
  await picker([soundtrack]);
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(page.getByText("test-tone.wav", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Export MP4", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.forma.motionKit.exports())).length,
      { timeout: 90000 },
    )
    .toBe(2);
  await complete(page);
  exports = await page.evaluate(() => window.forma.motionKit.exports());
  assert.equal(exports.length, 2);
  assert.equal(exports[0].hasAudio, true);
  const audio = spawnSync(
    require("ffmpeg-static"),
    ["-hide_banner", "-i", exports[0].path, "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(audio.status, 0, audio.stderr);
  assert.match(audio.stderr, /Audio: aac/);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(artifacts, "07-motionkit.png") });
  await page.getByRole("button", { name: /^Saved videos 2$/ }).click();
  await expect(page.locator(".kit-video-card")).toHaveCount(2);
  await expect(page.locator(".kit-video-card video").first()).toHaveJSProperty(
    "videoWidth",
    360,
  );
  await page.screenshot({
    path: path.join(artifacts, "08-export-library.png"),
  });
  const alternate = path.join(profile, "My MotionKit project");
  await fs.cp(status.root, alternate, { recursive: true });
  await fs.writeFile(
    path.join(alternate, "my-notes.md"),
    "Keep these user edits.",
  );
  await page.getByRole("button", { name: /^MotionKit \d+$/ }).click();
  await picker([alternate]);
  await page
    .getByRole("button", { name: "Choose project", exact: true })
    .click();
  await expect(page.locator(".kit-path")).toHaveText(alternate);
  await app.close();
  page = await launch();
  await expect(
    page.getByRole("button", { name: /^Saved videos 2$/ }),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /^Saved videos 2$/ }).click();
  await expect(page.locator(".kit-video-card")).toHaveCount(2);
  assert.equal(
    (await page.evaluate(() => window.forma.motionKit.status())).root,
    alternate,
  );
  assert.equal(
    await fs.readFile(path.join(alternate, "my-notes.md"), "utf8"),
    "Keep these user edits.",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: bundled real MotionKit films and guides, sandboxed preview, actual frame progress, cancellation cleanup, H.264 MP4 decode, soundtrack mux, saved-video playback and restart recovery.",
  );
} catch (error) {
  if (app) {
    const page = await app.firstWindow().catch(() => null);
    if (page) {
      console.error(
        "Last MotionKit job:",
        await page
          .evaluate(async () => (await window.forma.motionKit.status()).job)
          .catch(() => null),
      );
      await page
        .screenshot({ path: path.join(artifacts, "motionkit-failure.png") })
        .catch(() => {});
    }
  }
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  await fs
    .rm(profile, { recursive: true, force: true, maxRetries: 5 })
    .catch(() => {});
}
