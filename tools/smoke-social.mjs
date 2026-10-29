import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), "forma-social-")),
);
const output = path.join(profile, "Finished exports");
const artifacts = path.join(root, "test-results");
await fs.mkdir(artifacts, { recursive: true });
const env = { ...process.env, FORMA_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app;
const errors = [];
async function finished(page) {
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    const job = (await page.evaluate(() => window.forma.motionKit.status()))
      .job;
    if (job?.status === "completed") return;
    if (job?.status === "failed") throw new Error(job.message);
    await page.waitForTimeout(100);
  }
  throw new Error("Social export timed out.");
}
try {
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
  await page.getByRole("button", { name: /^MotionKit 4$/ }).click();
  await page.getByRole("button", { name: /^Social studio/ }).click();
  await expect(
    page.getByRole("button", { name: "Export promo MP4" }),
  ).toBeEnabled({ timeout: 30000 });
  await page.getByRole("combobox", { name: "Promo hook" }).selectOption("H2");
  await page
    .getByRole("combobox", { name: "Promo message" })
    .selectOption("M2");
  await page
    .getByRole("combobox", { name: "Promo call to action" })
    .selectOption("C2");
  await expect(page.getByTitle("Social promo preview")).toHaveAttribute(
    "src",
    /v=H2-M2-C2/,
  );
  const promo = page.frameLocator('iframe[title="Social promo preview"]');
  await expect(promo.locator("body")).toContainText("THIS VIDEO IS CODE");
  await app.evaluate(({ dialog }, output) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [output],
    });
  }, output);
  await page.evaluate(() => window.forma.chooseOutput());
  await page
    .getByRole("combobox", { name: "Promo export quality" })
    .selectOption("360p");
  await page
    .getByRole("combobox", { name: "Promo format" })
    .selectOption("feed");
  await page.getByRole("spinbutton", { name: "Promo end time" }).fill("0.3");
  await page.getByRole("button", { name: "Export promo MP4" }).click();
  await assert.rejects(
    page.evaluate(() => window.forma.edit.start({})),
    /already running/,
  );
  await finished(page);
  const videos = await page.evaluate(() => window.forma.motionKit.exports());
  assert.equal(videos.length, 1);
  assert.equal(videos[0].variant, "H2-M2-C2");
  assert.equal(videos[0].width, 360);
  assert.equal(videos[0].height, 450);
  const decoded = spawnSync(
    require("ffmpeg-static"),
    ["-hide_banner", "-i", videos[0].path, "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(decoded.status, 0, decoded.stderr);
  assert.match(decoded.stderr, /360x450/);
  await page.screenshot({ path: path.join(artifacts, "12-social-promo.png") });
  await page
    .getByRole("button", { name: "Carousel slides", exact: true })
    .click();
  await expect(page.getByTitle("Carousel slide preview")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Carousel slide" })
    .selectOption("5");
  await expect(
    page.frameLocator('iframe[title="Carousel slide preview"]').locator("body"),
  ).toContainText("STAR IT ON GITHUB");
  await expect
    .poll(() =>
      page
        .frameLocator('iframe[title="Carousel slide preview"]')
        .locator("#slide")
        .evaluate((element) => {
          const box = element.getBoundingClientRect();
          return (
            box.width > 100 &&
            box.height > 100 &&
            box.left >= -1 &&
            box.top >= -1 &&
            box.right <= innerWidth + 1 &&
            box.bottom <= innerHeight + 1
          );
        }),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Export carousel PNGs" }).click();
  await finished(page);
  const record = JSON.parse(
    await fs.readFile(path.join(profile, "carousel-exports.json"), "utf8"),
  )[0];
  const files = (await fs.readdir(record.directory)).filter((name) =>
    name.endsWith(".png"),
  );
  assert.equal(files.length, 6);
  const sizes = await app.evaluate(
    ({ nativeImage }, paths) =>
      paths.map((filename) => {
        const image = nativeImage.createFromPath(filename);
        const pixels = image.toBitmap();
        let visible = 0;
        for (let i = 0; i < pixels.length; i += 16)
          if (pixels[i] > 50 || pixels[i + 1] > 50 || pixels[i + 2] > 50)
            visible++;
        return { ...image.getSize(), visible };
      }),
    files.map((file) => path.join(record.directory, file)),
  );
  assert.ok(
    sizes.every(
      (image) =>
        image.width === 1080 && image.height === 1350 && image.visible > 10000,
    ),
  );
  await fs.copyFile(
    path.join(record.directory, "01.png"),
    path.join(artifacts, "carousel-cover.png"),
  );
  assert.notEqual(
    createHash("sha256")
      .update(await fs.readFile(path.join(record.directory, "01.png")))
      .digest("hex"),
    createHash("sha256")
      .update(await fs.readFile(path.join(record.directory, "06.png")))
      .digest("hex"),
  );
  await page.screenshot({ path: path.join(artifacts, "13-carousel.png") });
  await page.evaluate(async () => {
    await window.forma.motionKit.exportCarousel("launch");
    await window.forma.motionKit.cancel();
  });
  assert.equal(
    (await page.evaluate(() => window.forma.motionKit.status())).job.status,
    "cancelled",
  );
  assert.ok(
    !(await fs.readdir(output)).some((name) => name.startsWith(".carousel-")),
  );
  await page.getByRole("button", { name: "Post copy", exact: true }).click();
  await expect(page.locator(".social-post")).toHaveCount(6);
  await app.evaluate(({ clipboard }) => {
    clipboard.writeText = (text) => {
      global.socialCopiedText = text;
    };
  });
  await page
    .locator(".social-post")
    .filter({ has: page.getByRole("heading", { name: "x", exact: true }) })
    .getByRole("button", { name: "Copy post" })
    .click();
  await expect
    .poll(() => app.evaluate(() => global.socialCopiedText))
    .toContain("render(t)");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({
    path: path.join(artifacts, "14-social-copy-dark.png"),
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real campaign variant preview, selected-variant H.264 export with 4:5 crop, job exclusivity, six full-resolution carousel PNGs, cancellation cleanup and post-copy checks/clipboard handoff.",
  );
} catch (error) {
  if (app)
    console.error(
      "Last social job:",
      await (
        await app.firstWindow()
      )
        .evaluate(() => window.forma.motionKit.status())
        .then((status) => status.job)
        .catch(() => null),
    );
  throw error;
} finally {
  if (app) await app.close().catch(() => {});
  await fs
    .rm(profile, { recursive: true, force: true, maxRetries: 5 })
    .catch(() => {});
}
