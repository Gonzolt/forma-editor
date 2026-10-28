const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const {
  UpdateService,
  appRelease,
  gitRevision,
  KIT_BASE_REVISION,
} = require("../electron/updates.cjs");
function store() {
  const values = {};
  return {
    read: async (key, fallback) => values[key] ?? fallback,
    write: async (key, value) => {
      values[key] = value;
    },
  };
}
test("closing during cache loading prevents launch requests from starting after shutdown", async () => {
  let resolveCache;
  let requests = 0;
  const service = new UpdateService({
    version: "0.4.0",
    store: {
      read: () =>
        new Promise((resolve) => {
          resolveCache = resolve;
        }),
      write: async () => {},
    },
    kitContext: async () => ({}),
    fetch: async () => {
      requests++;
      return new Response("{}");
    },
  });
  const pending = service.check();
  const close = service.close();
  resolveCache({});
  await Promise.all([pending, close]);
  assert.equal(requests, 0);
  assert.equal(service.snapshot().checking, false);
});
test("release publication accepts only the stable tag matching the packaged version", () => {
  const script = path.resolve(__dirname, "../tools/release-assets.cjs");
  const version = require("../package.json").version;
  const good = spawnSync(process.execPath, [script, "--validate"], {
    env: { ...process.env, GITHUB_REF_NAME: `v${version}` },
    encoding: "utf8",
  });
  assert.equal(good.status, 0, good.stderr);
  const wrong = spawnSync(process.execPath, [script, "--validate"], {
    env: { ...process.env, GITHUB_REF_NAME: "v999.0.0" },
    encoding: "utf8",
  });
  assert.notEqual(wrong.status, 0);
});
test("release checks compare stable semantic versions and construct only GitHub destinations", () => {
  const next = appRelease("0.4.0", {
    tag_name: "v0.10.0",
    html_url: "https://untrusted.invalid/installer",
  });
  assert.equal(next.available, true);
  assert.equal(
    next.releaseUrl,
    "https://github.com/Gonzolt/forma-editor/releases/tag/v0.10.0",
  );
  assert.equal(appRelease("0.4.0", { tag_name: "v0.4.0" }).available, false);
  assert.equal(appRelease("0.4.0", { tag_name: "v0.3.0" }).available, false);
  assert.equal(
    appRelease("0.4.0", { tag_name: "v0.5.0", draft: true }).state,
    "unpublished",
  );
  assert.equal(
    appRelease("0.4.0", { tag_name: "v0.5.0-beta.1", prerelease: true })
      .available,
    false,
  );
  assert.throws(() => appRelease("0.4.0", { tag_name: "not-a-version" }));
});
test("both repositories are checked, concurrent checks coalesce and conditional requests reuse cached results", async () => {
  const requests = [];
  let calls = 0;
  const service = new UpdateService({
    version: "0.4.0",
    store: store(),
    kitContext: async () => ({
      root: "/project",
      revision: KIT_BASE_REVISION,
      mode: "bundled",
    }),
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (++calls > 2) return new Response(null, { status: 304 });
      return new Response(
        JSON.stringify(
          url.includes("releases")
            ? { tag_name: "v0.5.0" }
            : [{ sha: "a".repeat(40) }],
        ),
        { headers: { etag: '"revision-one"' } },
      );
    },
  });
  const first = service.check();
  assert.equal(service.check(), first);
  const status = await first;
  assert.equal(requests.length, 2);
  assert.equal(status.app.available, true);
  assert.equal(status.motionkit.available, true);
  assert.ok(requests.some((r) => r.url.endsWith("releases/latest")));
  assert.ok(requests.some((r) => r.url.endsWith("commits?per_page=1")));
  await service.check();
  assert.equal(requests[2].options.headers["If-None-Match"], '"revision-one"');
  assert.equal(service.snapshot().app.latestVersion, "0.5.0");
  assert.equal(service.snapshot().checking, false);
});
test("unpublished releases, offline requests and rate limits remain truthful and do not reject the application", async () => {
  let kind = "unpublished";
  const service = new UpdateService({
    version: "0.4.0",
    store: store(),
    kitContext: async () => ({
      root: "/project",
      revision: KIT_BASE_REVISION,
      mode: "bundled",
    }),
    fetch: async (url) => {
      if (kind === "offline") throw new Error("network unavailable");
      if (kind === "limit") return new Response("{}", { status: 403 });
      return url.includes("releases")
        ? new Response("{}", { status: 404 })
        : new Response(JSON.stringify([{ sha: KIT_BASE_REVISION }]));
    },
  });
  let status = await service.check();
  assert.equal(status.app.state, "unpublished");
  assert.equal(status.motionkit.state, "current");
  kind = "offline";
  status = await service.check();
  assert.equal(status.app.state, "error");
  assert.equal(status.motionkit.state, "error");
  assert.equal(status.checking, false);
  kind = "limit";
  status = await service.check();
  assert.match(status.app.error, /request limit/);
});
test("unknown external project revisions are never advertised as up to date", async () => {
  const service = new UpdateService({
    version: "0.4.0",
    store: store(),
    kitContext: async () => ({
      root: "/external",
      revision: null,
      mode: "external",
    }),
    fetch: async (url) =>
      new Response(
        JSON.stringify(
          url.includes("releases")
            ? { tag_name: "v0.4.0" }
            : [{ sha: KIT_BASE_REVISION }],
        ),
      ),
  });
  const result = await service.check();
  assert.equal(result.motionkit.state, "unknown");
  assert.equal(result.motionkit.available, false);
  assert.equal(result.motionkit.latestRevision, KIT_BASE_REVISION);
});
test("Git revision reading supports loose, packed, detached and worktree references without changing files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "forma-git-revision-"));
  try {
    const git = path.join(root, ".git");
    await fs.mkdir(path.join(git, "refs", "heads"), { recursive: true });
    await fs.writeFile(path.join(root, "film.js"), "user edits stay here");
    await fs.writeFile(path.join(git, "HEAD"), "ref: refs/heads/main\n");
    await fs.writeFile(
      path.join(git, "refs", "heads", "main"),
      KIT_BASE_REVISION,
    );
    assert.equal(await gitRevision(root), KIT_BASE_REVISION);
    await fs.rm(path.join(git, "refs", "heads", "main"));
    await fs.writeFile(
      path.join(git, "packed-refs"),
      `${KIT_BASE_REVISION} refs/heads/main\n`,
    );
    assert.equal(await gitRevision(root), KIT_BASE_REVISION);
    await fs.writeFile(path.join(git, "HEAD"), "b".repeat(40));
    assert.equal(await gitRevision(root), "b".repeat(40));
    const worktree = path.join(root, "working copy");
    const metadata = path.join(git, "worktrees", "copy");
    await fs.mkdir(metadata, { recursive: true });
    await fs.mkdir(worktree);
    await fs.writeFile(path.join(worktree, ".git"), `gitdir: ${metadata}\n`);
    await fs.writeFile(path.join(metadata, "HEAD"), "ref: refs/heads/main\n");
    await fs.writeFile(path.join(metadata, "commondir"), "../..\n");
    assert.equal(await gitRevision(worktree), KIT_BASE_REVISION);
    assert.equal(
      await fs.readFile(path.join(root, "film.js"), "utf8"),
      "user edits stay here",
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
