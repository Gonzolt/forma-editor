import { _electron as electron, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "forma-claude-smoke-"));
const fixture = path.join(profile, "claude-fixture.json");
const artifacts = path.join(root, "test-results");
await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(
  fixture,
  JSON.stringify({ missing: true, loggedIn: false, loginDelay: 1500 }),
);
const env = {
  ...process.env,
  FORMA_TEST_DATA: profile,
  FORMA_CLAUDE_FIXTURE: fixture,
};
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
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  return page;
}
try {
  let page = await launch();
  const account = page.getByRole("region", { name: "Claude Code account" });
  await expect(account).toContainText("Install Claude Code to sign in");
  await app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      global.claudeOpenedUrl = url;
    };
  });
  await account.getByRole("button", { name: "Get Claude Code" }).click();
  assert.equal(
    await app.evaluate(() => global.claudeOpenedUrl),
    "https://code.claude.com/docs/en/setup",
  );
  await fs.writeFile(
    fixture,
    JSON.stringify({ missing: false, loggedIn: false, loginDelay: 30000 }),
  );
  await account.getByRole("button", { name: "Check again" }).click();
  await expect(
    account.getByRole("button", { name: "Sign in with Claude Code" }),
  ).toBeEnabled();
  await account
    .getByRole("button", { name: "Sign in with Claude Code" })
    .click();
  await expect(account).toContainText("Finish signing in in your browser");
  await account.getByRole("button", { name: "Open sign-in page" }).click();
  assert.equal(
    await app.evaluate(() => global.claudeOpenedUrl),
    "https://claude.ai/oauth/authorize?client_id=test&state=fixture",
  );
  await account.getByRole("button", { name: "Cancel sign-in" }).click();
  await expect(
    account.getByRole("button", { name: "Sign in with Claude Code" }),
  ).toBeEnabled();
  await fs.writeFile(
    fixture,
    JSON.stringify({ missing: false, loggedIn: false, loginDelay: 100 }),
  );
  await account
    .getByRole("button", { name: "Sign in with Claude Code" })
    .click();
  await expect(account).toContainText("Claude Code is signed in", {
    timeout: 15000,
  });
  await expect(account).toContainText("editor@example.test · max plan");
  await expect(account).toContainText(
    "does not enable automatic AI editing yet",
  );
  assert.ok(
    !JSON.stringify(
      await page.evaluate(() => window.forma.claude.status()),
    ).includes("never-expose-this-test-token"),
  );
  await page.screenshot({
    path: path.join(artifacts, "10-claude-sign-in.png"),
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Claude Code account" }),
  ).toContainText("Claude Code is signed in");
  await page.screenshot({ path: path.join(artifacts, "11-claude-dark.png") });
  await app.close();
  page = await launch();
  const restarted = page.getByRole("region", { name: "Claude Code account" });
  await expect(restarted).toContainText("Claude Code is signed in");
  await restarted
    .getByRole("button", { name: "Sign out of Claude Code" })
    .click();
  await expect(
    restarted.getByRole("button", { name: "Sign in with Claude Code" }),
  ).toBeEnabled();
  const history = JSON.parse(
    await fs.readFile(path.join(profile, "claude-test-calls.json"), "utf8"),
  );
  assert.equal(history.filter((args) => args[1] === "login").length, 2);
  assert.equal(history.filter((args) => args[1] === "logout").length, 1);
  for (const args of history)
    assert.ok(["status", "login", "logout"].includes(args[1]));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: missing CLI guidance, official browser sign-in, cancellation, account status, token isolation, dark mode, restart recovery and explicit shared-account sign-out. No real account was changed.",
  );
} finally {
  if (app) await app.close().catch(() => {});
  await fs
    .rm(profile, { recursive: true, force: true, maxRetries: 5 })
    .catch(() => {});
}
