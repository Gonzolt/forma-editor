const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const {
  ClaudeConnection,
  accountInfo,
  command,
  findExecutable,
  signInUrl,
} = require("../electron/claude-connection.cjs");
const { JsonStore } = require("../electron/store.cjs");
const signed = {
  loggedIn: true,
  authMethod: "claude.ai",
  email: "editor@example.test",
  subscriptionType: "max",
  accessToken: "private-test-token",
};
function service(run, extra = {}) {
  return new ClaudeConnection({
    store: { read: async () => null },
    locate: async () => "/native/claude",
    run,
    ...extra,
  });
}
test("Claude account metadata excludes secrets and accepts only official authorization links", () => {
  assert.deepEqual(accountInfo(signed), {
    state: "signed-in",
    email: "editor@example.test",
    plan: "max",
    authMethod: "claude.ai",
  });
  assert.deepEqual(accountInfo({ ...signed, loggedIn: false }), {
    state: "signed-out",
    email: null,
    plan: null,
    authMethod: "claude.ai",
  });
  assert.throws(() => accountInfo({ loggedIn: "yes" }));
  assert.equal(
    signInUrl("Open https://claude.ai/oauth/authorize?state=sample"),
    "https://claude.ai/oauth/authorize?state=sample",
  );
  for (const url of [
    "https://claude.ai.evil.test/oauth/authorize",
    "https://user@claude.ai/oauth/authorize",
    "https://claude.ai:3000/oauth/authorize",
    "https://claude.ai/login",
    "http://claude.ai/oauth/authorize",
  ])
    assert.equal(signInUrl(url), null);
});
test("Claude status calls coalesce and inherited API credentials are not passed to the account check", async () => {
  let count = 0;
  const auth = service(
    async (_executable, args, options) => {
      count++;
      assert.deepEqual(args, ["auth", "status", "--json"]);
      assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
      assert.equal(options.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
      assert.equal(options.env.CLAUDE_CONFIG_DIR, "/personal/config");
      return { code: 0, stdout: JSON.stringify(signed) };
    },
    {
      env: {
        PATH: "/bin",
        ANTHROPIC_API_KEY: "test",
        CLAUDE_CODE_OAUTH_TOKEN: "test",
        CLAUDE_CONFIG_DIR: "/personal/config",
      },
    },
  );
  const results = await Promise.all([auth.check(), auth.check()]);
  assert.equal(count, 1);
  assert.equal(results[0].state, "signed-in");
  assert.ok(!JSON.stringify(results).includes("private-test-token"));
});
test("missing, signed-out, malformed and failed CLI checks remain truthful", async () => {
  assert.equal(
    (
      await service(
        async () => {
          throw new Error("must not run");
        },
        { locate: async () => null },
      ).check()
    ).state,
    "missing",
  );
  assert.equal(
    (
      await service(async () => ({
        code: 1,
        stdout: '{"loggedIn":false}',
      })).check()
    ).state,
    "signed-out",
  );
  for (const result of [
    { code: 0, stdout: "private-test-token" },
    { code: 2, stdout: JSON.stringify(signed) },
  ]) {
    const state = await service(async () => result).check();
    assert.equal(state.state, "error");
    assert.ok(!JSON.stringify(state).includes("private-test-token"));
  }
});
test("browser sign-in is single-flight, refreshes verified CLI status and persists no account tokens", async () => {
  let loggedIn = false,
    loginCount = 0,
    finish;
  const auth = service(async (_executable, args, options) => {
    if (args[1] === "login") {
      loginCount++;
      assert.deepEqual(args, ["auth", "login", "--claudeai"]);
      options.onText("https://malicious.test/oauth/authorize");
      assert.equal(auth.snapshot().loginUrl, null);
      options.onText("https://claude.ai/oauth/authorize?state=test");
      await new Promise((resolve) => {
        finish = resolve;
      });
      loggedIn = true;
      return { code: 0, stdout: "" };
    }
    return {
      code: loggedIn ? 0 : 1,
      stdout: JSON.stringify({ ...signed, loggedIn }),
    };
  });
  await Promise.all([auth.login(), auth.login()]);
  assert.equal(loginCount, 1);
  assert.equal(auth.snapshot().signingIn, true);
  assert.match(auth.snapshot().loginUrl, /^https:\/\/claude.ai\//);
  const task = auth.loginTask;
  finish();
  await task;
  assert.equal(auth.snapshot().state, "signed-in");
  assert.equal(auth.snapshot().signingIn, false);
  assert.equal(auth.snapshot().loginUrl, null);
});
test("cancelling or closing stops the login process without signing out the shared account", async () => {
  for (const close of [false, true]) {
    const calls = [];
    const auth = service(async (_executable, args, { signal }) => {
      calls.push(args[1]);
      if (args[1] === "login")
        await new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          }),
        );
      return { code: 0, stdout: JSON.stringify(signed) };
    });
    await auth.login();
    if (close) await auth.close();
    else await auth.cancelLogin();
    assert.equal(auth.snapshot().state, "signed-in");
    assert.equal(auth.snapshot().signingIn, false);
    assert.ok(!calls.includes("logout"));
    if (close) await assert.rejects(auth.login(), /closing/);
  }
});
test("CLI logout is explicit and verifies the resulting account state", async () => {
  let loggedIn = true;
  const auth = service(async (_executable, args) => {
    if (args[1] === "logout") loggedIn = false;
    return {
      code: args[1] === "status" && !loggedIn ? 1 : 0,
      stdout: JSON.stringify({ ...signed, loggedIn }),
    };
  });
  assert.equal((await auth.logout()).state, "signed-out");
});
test("native CLI discovery and a chosen location survive restart without scanning credential files", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "forma-claude-unit-"),
  );
  try {
    const store = new JsonStore(directory);
    const filename = path.join(
      directory,
      process.platform === "win32" ? "claude.exe" : "claude",
    );
    await fs.writeFile(filename, "fixture", { mode: 0o700 });
    assert.equal(
      await findExecutable({
        store,
        home: directory,
        env: { PATH: directory },
      }),
      filename,
    );
    const auth = new ClaudeConnection({
      store,
      home: directory,
      env: {},
      run: async () => ({ code: 0, stdout: JSON.stringify(signed) }),
    });
    await auth.choose(filename);
    assert.equal(
      await findExecutable({ store, home: directory, env: {} }),
      filename,
    );
    const files = await fs.readdir(directory);
    assert.deepEqual(
      files.sort(),
      [path.basename(filename), "claude-location.json"].sort(),
    );
    assert.ok(
      !JSON.stringify(await store.read("claude-location")).includes(
        "private-test-token",
      ),
    );
    await assert.rejects(auth.choose(path.join(directory, "missing.exe")));
    const invalid = new ClaudeConnection({
      store,
      run: async () => ({ code: 0, stdout: "private-test-token" }),
    });
    await assert.rejects(
      invalid.choose(filename),
      (error) =>
        !error.message.includes("private-test-token") &&
        /could not report/.test(error.message),
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("native command runner bounds process duration, exit status and captured output", async () => {
  assert.deepEqual(
    await command(process.execPath, ["-e", "console.log('test')"]),
    { code: 0, stdout: "test\n" },
  );
  await assert.rejects(
    command(process.execPath, ["-e", "setInterval(()=>{}, 1000)"], {
      timeout: 100,
    }),
    /timeout/,
  );
  await assert.rejects(
    command(process.execPath, [
      "-e",
      "process.stdout.write('a'.repeat(70000))",
    ]),
    /output-limit/,
  );
});
