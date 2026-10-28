const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  inside,
  validateProject,
  listFilms,
  listGuides,
  serveProject,
} = require("../electron/kit-project.cjs");
const root = path.resolve(__dirname, "../vendor/motionkit");
test("the pinned MotionKit project supplies its films and real editing skills", async () => {
  assert.equal(await validateProject(root), await fs.realpath(root));
  const films = await listFilms(root);
  assert.equal(films.length, 3);
  assert.equal(films[0].id, "lab/motionlab");
  assert.ok(
    (await listGuides(root))
      .find((guide) => guide.id === "i-hate-editing")
      .content.includes("Never fabricate proof"),
  );
});
test("the project asset boundary blocks sibling paths and private configuration", async () => {
  assert.equal(inside(root, root + "-sibling/secret.js"), false);
  assert.equal(inside(root, path.join(root, "lib/stage.js")), true);
  const net = {
    fetch: () => {
      throw new Error("Blocked paths must not reach the file reader");
    },
  };
  assert.equal(
    (await serveProject(root, { url: "forma-kit://project/.env" }, net)).status,
    403,
  );
  assert.equal(
    (
      await serveProject(
        root,
        { url: "forma-kit://project/.claude/skills/motionkit/SKILL.md" },
        net,
      )
    ).status,
    403,
  );
  assert.equal(
    (await serveProject(root, { url: "forma-kit://another/README.md" }, net))
      .status,
    404,
  );
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "forma-boundary-"));
  try {
    await assert.rejects(validateProject(directory));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
