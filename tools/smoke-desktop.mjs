import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const artifacts = path.join(root, "test-results");
await fs.mkdir(artifacts, { recursive: true });
const userData = await fs.mkdtemp(path.join(os.tmpdir(), "forma-smoke-"));
const env = { ...process.env, FORMA_TEST_DATA: userData };
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
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("heading", { name: "Drop it in. Say the word." }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return page;
}
try {
  let page = await launch();
  await page.screenshot({ path: path.join(artifacts, "01-empty.png") });
  await page.getByRole("button", { name: "Run edit", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByText("Claude is not connected", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enable demo" }).click();
  await expect(
    page.getByRole("button", { name: "Demo enabled" }),
  ).toBeVisible();
  const encryption = await page.evaluate(() => window.forma.connection());
  if (encryption.encryptionAvailable) {
    await page
      .getByLabel("Anthropic API key", { exact: true })
      .fill("sk-ant-demo-key-not-a-real-credential");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByText("API key saved", { exact: true }),
    ).toBeVisible();
    const secret = await fs.readFile(
      path.join(userData, "credential.json"),
      "utf8",
    );
    if (secret.includes("sk-ant-"))
      throw new Error("Credential was stored in plaintext");
    await page.getByRole("button", { name: "Remove saved key" }).click();
    await expect(
      page.getByText("Claude is not connected", { exact: true }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByLabel("Anthropic API key", { exact: true }),
    ).toBeDisabled();
  }
  await page.screenshot({ path: path.join(artifacts, "02-settings.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Replace only the OS file picker, so the real import/registry/protocol path is exercised.
  const fixture = path.join(userData, "hands.png");
  await fs.copyFile(path.join(root, "public", "hands.png"), fixture);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, fixture);
  await page.getByRole("button", { name: "Choose media files" }).click();
  await expect(
    page.getByRole("button", { name: "Preview hands.png" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview hands.png" }).click();
  await expect(
    page.getByRole("dialog", { name: "Preview hands.png" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "hands.png", exact: true }),
  ).toHaveJSProperty("naturalWidth", 740);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Make a 30s highlight reel", exact: true })
    .click();
  await expect(
    page.getByLabel("Describe your edit", { exact: true }),
  ).toHaveValue("Make a 30s highlight reel");
  await page.getByRole("button", { name: "Captions", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Captions", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "16:9 aspect ratio" }).click();
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("progressbar")).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(
    page.getByText("A first direction", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Run edit", exact: true }).click();
  await expect(
    page.getByText("A first direction", { exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await expect(
    page.getByText("DEMO COMPLETE · NO VIDEO RENDERED"),
  ).toBeVisible();
  await page.screenshot({ path: path.join(artifacts, "03-plan.png") });
  await page.getByRole("button", { name: "Templates 03" }).click();
  await expect(
    page.getByRole("heading", { name: "Find your starting point." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /THE GOOD PARTS.*The highlight reel/ })
    .click();
  await expect(
    page.getByLabel("Describe your edit", { exact: true }),
  ).toHaveValue(/Make a 30s highlight reel/);
  await page.keyboard.press("Control+,");
  await page.getByRole("button", { name: "Skills", exact: true }).click();
  await page.getByRole("checkbox", { name: /Color/ }).uncheck();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Color", exact: true }),
  ).toHaveCount(0);
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setMinimumSize(320, 500);
    win.setSize(480, 900);
  });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth > innerWidth ||
      document.querySelector("main").scrollWidth > innerWidth,
  );
  if (overflow) throw new Error("Narrow layout overflows horizontally");
  await page.screenshot({ path: path.join(artifacts, "04-narrow.png") });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 940),
  );
  await app.close();
  page = await launch();
  await expect(
    page.getByLabel("Describe your edit", { exact: true }),
  ).toHaveValue(/Make a 30s highlight reel/);
  await expect(
    page.getByRole("button", { name: "Color", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("DEMO WORKSPACE", { exact: true })).toBeVisible();
  await page
    .locator(".recent-item")
    .filter({ hasText: "Make a 30s highlight reel" })
    .click();
  await expect(
    page.getByRole("button", { name: "16:9 aspect ratio" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Preview hands.png" }).click();
  await expect(
    page.getByRole("img", { name: "hands.png", exact: true }),
  ).toHaveJSProperty("naturalWidth", 740);
  await page.keyboard.press("Escape");
  await app.close();
  await fs.rm(fixture);
  page = await launch();
  await expect(page.getByText("REIMPORT", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Run edit", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Some source files are missing",
  );
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  if (errors.length) throw new Error("Renderer errors: " + errors.join("\n"));
  console.log(
    "PASS: native import + preview, safe credential storage, demo gating, suggestions, skills, aspect, cancel, completion, templates, keyboard, responsive layout, restart persistence and missing-file recovery.",
  );
  console.log("Screenshots: " + artifacts);
} finally {
  if (app) await app.close().catch(() => {});
  await fs
    .rm(userData, { recursive: true, force: true, maxRetries: 3 })
    .catch(() => {});
}
