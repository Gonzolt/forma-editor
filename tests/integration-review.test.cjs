const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { JsonStore } = require("../electron/store.cjs");
const {
  prepareWorkspace,
  revisions,
  hash,
} = require("../electron/motionkit-workspace.cjs");
const {
  campaigns,
  variantFor,
  carouselInfo,
  copyPosts,
  exportCrop,
} = require("../electron/motionkit-social.cjs");
const { listFilms } = require("../electron/kit-project.cjs");
const { installClaude, BASE } = require("../electron/claude-install.cjs");
const { JobGate } = require("../electron/job-gate.cjs");
const {
  findExecutable,
  ClaudeConnection,
} = require("../electron/claude-connection.cjs");
const bundledRoot = path.resolve(__dirname, "../vendor/motionkit");
test("the bundled upstream manifest matches every shipped MotionKit file", async () => {
  for (const [file, expected] of Object.entries(
    revisions.versions[revisions.current],
  ))
    assert.equal(await hash(path.join(bundledRoot, file)), expected, file);
});
test("managed workspace upgrades preserve edits and the previous project and do not rewrite external projects", async () => {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "forma-migrate-")),
  );
  const store = new JsonStore(directory);
  try {
    const old = path.join(directory, "motionkit");
    await fs.cp(bundledRoot, old, { recursive: true });
    await fs.rm(path.join(old, "brands/lab/films/promo.html"));
    const edited = path.join(old, "README.md");
    await fs.writeFile(edited, "My local notes and edits.");
    await fs.writeFile(path.join(old, "my-notes.md"), "Keep this too.");
    const upgraded = await prepareWorkspace({
      store,
      userData: directory,
      bundledRoot,
    });
    assert.notEqual(upgraded.root, old);
    assert.equal(upgraded.revision, revisions.current);
    assert.ok(upgraded.conflicts.includes("README.md"));
    assert.equal(
      await fs.readFile(path.join(upgraded.root, "README.md"), "utf8"),
      "My local notes and edits.",
    );
    assert.equal(
      await fs.readFile(path.join(upgraded.root, "my-notes.md"), "utf8"),
      "Keep this too.",
    );
    assert.equal(
      await fs.readFile(edited, "utf8"),
      "My local notes and edits.",
    );
    assert.equal((await listFilms(upgraded.root)).length, 4);
    assert.equal(
      (await prepareWorkspace({ store, userData: directory, bundledRoot }))
        .root,
      upgraded.root,
    );
    await store.write("motionkit", { root: old, managed: false });
    // The legacy path is always managed; a chosen independent path stays external.
    const external = path.join(directory, "external-project");
    await fs.cp(bundledRoot, external, { recursive: true });
    await store.write("motionkit", { root: external, managed: false });
    const result = await prepareWorkspace({
      store,
      userData: directory,
      bundledRoot,
    });
    assert.equal(result.root, external);
    assert.equal(result.revision, null);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("the new campaign exposes all variants, six slides and actual upstream copy checks", async () => {
  const films = await listFilms(bundledRoot);
  const list = await campaigns(bundledRoot, films);
  assert.equal(list.length, 1);
  const campaign = list[0];
  assert.equal(
    campaign.hooks.length * campaign.messages.length * campaign.ctas.length,
    12,
  );
  assert.equal(variantFor(campaign, "H3-M2-C2"), "H3-M2-C2");
  assert.throws(() => variantFor(campaign, "H9-M1-C1"));
  assert.throws(() => variantFor(campaign, "../../secret"));
  const kit = { root: bundledRoot, bundledRoot, ensure: async () => {} };
  const slide = await carouselInfo(kit, "launch", 5);
  assert.equal(slide.count, 6);
  assert.equal(slide.width, 1080);
  await assert.rejects(carouselInfo(kit, "launch", 6));
  await assert.rejects(carouselInfo(kit, "../private", 0));
  const posts = await copyPosts(kit, "launch");
  assert.equal(posts.length, 6);
  assert.ok(
    posts.some(
      (post) => post.platform === "x" && post.text.includes("render(t)"),
    ),
  );
  assert.equal(exportCrop(360, 640, "feed").height, 450);
  assert.equal(exportCrop(360, 640, "square").height, 360);
  assert.throws(() => exportCrop(640, 360, "feed"));
});
test("a redirected managed-workspace folder cannot write outside Forma's data directory", async () => {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "forma-boundary-")),
  );
  const data = path.join(directory, "data");
  const outside = path.join(directory, "outside");
  await fs.mkdir(data);
  await fs.mkdir(outside);
  try {
    await fs.symlink(
      outside,
      path.join(data, "motionkit-projects"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await assert.rejects(
      prepareWorkspace({
        store: new JsonStore(data),
        userData: data,
        bundledRoot,
      }),
      /outside Forma/,
    );
    assert.deepEqual(await fs.readdir(outside), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("the shared job gate serializes preflight and waits for it when closing", async () => {
  let finish,
    active = false;
  const gate = new JobGate(() => active);
  const first = gate.start(async () => {
    await new Promise((resolve) => {
      finish = resolve;
    });
    active = true;
    return "started";
  });
  assert.throws(() => gate.start(() => {}), /already running/);
  await Promise.resolve();
  let closed = false;
  const closing = gate.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  assert.equal(closed, false);
  finish();
  assert.equal(await first, "started");
  await closing;
  assert.throws(() => gate.start(() => {}), /closing/);
  gate.reopen();
  assert.throws(() => gate.start(() => {}), /already running/);
  active = false;
  assert.equal(await gate.start(() => 3), 3);
});
test("a stale chosen Claude path falls back to automatic discovery", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forma-discover-"));
  try {
    const executable = path.join(
      directory,
      process.platform === "win32" ? "claude.exe" : "claude",
    );
    await fs.writeFile(executable, "fixture", { mode: 0o700 });
    const found = await findExecutable({
      store: {
        read: async () => ({ executable: path.join(directory, "missing.exe") }),
      },
      home: directory,
      env: { PATH: directory },
    });
    assert.equal(found, executable);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("the guided installer verifies size and checksum before running a fixed bootstrap command", async () => {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "forma-install-")),
  );
  const binary = Buffer.from("mock native installer");
  const checksum = createHash("sha256").update(binary).digest("hex");
  const urls = [];
  let executions = 0;
  const fetch = async (url) => {
    urls.push(url);
    return new Response(
      url.endsWith("/latest")
        ? "2.1.312"
        : url.endsWith("manifest.json")
          ? JSON.stringify({
              platforms: { "win32-x64": { checksum, size: binary.length } },
            })
          : binary,
    );
  };
  const run = async (filename, args) => {
    executions++;
    assert.deepEqual(args, ["install", "stable"]);
    assert.equal(await fs.readFile(filename, "utf8"), binary.toString());
    return { code: 0 };
  };
  try {
    await installClaude({
      fetch,
      run,
      platform: "win32",
      arch: "x64",
      workRoot: directory,
    });
    assert.equal(executions, 1);
    assert.ok(urls.every((url) => url.startsWith(BASE + "/")));
    assert.deepEqual(await fs.readdir(directory), []);
    await assert.rejects(
      installClaude({
        fetch: async (url) =>
          url.endsWith("/claude.exe")
            ? new Response(Buffer.from("incorrect download"))
            : fetch(url),
        run,
        platform: "win32",
        arch: "x64",
        workRoot: directory,
      }),
      /larger|checksum/,
    );
    assert.equal(executions, 1);
    assert.deepEqual(await fs.readdir(directory), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("one connect action installs then opens CLI sign-in without choosing a location", async () => {
  let installed = false,
    loggedIn = false,
    installCount = 0,
    clearedLocation = false;
  const auth = new ClaudeConnection({
    store: {
      read: async () => null,
      write: async (key, value) => {
        assert.equal(key, "claude-location");
        assert.equal(value, null);
        clearedLocation = true;
      },
    },
    locate: async () => (installed ? "/native/claude" : null),
    install: async ({ onProgress }) => {
      installCount++;
      onProgress({ message: "Installing", progress: 50 });
      installed = true;
    },
    run: async (_file, args) => {
      if (args[1] === "login") loggedIn = true;
      return {
        code: loggedIn ? 0 : 1,
        stdout: JSON.stringify({
          loggedIn,
          authMethod: loggedIn ? "claude.ai" : "none",
        }),
      };
    },
  });
  await auth.connect();
  await auth.installTask;
  await auth.loginTask;
  assert.equal(installCount, 1);
  assert.equal(auth.snapshot().state, "signed-in");
  assert.equal(auth.snapshot().installing, false);
  await auth.connect(true);
  await auth.installTask;
  assert.equal(installCount, 2);
  assert.equal(clearedLocation, true);
  assert.equal(auth.snapshot().state, "signed-in");
  assert.equal(auth.snapshot().signingIn, false);
});
