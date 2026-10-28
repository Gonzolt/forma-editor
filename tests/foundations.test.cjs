const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { JsonStore, validateState } = require("../electron/store.cjs");
const { registerFiles } = require("../electron/media.cjs");
test("atomic writes preserve ordering and return recoverable data", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forma-store-"));
  try {
    const store = new JsonStore(dir);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.write("state", { revision: i }),
      ),
    );
    assert.deepEqual(await store.read("state"), { revision: 19 });
    assert.deepEqual(await fs.readdir(dir), ["state.json"]);
    await fs.writeFile(path.join(dir, "broken.json"), "{");
    await assert.rejects(store.read("broken"), /preserved/);
    assert.equal(await store.read("missing"), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("imports register only supported regular files and reuse stable IDs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forma-media-"));
  try {
    const a = path.join(dir, "shot.mp4");
    const b = path.join(dir, "notes.exe");
    await fs.writeFile(a, "video");
    await fs.writeFile(b, "no");
    const registry = {};
    const files = await registerFiles([a, b, dir, "relative.mp4"], registry);
    assert.equal(files.length, 1);
    assert.equal(files[0].kind, "video");
    assert.equal(files[0].size, 5);
    assert.equal((await registerFiles([a], registry))[0].id, files[0].id);
    assert.equal(files[0].url, `forma-media://local/${files[0].id}`);
    await assert.rejects(
      registerFiles(new Array(101).fill(a), registry),
      /100/,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("IPC storage rejects malformed sessions, oversized data and invalid settings", () => {
  const valid = {
    sessions: [],
    preferences: {
      demoMode: false,
      defaultModel: "Claude Sonnet",
      outputDirectory: "",
      defaultAspect: "9:16",
      defaultQuality: "1080p",
      enabledSkills: ["auto"],
    },
  };
  assert.equal(validateState(valid), valid);
  assert.throws(() => validateState(null), /Invalid/);
  assert.throws(() => validateState({ ...valid, sessions: [{}] }), /Invalid/);
  assert.throws(
    () =>
      validateState({
        ...valid,
        preferences: { ...valid.preferences, defaultAspect: "arbitrary" },
      }),
    /Invalid/,
  );
  assert.throws(
    () => validateState({ ...valid, extra: "a".repeat(9 * 1024 * 1024) }),
    /limit/,
  );
});
