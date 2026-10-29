import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { EditEngine } = require("../electron/edit-engine.cjs");
const { JsonStore } = require("../electron/store.cjs");
const ffmpeg = require("ffmpeg-static");
const directory = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), "forma-edit-review-")),
);
const source = path.join(directory, "source.mp4");
const output = path.join(directory, "Finished edits");
let engine;
try {
  const input = spawnSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x180:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      source,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(input.status, 0, input.stderr);
  let rendered,
    stopAtRender = false;
  const atRender = new Promise((resolve) => {
    rendered = resolve;
  });
  const store = new JsonStore(directory);
  engine = new EditEngine({
    ffmpeg,
    claude: {
      env: {},
      check: async () => ({ state: "signed-in", executable: process.execPath }),
    },
    resolve: async (id) => (id === "source" ? source : null),
    workRoot: path.join(directory, "work"),
    outputDirectory: () => output,
    store,
    registerOutput: async (filename) => ({
      id: "review-video",
      url: `file://${filename}`,
    }),
    onJob: (job) => {
      if (stopAtRender && job.status === "rendering") rendered();
    },
  });
  const original = engine.exec.bind(engine);
  let plannerCalls = 0,
    decodes = 0,
    rejectDecode = false,
    plannerVersion = "2.1.309";
  engine.exec = async (active, args, options) => {
    if (args[0] === process.execPath) {
      if (args.includes("--version"))
        return {
          code: 0,
          stdout: `${plannerVersion} (Claude Code)`,
          stderr: "",
        };
      plannerCalls++;
      assert.equal(args[args.indexOf("--tools") + 1], "Read,Glob");
      assert.equal(args[args.indexOf("--setting-sources") + 1], "");
      assert.ok(args.includes("--strict-mcp-config"));
      assert.equal(args[args.indexOf("--allowedTools") + 1], "Read(./**)");
      assert.equal(
        JSON.parse(args[args.indexOf("--settings") + 1]).permissions
          .blockReadsOutsideWorkingDirectories,
        true,
      );
      return {
        code: 0,
        stdout: JSON.stringify({
          is_error: false,
          structured_output: {
            title: "Review test edit",
            summary: "A real render using a test planner",
            steps: ["Trim the source"],
            clips: [{ source: "V1", start: 0, end: 0.4, framing: "fit" }],
            music: null,
            sourceVolume: 0.5,
            transitions: "cut",
            notes: [],
            texts: [],
            look: null,
          },
        }),
        stderr: "",
      };
    }
    if (args.includes("-xerror")) {
      decodes++;
      if (rejectDecode)
        return { code: 1, stdout: "", stderr: "test decode failure" };
    }
    return original(active, args, options);
  };
  const options = {
    sessionId: "review-session",
    prompt: "Make a short test film.",
    fileIds: ["source"],
    skills: ["auto"],
    aspect: "9:16",
    quality: "720p",
    length: "Auto",
    model: "Claude Sonnet",
  };
  await engine.start(options);
  await engine.active.completion;
  assert.equal(engine.job.status, "completed", engine.job.message);
  const records = await store.read("exports", []);
  assert.equal(records.length, 1);
  assert.equal(records[0].width, 720);
  assert.equal(records[0].height, 1280);
  assert.equal(decodes, 1);
  assert.ok((await fs.stat(records[0].path)).size > 1000);
  stopAtRender = true;
  await engine.start({ ...options, sessionId: "cancel-session" });
  await atRender;
  await engine.cancel();
  assert.equal(engine.job.status, "cancelled");
  assert.equal((await store.read("exports", [])).length, 1);
  assert.ok(
    !(await fs.readdir(output)).some((name) => name.endsWith(".partial.mp4")),
  );
  assert.deepEqual(await fs.readdir(path.join(directory, "work")), []);
  assert.equal(plannerCalls, 2);
  stopAtRender = false;
  rejectDecode = true;
  await engine.start({ ...options, sessionId: "invalid-output-session" });
  await engine.active.completion;
  assert.equal(engine.job.status, "failed");
  assert.match(engine.job.message, /could not be decoded/);
  assert.equal((await store.read("exports", [])).length, 1);
  assert.equal((await fs.readdir(output)).length, 1);
  const before = plannerCalls;
  plannerVersion = "2.1.100";
  await engine.start({ ...options, sessionId: "old-claude-session" });
  await engine.active.completion;
  assert.equal(engine.job.status, "failed");
  assert.match(engine.job.message, /Update Claude Code/);
  assert.equal(plannerCalls, before);
  console.log(
    "PASS: main edit analysis/contact sheets, restricted test planner, actual H.264/AAC render, full decode before library registration, and cancellation cleanup. No Claude calls or credits used.",
  );
} finally {
  if (engine) await engine.close();
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 5 });
}
