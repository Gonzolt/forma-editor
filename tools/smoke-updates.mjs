import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "forma-updates-"));
const fixture = path.join(profile, "github-fixture.json");
await fs.writeFile(
  fixture,
  JSON.stringify({
    release: {
      tag_name: "v99.0.0",
      html_url: "https://untrusted.invalid/installer",
      draft: false,
      prerelease: false,
    },
    commits: [{ sha: "a".repeat(40) }],
  }),
);
const env = {
  ...process.env,
  FORMA_TEST_DATA: profile,
  FORMA_UPDATE_FIXTURE: fixture,
};
delete env.ELECTRON_RUN_AS_NODE;
const artifacts = path.join(root, "test-results");
await fs.mkdir(artifacts, { recursive: true });
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
try {
  let page = await launch();
  // No manual check is requested: the launch event must check both endpoints.
  await expect(
    page.getByRole("button", { name: "Updates available", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  let state = await page.evaluate(() => window.forma.updates.status());
  assert.equal(state.app.latestVersion, "99.0.0");
  assert.equal(state.app.available, true);
  assert.equal(state.motionkit.latestRevision, "a".repeat(40));
  assert.equal(state.motionkit.available, true);
  assert.ok(state.checkedAt);
  const project = (await page.evaluate(() => window.forma.motionKit.status()))
    .root;
  const original = await fs.readFile(
    path.join(project, "lib", "stage.js"),
    "utf8",
  );
  await fs.writeFile(
    path.join(project, "my-film-notes.txt"),
    "Preserve my film and local changes.",
  );
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page
    .getByRole("button", { name: "Updates available", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A little newer." }),
  ).toBeVisible();
  await expect(page.locator(".updates-panel")).toContainText("Latest 99.0.0");
  await expect(page.locator(".updates-panel")).toContainText("GitHub: aaaaaaa");
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      global.openedUpdateUrl = url;
    };
  });
  await page.getByRole("button", { name: "View Forma release" }).click();
  assert.equal(
    await app.evaluate(() => global.openedUpdateUrl),
    "https://github.com/Gonzolt/forma-editor/releases/tag/v99.0.0",
  );
  await page.getByRole("button", { name: "View MotionKit changes" }).click();
  assert.equal(
    await app.evaluate(() => global.openedUpdateUrl),
    "https://github.com/Gonzolt/motionkit/commits",
  );
  const checkedAt = state.checkedAt;
  await page
    .getByRole("button", { name: "Check for updates", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.forma.updates.status())).checkedAt,
    )
    .toBeGreaterThan(checkedAt);
  assert.equal(
    await fs.readFile(path.join(project, "lib", "stage.js"), "utf8"),
    original,
  );
  assert.equal(
    await fs.readFile(path.join(project, "my-film-notes.txt"), "utf8"),
    "Preserve my film and local changes.",
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(artifacts, "09-updates.png") });
  await page.keyboard.press("Escape");
  await app.close();
  page = await launch();
  await expect(
    page.getByRole("button", { name: "Updates available", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  state = await page.evaluate(() => window.forma.updates.status());
  assert.equal(state.app.available, true);
  assert.equal(state.motionkit.available, true);
  assert.equal(
    await fs.readFile(path.join(project, "my-film-notes.txt"), "utf8"),
    "Preserve my film and local changes.",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: launch-time Forma and MotionKit checks, update indicator, Updates settings, manual recheck, constrained GitHub destinations, restart checks and untouched working films.",
  );
} finally {
  if (app) await app.close().catch(() => {});
  await fs
    .rm(profile, { recursive: true, force: true, maxRetries: 5 })
    .catch(() => {});
}
