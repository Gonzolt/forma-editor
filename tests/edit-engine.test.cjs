const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  EditEngine,
  musicShape,
  normalizePlan,
  outputSize,
  parseProbe,
  parseSilences,
  renderArgs,
  tempo,
} = require("../electron/edit-engine.cjs");

const sources = [
  {
    label: "V1",
    kind: "video",
    path: "C:/clips/a.mp4",
    name: "a.mp4",
    duration: 40,
    hasAudio: true,
    fps: 60,
  },
  {
    label: "V2",
    kind: "image",
    path: "C:/stills/b.png",
    name: "b.png",
    duration: 10,
    hasAudio: false,
  },
  {
    label: "A1",
    kind: "audio",
    path: "C:/music/song.mp3",
    name: "song.mp3",
    duration: 120,
    hasAudio: true,
  },
];
test("FFmpeg probe output yields duration, size, frame rate and audio presence", () => {
  const info = parseProbe(`Input #0, mov,mp4
  Duration: 00:01:02.50, start: 0.000000, bitrate: 15663 kb/s
  Stream #0:0[0x1](und): Video: av1 (Main), yuv420p(tv), 1440x1080 [SAR 1:1 DAR 4:3], 15027 kb/s, 59.91 fps, 60 tbr
  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo, fltp, 198 kb/s (default)`);
  assert.deepEqual(info, {
    duration: 62.5,
    width: 1440,
    height: 1080,
    fps: 59.91,
    hasAudio: true,
  });
  assert.equal(parseProbe("Duration: N/A").duration, null);
  assert.deepEqual(
    parseSilences(
      "silence_start: 1.5\nsilence_end: 2.25 | silence_duration: 0.75\nsilence_start: 9",
    ),
    [[1.5, 2.25]],
  );
});
test("output sizes follow the aspect ratio and short-edge quality", () => {
  assert.deepEqual(outputSize("9:16", "1080p"), { width: 1080, height: 1920 });
  assert.deepEqual(outputSize("16:9", "4K"), { width: 3840, height: 2160 });
  assert.deepEqual(outputSize("4:5", "720p"), { width: 720, height: 900 });
  assert.deepEqual(outputSize("1:1", "1080p"), { width: 1080, height: 1080 });
});
test("music analysis finds the drop and onsets", () => {
  const levels = [];
  for (let i = 0; i < 100; i++)
    levels.push(i < 40 ? -30 : i % 5 === 0 ? -6 : -14);
  const shape = musicShape(levels);
  assert.equal(shape.levels.length, 5);
  assert.equal(shape.drop, 4);
  assert.ok(shape.onsets.includes(4));
  assert.ok(
    shape.onsets.every((t, i) => i === 0 || t - shape.onsets[i - 1] >= 0.25),
  );
});
test("plans are clamped to real sources, effects and limits", () => {
  const plan = normalizePlan(
    {
      title: "  ACE x3  ",
      summary: "Three aces",
      steps: ["Found aces"],
      clips: [
        {
          source: "v1",
          start: -5,
          end: 4,
          framing: "fit",
          speed: 0.1,
          freeze: 9,
          mood: "dark",
          effects: ["punch", "punch", "explode"],
        },
        { source: "V1", start: 30, end: 99, framing: "fill" },
        { source: "A1", start: 0, end: 5, framing: "fill" },
        { source: "V9", start: 0, end: 5, framing: "fill" },
        { source: "V2", start: 0, end: 30, framing: "fill" },
        { source: "V1", start: 5, end: 5.1, framing: "fill" },
      ],
      music: { source: "A1", start: 500, volume: 9 },
      sourceVolume: -1,
      look: { brightness: 1, contrast: 1.2, saturation: 1.1, vignette: true },
      texts: [
        { text: "ACE\nACE", start: 1, end: 999, style: "pop" },
        { text: "", start: 0, end: 1, style: "title" },
      ],
      transitions: "fade",
      notes: ["No SFX"],
    },
    sources,
  );
  assert.equal(plan.title, "ACE x3");
  assert.equal(plan.clips.length, 3);
  assert.deepEqual(plan.clips[0], {
    source: "V1",
    start: 0,
    end: 4,
    framing: "fit",
    speed: 0.25,
    freeze: 2,
    mood: "dark",
    effects: ["punch"],
    length: 18,
  });
  assert.equal(plan.clips[1].end, 40);
  assert.equal(plan.clips[2].end - plan.clips[2].start, 10);
  assert.equal(plan.duration, 18 + 10 + 10);
  assert.deepEqual(plan.music, { source: "A1", start: 119, volume: 1.5 });
  assert.equal(plan.sourceVolume, 0);
  assert.equal(plan.look.brightness, 0.2);
  assert.equal(plan.look.grain, false);
  assert.deepEqual(plan.texts, [
    { text: "ACE ACE", start: 1, end: 38, style: "pop" },
  ]);
  assert.throws(
    () =>
      normalizePlan(
        { clips: [], summary: "No aces in this footage." },
        sources,
      ),
    /No aces in this footage/,
  );
});
test("slow speeds chain atempo within FFmpeg's range", () => {
  assert.equal(tempo(0.25), "atempo=0.5,atempo=0.5");
  assert.equal(tempo(0.4), "atempo=0.5,atempo=0.8");
  assert.equal(tempo(1.5), "atempo=1.5");
});
test("render arguments trim, frame, join and mix in one FFmpeg pass", () => {
  const plan = normalizePlan(
    {
      title: "Cut",
      clips: [
        {
          source: "V1",
          start: 2,
          end: 4,
          framing: "fill",
          speed: 0.5,
          effects: ["shake", "flash"],
        },
        { source: "V2", start: 0, end: 3, framing: "fit", freeze: 1 },
      ],
      music: { source: "A1", start: 10, volume: 0.9 },
      sourceVolume: 0.3,
      look: null,
      texts: [{ text: "GG", start: 5, end: 7, style: "title" }],
      transitions: "cut",
    },
    sources,
  );
  const args = renderArgs(plan, sources, {
    width: 1080,
    height: 1920,
    fps: 60,
    output: "out.mp4",
    platform: "win32",
    font: "font.ttf",
  });
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.deepEqual(args.slice(3, 11), [
    "-hwaccel",
    "d3d11va",
    "-ss",
    "2",
    "-t",
    "2",
    "-i",
    "C:/clips/a.mp4",
  ]);
  assert.ok(args.includes("-loop"));
  assert.deepEqual(
    args.slice(
      args.indexOf("C:/music/song.mp3") - 3,
      args.indexOf("C:/music/song.mp3") + 1,
    ),
    ["-ss", "10", "-i", "C:/music/song.mp3"],
  );
  assert.match(graph, /setpts=\(PTS-STARTPTS\)\/0\.5/);
  assert.match(graph, /atempo=0\.5/);
  assert.match(graph, /fade=t=in:st=0:d=0\.12:color=white/);
  assert.match(graph, /tpad=stop_mode=clone:stop_duration=1/);
  assert.match(
    graph,
    /\[v0\]\[a0\]\[v1\]\[a1\]concat=n=2:v=1:a=1\[cut\]\[mix\]/,
  );
  assert.match(graph, /drawtext=fontfile=font\.ttf:textfile=text-0\.txt/);
  assert.match(graph, /amix=inputs=2/);
  assert.equal(
    args[args.indexOf("-t", args.indexOf("-filter_complex")) + 1],
    "8",
  );
  assert.equal(args.at(-1), "out.mp4");
  const plain = renderArgs({ ...plan, texts: [], music: null }, sources, {
    width: 1080,
    height: 1920,
    fps: 30,
    output: "o.mp4",
    platform: "linux",
    font: null,
  });
  assert.ok(!plain.includes("-hwaccel"));
  assert.deepEqual(
    plain.slice(plain.indexOf("-map"), plain.indexOf("-map") + 4),
    ["-map", "[cut]", "-map", "[mix]"],
  );
});
test("edits refuse to start without a Claude Code sign-in or valid settings", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "forma-edit-"));
  try {
    const ffmpeg = path.join(dir, "ffmpeg.exe");
    await fs.writeFile(ffmpeg, "");
    const make = (state) =>
      new EditEngine({
        ffmpeg,
        claude: {
          check: async () => ({
            state,
            executable: state === "missing" ? null : "claude.exe",
          }),
          env: {},
        },
        resolve: async () => null,
        workRoot: dir,
        outputDirectory: () => dir,
        registerOutput: async () => ({}),
        store: { read: async () => [], write: async () => {} },
        onJob: () => {},
      });
    const options = {
      sessionId: "s",
      prompt: "Make it",
      fileIds: ["a"],
      skills: [],
      aspect: "9:16",
      length: "Auto",
      quality: "1080p",
      model: "Claude Sonnet",
    };
    await assert.rejects(
      make("signed-out").start(options),
      (e) => e.code === "claude-unavailable",
    );
    await assert.rejects(make("missing").start(options), /Install Claude Code/);
    await assert.rejects(
      make("signed-in").start({ ...options, aspect: "2:1" }),
      /Invalid edit settings/,
    );
    const events = [];
    const engine = make("signed-in");
    engine.onJob = (job) => events.push(job);
    await engine.start(options);
    await engine.active.completion;
    assert.equal(events.at(-1).status, "failed");
    assert.match(events.at(-1).message, /source file is missing/);
    assert.equal(engine.active, null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
