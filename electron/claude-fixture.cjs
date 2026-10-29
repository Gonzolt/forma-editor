// Isolated desktop-test fixture, enabled only with FORMA_TEST_DATA as well.
const fs = require("node:fs/promises");
const path = require("node:path");
function claudeFixture(filename, directory) {
  const read = async () => JSON.parse(await fs.readFile(filename, "utf8"));
  let queue = Promise.resolve();
  const record = (args) => {
    const next = queue.then(async () => {
      const calls = path.join(directory, "claude-test-calls.json");
      const history = JSON.parse(
        await fs.readFile(calls, "utf8").catch(() => "[]"),
      );
      await fs.writeFile(calls, JSON.stringify([...history, args]));
    });
    queue = next.catch(() => {});
    return next;
  };
  const pause = (ms, signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      const abort = () => {
        clearTimeout(timer);
        reject(new Error("cancelled"));
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
  return {
    install: async ({ signal, onProgress }) => {
      await record(["install", "stable"]);
      const fixture = await read();
      onProgress({ message: "Downloading test installer…", progress: 30 });
      await pause(fixture.installDelay || 100, signal);
      if (fixture.installFail) throw new Error("Test installer unavailable.");
      fixture.missing = false;
      await fs.writeFile(filename, JSON.stringify(fixture));
    },
    locate: async () =>
      (await read()).missing ? null : path.join(directory, "claude.exe"),
    run: async (_executable, args, { signal, onText } = {}) => {
      let fixture = await read();
      await record(args);
      if (args[1] === "login") {
        onText?.(
          "Open https://claude.ai/oauth/authorize?client_id=test&state=fixture",
        );
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, fixture.loginDelay || 400);
          signal?.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("cancelled"));
            },
            { once: true },
          );
        });
        fixture = await read();
        fixture.loggedIn = true;
        await fs.writeFile(filename, JSON.stringify(fixture));
      } else if (args[1] === "logout") {
        fixture.loggedIn = false;
        await fs.writeFile(filename, JSON.stringify(fixture));
      }
      const loggedIn = !!fixture.loggedIn;
      return {
        code: args[1] === "status" && !loggedIn ? 1 : 0,
        stdout: JSON.stringify({
          loggedIn,
          authMethod: loggedIn ? "claude.ai" : "none",
          email: loggedIn ? "editor@example.test" : null,
          subscriptionType: loggedIn ? "max" : null,
          accessToken: "never-expose-this-test-token",
        }),
      };
    },
  };
}
module.exports = { claudeFixture };
