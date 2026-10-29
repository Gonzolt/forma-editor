const fs = require("node:fs/promises");
const { constants } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { installClaude } = require("./claude-install.cjs");

const SETUP_URL = "https://code.claude.com/docs/en/setup";
function signInUrl(text) {
  for (const match of text.matchAll(/https:\/\/[^\s<>"']+/g)) {
    try {
      const url = new URL(match[0].replace(/\x1b\[[0-9;]*m/g, ""));
      if (
        ["claude.ai", "console.anthropic.com", "platform.claude.com"].includes(
          url.hostname,
        ) &&
        url.pathname === "/oauth/authorize" &&
        !url.username &&
        !url.password &&
        !url.port
      )
        return url.href;
    } catch {
      /* Only official authorization URLs are exposed. */
    }
  }
  return null;
}
function command(
  executable,
  args,
  { env, cwd, signal, timeout = 15000, onText } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env,
      cwd,
      signal,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      output = "",
      failure;
    const timer = setTimeout(() => {
      failure = new Error("timeout");
      child.kill();
    }, timeout);
    child.on("error", (error) => {
      failure ||= error;
    });
    function read(chunk, isStdout) {
      const value = chunk.toString("utf8");
      if (isStdout) stdout += value;
      output += value;
      if (output.length > 65536) {
        failure = new Error("output-limit");
        child.kill();
      } else onText?.(output);
    }
    child.stdout.on("data", (chunk) => read(chunk, true));
    child.stderr.on("data", (chunk) => read(chunk, false));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else resolve({ code, stdout });
    });
  });
}
async function executableFile(filename, platform = process.platform) {
  if (typeof filename !== "string" || !path.isAbsolute(filename)) return false;
  if (platform === "win32" && path.extname(filename).toLowerCase() !== ".exe")
    return false;
  try {
    if (!(await fs.stat(filename)).isFile()) return false;
    await fs.access(
      filename,
      platform === "win32" ? constants.F_OK : constants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}
async function findExecutable({
  store,
  home = os.homedir(),
  platform = process.platform,
  env = process.env,
}) {
  const saved = await store.read("claude-location", null);
  if (saved?.executable) {
    if (await executableFile(saved.executable, platform))
      return saved.executable;
  }
  const name = platform === "win32" ? "claude.exe" : "claude";
  const candidates = [
    path.join(home, ".local", "bin", name),
    ...(platform === "win32" && env.LOCALAPPDATA
      ? [path.join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", name)]
      : []),
    ...(platform === "win32"
      ? []
      : ["/opt/homebrew/bin/claude", "/usr/local/bin/claude"]),
    ...(env.PATH || env.Path || "")
      .split(path.delimiter)
      .map((value) => value.replace(/^"|"$/g, ""))
      .filter((value) => path.isAbsolute(value))
      .map((value) => path.join(value, name)),
  ];
  for (const candidate of new Set(candidates)) {
    if (await executableFile(candidate, platform)) return candidate;
  }
  return null;
}
function accountInfo(value) {
  if (!value || typeof value.loggedIn !== "boolean")
    throw new Error("invalid-status");
  const text = (value) =>
    typeof value === "string" ? value.slice(0, 200) : null;
  return {
    state: value.loggedIn ? "signed-in" : "signed-out",
    email: value.loggedIn ? text(value.email) : null,
    plan: value.loggedIn ? text(value.subscriptionType) : null,
    authMethod: text(value.authMethod),
  };
}
class ClaudeConnection {
  constructor({
    store,
    onChange = () => {},
    run = command,
    locate,
    env = process.env,
    home = os.homedir(),
    platform = process.platform,
    fetch = globalThis.fetch,
    install = installClaude,
    workRoot = path.join(os.tmpdir(), "forma-claude-install"),
  }) {
    Object.assign(this, {
      store,
      onChange,
      run,
      home,
      platform,
      fetch,
      install,
      workRoot,
    });
    // Use the CLI's own saved account, rather than credentials inherited by Forma.
    this.env = Object.fromEntries(
      Object.entries(env).filter(
        ([key]) =>
          !/^(ANTHROPIC_|CLAUDE_CODE_(OAUTH_TOKEN|USE_|API_KEY))/i.test(key),
      ),
    );
    this.locate =
      locate ||
      (() => findExecutable({ store, home, platform, env: this.env }));
    this.state = {
      state: "checking",
      executable: null,
      email: null,
      plan: null,
      authMethod: null,
      signingIn: false,
      loginUrl: null,
      error: null,
      installing: false,
      installProgress: 0,
      installMessage: "",
    };
    this.pending = null;
    this.loginTask = null;
    this.controller = null;
    this.closed = false;
    this.installTask = null;
    this.installController = null;
  }
  snapshot() {
    return structuredClone(this.state);
  }
  emit() {
    this.onChange(this.snapshot());
  }
  check(force = false) {
    if (this.installTask && !force) return Promise.resolve(this.snapshot());
    if (this.pending) return this.pending;
    this.pending = this.performCheck().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  async performCheck() {
    try {
      const executable = await this.locate();
      this.state.executable = executable;
      if (!executable) {
        Object.assign(this.state, {
          state: "missing",
          email: null,
          plan: null,
          authMethod: null,
          error: null,
        });
      } else {
        const result = await this.run(
          executable,
          ["auth", "status", "--json"],
          { env: this.env, cwd: this.home },
        );
        const info = accountInfo(JSON.parse(result.stdout));
        if (
          result.code !== 0 &&
          !(result.code === 1 && info.state === "signed-out")
        )
          throw new Error("status-failed");
        Object.assign(this.state, info, { error: null });
      }
    } catch {
      Object.assign(this.state, {
        state: "error",
        email: null,
        plan: null,
        authMethod: null,
        error:
          "Could not check Claude Code. Update its native installation, then try again.",
      });
    }
    this.emit();
    return this.snapshot();
  }
  async login(fromSetup = false, setupSignal) {
    if (this.installTask && !fromSetup) return this.snapshot();
    if (this.loginTask) return this.snapshot();
    if (this.closed) throw new Error("Forma is closing.");
    await this.check(fromSetup);
    if (setupSignal?.aborted || (fromSetup && this.state.state === "signed-in"))
      return this.snapshot();
    if (this.loginTask) return this.snapshot();
    if (this.closed) throw new Error("Forma is closing.");
    if (!this.state.executable)
      throw new Error(
        "Use Install & connect Claude to set up Claude Code first.",
      );
    const controller = (this.controller = new AbortController());
    Object.assign(this.state, { signingIn: true, loginUrl: null, error: null });
    this.emit();
    this.loginTask = (async () => {
      let message = null;
      try {
        const result = await this.run(
          this.state.executable,
          ["auth", "login", "--claudeai"],
          {
            env: this.env,
            cwd: this.home,
            signal: controller.signal,
            timeout: 300000,
            onText: (text) => {
              const url = signInUrl(text);
              if (
                url &&
                !controller.signal.aborted &&
                this.state.loginUrl !== url
              ) {
                this.state.loginUrl = url;
                this.emit();
              }
            },
          },
        );
        if (result.code !== 0)
          message =
            "Sign-in did not finish. Try again, or sign in from Claude Code and check status here.";
      } catch {
        if (!controller.signal.aborted)
          message =
            "Sign-in could not finish within five minutes. Try again, or complete it from Claude Code.";
      } finally {
        this.state.signingIn = false;
        this.state.loginUrl = null;
        this.controller = null;
        await this.check(true);
        if (message) this.state.error = message;
        this.loginTask = null;
        this.emit();
      }
    })();
    return this.snapshot();
  }
  async connect(repair = false) {
    if (this.installTask || this.loginTask) return this.snapshot();
    if (this.closed) throw new Error("Forma is closing.");
    await this.check();
    if (this.closed) throw new Error("Forma is closing.");
    if (this.installTask || this.loginTask) return this.snapshot();
    if (!repair && this.state.executable && this.state.state !== "error")
      return this.login();
    if (this.state.state === "error")
      await this.store.write("claude-location", null);
    const controller = (this.installController = new AbortController());
    this.state.installing = true;
    this.state.error = null;
    this.emit();
    const timer = setTimeout(() => controller.abort(), 600000);
    this.installTask = (async () => {
      try {
        await this.install({
          fetch: this.fetch,
          run: this.run,
          env: this.env,
          platform: this.platform,
          workRoot: this.workRoot,
          signal: controller.signal,
          onProgress: ({ message, progress }) => {
            Object.assign(this.state, {
              installMessage: message,
              installProgress: progress,
            });
            this.emit();
          },
        });
        if (!controller.signal.aborted && !this.closed)
          await this.login(true, controller.signal);
      } catch (error) {
        if (!controller.signal.aborted)
          this.state.error =
            error instanceof Error
              ? error.message
              : "Claude Code could not be installed. Try again.";
      } finally {
        clearTimeout(timer);
        this.state.installing = false;
        this.installController = null;
        this.installTask = null;
        this.emit();
      }
    })();
    return this.snapshot();
  }
  async discover() {
    if (this.installTask || this.loginTask)
      throw new Error("Finish or cancel the current connection first.");
    await this.store.write("claude-location", null);
    return this.check();
  }
  async cancelLogin() {
    this.installController?.abort();
    await this.installTask;
    this.controller?.abort();
    await this.loginTask;
    return this.snapshot();
  }
  async logout() {
    if (this.loginTask || this.installTask)
      throw new Error("Cancel the current connection first.");
    await this.check();
    if (!this.state.executable) return this.snapshot();
    const result = await this.run(this.state.executable, ["auth", "logout"], {
      env: this.env,
      cwd: this.home,
    });
    if (result.code !== 0)
      throw new Error(
        "Claude Code could not sign out. Try again from its terminal.",
      );
    return this.check();
  }
  async choose(filename) {
    if (this.loginTask)
      throw new Error(
        "Cancel the current sign-in before changing installations.",
      );
    if (!(await executableFile(filename, this.platform)))
      throw new Error("Choose the native Claude Code executable.");
    // Validate the selected program before remembering its location.
    try {
      const result = await this.run(filename, ["auth", "status", "--json"], {
        env: this.env,
        cwd: this.home,
      });
      const info = accountInfo(JSON.parse(result.stdout));
      if (
        result.code !== 0 &&
        !(result.code === 1 && info.state === "signed-out")
      )
        throw new Error("status-failed");
    } catch {
      throw new Error(
        "This executable could not report Claude Code's sign-in status.",
      );
    }
    await this.store.write("claude-location", { executable: filename });
    return this.check();
  }
  async close() {
    this.closed = true;
    await this.cancelLogin();
    await this.pending;
  }
  reopen() {
    this.closed = false;
  }
}
module.exports = {
  ClaudeConnection,
  accountInfo,
  command,
  executableFile,
  findExecutable,
  signInUrl,
  SETUP_URL,
};
