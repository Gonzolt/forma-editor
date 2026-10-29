const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const semver = require("semver");

// Claude Code plans the edit from still frames and measurements; FFmpeg renders it locally.
const SHEET_COLUMNS = 4;
const SHEET_ROWS = 3;
const MODELS = {
  "Claude Opus": "opus",
  "Claude Sonnet": "sonnet",
  "Claude Haiku": "haiku",
};
const SHORT_EDGE = { "720p": 720, "1080p": 1080, "4K": 2160 };
const ASPECTS = {
  "9:16": [9, 16],
  "16:9": [16, 9],
  "1:1": [1, 1],
  "4:5": [4, 5],
};
const TARGETS = { "15 seconds": 15, "30 seconds": 30, "60 seconds": 60 };
const EFFECTS = ["punch", "shake", "flash", "blur"];
const MOODS = {
  base: "",
  dark: ",eq=brightness=-0.05:contrast=1.05:saturation=0.65",
  vivid: ",eq=contrast=1.1:saturation=1.3",
};
const FONTS = {
  win32: ["C:\\Windows\\Fonts\\ariblk.ttf", "C:\\Windows\\Fonts\\arialbd.ttf"],
  darwin: [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  ],
  linux: ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
};
const SKILL_NOTES = {
  auto: "Arrange the strongest moments into a clear beginning, middle and ending.",
  silence:
    "Cut out dead air: use the silence measurements to trim pauses from speech.",
  captions:
    "Captions were requested. Forma cannot transcribe speech yet; you may add short text overlays, and mention the limit in notes.",
  color: "Match exposure and color between clips with the look and moods.",
  music: "Use an attached audio file as the soundtrack and cut to its beats.",
};
const number = { type: "number" };
const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "summary",
    "steps",
    "clips",
    "music",
    "sourceVolume",
    "transitions",
    "notes",
  ],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
    clips: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "start", "end", "framing"],
        properties: {
          source: { type: "string" },
          start: number,
          end: number,
          framing: { type: "string", enum: ["fill", "fit"] },
          speed: number,
          freeze: number,
          mood: { type: "string", enum: Object.keys(MOODS) },
          effects: { type: "array", items: { type: "string", enum: EFFECTS } },
        },
      },
    },
    music: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["source", "start", "volume"],
          properties: {
            source: { type: "string" },
            start: number,
            volume: number,
          },
        },
      ],
    },
    sourceVolume: number,
    look: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["brightness", "contrast", "saturation"],
          properties: {
            brightness: number,
            contrast: number,
            saturation: number,
            vignette: { type: "boolean" },
            grain: { type: "boolean" },
          },
        },
      ],
    },
    texts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "start", "end", "style"],
        properties: {
          text: { type: "string" },
          start: number,
          end: number,
          style: { type: "string", enum: ["title", "pop"] },
        },
      },
    },
    transitions: { type: "string", enum: ["cut", "fade"] },
    notes: { type: "array", items: { type: "string" } },
  },
};
const cancelled = () =>
  new Error("Edit stopped. No unfinished video was added.");
const clamp = (value, min, max, fallback) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const round = (value) => Math.round(value * 1000) / 1000;
const text = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function parseProbe(log) {
  const time = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(log);
  const video = /Stream #\d+:\d+[^\n]*Video:[^\n]*/.exec(log)?.[0];
  const size = video && /,\s*(\d{2,5})x(\d{2,5})/.exec(video);
  const fps = video && /([\d.]+)\s*fps/.exec(video);
  return {
    duration: time ? +time[1] * 3600 + +time[2] * 60 + +time[3] : null,
    width: size ? +size[1] : null,
    height: size ? +size[2] : null,
    fps: fps ? +fps[1] : null,
    hasAudio: /Stream #\d+:\d+[^\n]*Audio:/.test(log),
  };
}
function parseSilences(log) {
  const silences = [];
  let start = null;
  for (const line of log.split(/\r?\n/)) {
    const begin = /silence_start:\s*(-?[\d.]+)/.exec(line);
    const end = /silence_end:\s*([\d.]+)/.exec(line);
    if (begin) start = Math.max(0, +begin[1]);
    else if (end && start !== null) {
      silences.push([round(start), round(+end[1])]);
      start = null;
    }
  }
  return silences;
}
function parseLoudness(log) {
  return [...log.matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) =>
    m[1] === "-inf" ? -90 : +m[1],
  );
}
// Summarises 0.1s loudness readings into 2s levels and the onsets (hits) a cut can land on.
function musicShape(levels, step = 0.1) {
  const per = Math.round(2 / step);
  const blocks = [];
  for (let i = 0; i < levels.length; i += per) {
    const chunk = levels.slice(i, i + per);
    const power =
      chunk.reduce((n, db) => n + 10 ** (db / 10), 0) / chunk.length;
    blocks.push(Math.round(10 * Math.log10(power || 1e-9)));
  }
  const energy = levels.map((db) => 10 ** (db / 20));
  const flux = energy.map((e, i) =>
    i < 3
      ? 0
      : Math.max(0, e - (energy[i - 1] + energy[i - 2] + energy[i - 3]) / 3),
  );
  const mean = flux.reduce((n, f) => n + f, 0) / (flux.length || 1);
  const sd = Math.sqrt(
    flux.reduce((n, f) => n + (f - mean) ** 2, 0) / (flux.length || 1),
  );
  const onsets = [];
  for (let i = 2; i < flux.length - 2; i++) {
    const peak =
      flux[i] >= Math.max(flux[i - 2], flux[i - 1], flux[i + 1], flux[i + 2]);
    const time = round(i * step);
    if (
      peak &&
      flux[i] > mean + 0.6 * sd &&
      (!onsets.length || time - onsets.at(-1) >= 0.25)
    )
      onsets.push(time);
  }
  let drop = null,
    rise = 0;
  for (let i = 1; i < blocks.length; i++)
    if (blocks[i] - blocks[i - 1] > rise) {
      rise = blocks[i] - blocks[i - 1];
      drop = i * 2;
    }
  return {
    levels: blocks,
    onsets: onsets.slice(0, 400),
    drop: rise >= 3 ? drop : null,
  };
}
function outputSize(aspect, quality) {
  const [w, h] = ASPECTS[aspect] || ASPECTS["9:16"];
  const short = SHORT_EDGE[quality] || 1080;
  const even = (n) => Math.round(n / 2) * 2;
  return w <= h
    ? { width: short, height: even((short * h) / w) }
    : { width: even((short * w) / h), height: short };
}
// Turns Claude's answer into a render that is guaranteed to fit the real sources.
function normalizePlan(raw, sources) {
  if (!raw || typeof raw !== "object")
    throw new Error("Claude did not return an edit plan.");
  const byLabel = new Map(sources.map((s) => [s.label, s]));
  const clips = [];
  let total = 0;
  for (const clip of Array.isArray(raw.clips) ? raw.clips.slice(0, 120) : []) {
    const source = byLabel.get(text(clip?.source, 10).toUpperCase());
    if (!source || source.kind === "audio") continue;
    const limit = source.kind === "image" ? 10 : source.duration;
    const start = source.kind === "image" ? 0 : clamp(clip.start, 0, limit, 0);
    const end = clamp(
      source.kind === "image" ? clip.end - clip.start : clip.end,
      start,
      limit,
      limit,
    );
    const speed = round(clamp(clip.speed, 0.25, 2, 1));
    const freeze = round(clamp(clip.freeze, 0, 2, 0));
    const length = round((end - start) / speed + freeze);
    if (end - start < 0.2 || total + length > 600) continue;
    total += length;
    clips.push({
      source: source.label,
      start: round(start),
      end: round(end),
      framing: clip.framing === "fit" ? "fit" : "fill",
      speed,
      freeze,
      mood: MOODS[clip.mood] !== undefined ? clip.mood : "base",
      effects: [
        ...new Set(Array.isArray(clip.effects) ? clip.effects : []),
      ].filter((e) => EFFECTS.includes(e)),
      length,
    });
  }
  const notes = (Array.isArray(raw.notes) ? raw.notes : [])
    .map((n) => text(n, 400))
    .filter(Boolean)
    .slice(0, 6);
  const summary = text(raw.summary, 600);
  if (!clips.length)
    throw new Error(
      summary ||
        notes[0] ||
        "Claude could not find footage that matches your brief.",
    );
  const duration = round(total);
  const song =
    raw.music && byLabel.get(text(raw.music.source, 10).toUpperCase());
  const music =
    song && song.kind === "audio"
      ? {
          source: song.label,
          start: round(
            clamp(raw.music.start, 0, Math.max(0, song.duration - 1), 0),
          ),
          volume: round(clamp(raw.music.volume, 0, 1.5, 0.8)),
        }
      : null;
  const look = raw.look
    ? {
        brightness: round(clamp(raw.look.brightness, -0.2, 0.2, 0)),
        contrast: round(clamp(raw.look.contrast, 0.7, 1.4, 1)),
        saturation: round(clamp(raw.look.saturation, 0, 2, 1)),
        vignette: raw.look.vignette === true,
        grain: raw.look.grain === true,
      }
    : null;
  const texts = (Array.isArray(raw.texts) ? raw.texts : [])
    .map((t) => {
      const start = round(clamp(t?.start, 0, duration, 0));
      return {
        text: text(t?.text, 40).replace(/[\r\n]+/g, " "),
        start,
        end: round(clamp(t?.end, start, duration, start)),
        style: t?.style === "title" ? "title" : "pop",
      };
    })
    .filter((t) => t.text && t.end - t.start >= 0.2)
    .slice(0, 12);
  return {
    title: text(raw.title, 80) || "Your edit",
    summary,
    steps: (Array.isArray(raw.steps) ? raw.steps : [])
      .map((s) => text(s, 400))
      .filter(Boolean)
      .slice(0, 10),
    notes,
    clips,
    music,
    sourceVolume: round(clamp(raw.sourceVolume, 0, 1.5, 1)),
    look,
    texts,
    transitions: raw.transitions === "fade" ? "fade" : "cut",
    duration,
  };
}
function hwaccel(platform = process.platform) {
  return platform === "win32"
    ? ["-hwaccel", "d3d11va"]
    : platform === "darwin"
      ? ["-hwaccel", "videotoolbox"]
      : [];
}
function tempo(speed) {
  const steps = [];
  for (let left = speed; left < 0.5 - 1e-6; left /= 0.5) steps.push(0.5);
  steps.push(round(speed / 0.5 ** steps.length));
  return steps.map((s) => `atempo=${s}`).join(",");
}
// One FFmpeg pass: trim each clip, frame it, apply speed and effects, join, add text and music.
// Text and font files are read relative to the working directory FFmpeg runs in.
function renderArgs(
  plan,
  sources,
  { width, height, fps, output, platform, font },
) {
  const byLabel = new Map(sources.map((s) => [s.label, s]));
  const args = ["-hide_banner", "-nostdin", "-y"];
  const filters = [];
  const joined = [];
  const dip = plan.transitions === "fade" ? 0.15 : 0;
  const look = plan.look
    ? `,eq=brightness=${plan.look.brightness}:contrast=${plan.look.contrast}:saturation=${plan.look.saturation}`
    : "";
  plan.clips.forEach((clip, i) => {
    const source = byLabel.get(clip.source);
    const span = round(clip.end - clip.start);
    const moving = round(span / clip.speed);
    if (source.kind === "image")
      args.push(
        "-loop",
        "1",
        "-framerate",
        String(fps),
        "-t",
        String(span),
        "-i",
        source.path,
      );
    else
      args.push(
        ...hwaccel(platform),
        "-ss",
        String(clip.start),
        "-t",
        String(span),
        "-i",
        source.path,
      );
    const has = (effect) => clip.effects.includes(effect);
    const fill = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    const small = [Math.round(width / 8), Math.round(height / 8)];
    let chain =
      clip.framing === "fit"
        ? `split[bg${i}][fg${i}];[bg${i}]scale=${small[0]}:${small[1]}:force_original_aspect_ratio=increase,crop=${small[0]}:${small[1]},boxblur=6:2,scale=${width}:${height},eq=brightness=-0.1[bgs${i}];[fg${i}]scale=${width}:${height}:force_original_aspect_ratio=decrease[fgs${i}];[bgs${i}][fgs${i}]overlay=(W-w)/2:(H-h)/2`
        : fill;
    chain += `,setsar=1,setpts=(PTS-STARTPTS)/${clip.speed}`;
    if (has("punch") || has("shake")) {
      // Overscan a little so the punch-in and shake never reveal an edge.
      const zoom = has("punch") ? "+0.18*max(0\\,1-t/0.28)" : "";
      const kick = has("shake") ? "*max(0\\,1-t/0.4)" : "*0";
      chain += `,scale=w='${width}*(1.06${zoom})':h=-2:eval=frame,crop=${width}:${height}:x='(iw-${width})/2+${Math.round(width * 0.018)}*sin(t*71)${kick}':y='(ih-${height})/2+${Math.round(height * 0.01)}*cos(t*53)${kick}'`;
    }
    chain += `,fps=${fps}`;
    if (has("blur")) chain += ",tmix=frames=3";
    chain += `,trim=duration=${moving}`;
    if (clip.freeze)
      chain += `,tpad=stop_mode=clone:stop_duration=${clip.freeze}`;
    chain += `,setpts=PTS-STARTPTS${MOODS[clip.mood]}${look}`;
    if (has("flash")) chain += ",fade=t=in:st=0:d=0.12:color=white";
    else if (dip) chain += `,fade=t=in:st=0:d=${dip}`;
    if (dip)
      chain += `,fade=t=out:st=${round(Math.max(0, clip.length - dip))}:d=${dip}`;
    filters.push(`[${i}:v:0]${chain},setsar=1,format=yuv420p[v${i}]`);
    filters.push(
      source.hasAudio && source.kind === "video"
        ? `[${i}:a:0]atrim=duration=${span},asetpts=PTS-STARTPTS${clip.speed === 1 ? "" : `,${tempo(clip.speed)}`},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${clip.length},atrim=duration=${clip.length},volume=${plan.sourceVolume},afade=t=in:d=0.03,afade=t=out:st=${round(Math.max(0, clip.length - 0.05))}:d=0.05[a${i}]`
        : `anullsrc=r=48000:cl=stereo,atrim=duration=${clip.length},aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`,
    );
    joined.push(`[v${i}][a${i}]`);
  });
  filters.push(
    `${joined.join("")}concat=n=${plan.clips.length}:v=1:a=1[cut][mix]`,
  );
  let video = "[cut]";
  const finish = [];
  if (font)
    plan.texts.forEach((t, i) => {
      const [size, y] = t.style === "title" ? [0.055, 0.42] : [0.085, 0.3];
      const pop =
        t.style === "pop" ? `*(1+0.35*max(0\\,1-(t-${t.start})/0.15))` : "";
      finish.push(
        `drawtext=fontfile=${font}:textfile=text-${i}.txt:fontcolor=white:borderw=${Math.round(height * 0.004)}:bordercolor=black@0.55:x=(w-text_w)/2:y=h*${y}:fontsize='h*${size}${pop}':enable='between(t\\,${t.start}\\,${t.end})':alpha='min(1\\,min((t-${t.start})/0.1\\,(${t.end}-t)/0.15))'`,
      );
    });
  if (plan.look?.vignette) finish.push("vignette=PI/5");
  if (plan.look?.grain) finish.push("noise=alls=6:allf=t");
  if (finish.length) {
    filters.push(`[cut]${finish.join(",")}[vout]`);
    video = "[vout]";
  }
  let audio = "[mix]";
  if (plan.music) {
    const song = byLabel.get(plan.music.source);
    const index = plan.clips.length;
    args.push("-ss", String(plan.music.start), "-i", song.path);
    const out = round(Math.min(1.5, plan.duration / 4));
    filters.push(
      `[${index}:a:0]atrim=duration=${plan.duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${plan.music.volume},afade=t=in:d=0.3,afade=t=out:st=${round(Math.max(0, plan.duration - out))}:d=${out}[song]`,
      `[mix][song]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[aout]`,
    );
    audio = "[aout]";
  }
  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    video,
    "-map",
    audio,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    "-progress",
    "pipe:1",
    "-t",
    String(plan.duration),
    output,
  );
  return args;
}
function briefFor({ prompt, skills, aspect, length, sources, interval }) {
  const lines = [
    "You are the editor inside Forma, a desktop video editor. Plan one finished video from the footage below.",
    "",
    "## The brief",
    prompt.trim(),
    "",
    "## Output",
    `- Aspect ratio ${aspect}. ${TARGETS[length] ? `Aim for about ${TARGETS[length]} seconds in total.` : "Choose a natural length that serves the brief."}`,
    `- Skills the user selected: ${skills.length ? skills.join(", ") : "none"}.`,
    ...skills.filter((s) => SKILL_NOTES[s]).map((s) => `  - ${SKILL_NOTES[s]}`),
    "",
    "## How to see the footage",
    `Contact sheets (JPEG) are in the current directory. Read every sheet with the Read tool before deciding. Each video sheet is a ${SHEET_COLUMNS}x${SHEET_ROWS} grid read left to right, top to bottom. Tile n (0-based, counted across all of a source's sheets in order) shows the frame at n x ${interval}s into that source.`,
    "",
    "## Sources",
  ];
  for (const s of sources) {
    if (s.kind === "audio")
      lines.push(
        `- ${s.label}: audio "${s.name}", ${s.duration.toFixed(1)}s. Loudness (dB) per 2s from 0s: ${s.shape.levels.join(", ") || "unknown"}.` +
          (s.shape.drop !== null
            ? ` Biggest energy rise (likely drop) at about ${s.shape.drop}s.`
            : "") +
          ` Onsets/beats (s into the song): ${s.shape.onsets.join(", ") || "none detected"}.`,
      );
    else if (s.kind === "image")
      lines.push(
        `- ${s.label}: image "${s.name}". Sheet: ${s.sheets.join(", ")}. Use it as a still of up to 10s (start 0, end = seconds on screen).`,
      );
    else
      lines.push(
        `- ${s.label}: video "${s.name}", ${s.duration.toFixed(2)}s, ${s.width}x${s.height}, ${s.fps ? Math.round(s.fps) : "?"} fps, ${s.hasAudio ? "has sound" : "silent"}. Sheets: ${s.sheets.join(", ")}.` +
          (s.silences
            ? ` Silences (start-end s): ${s.silences.map(([a, b]) => `${a}-${b}`).join(", ") || "none"}.`
            : ""),
      );
  }
  lines.push(
    "",
    "## What Forma can render",
    "- clips: the timeline in order. source is a video/image label; start and end are seconds within that source. Use several clips from one source to cut around dead time or to change speed mid-moment.",
    '- framing "fill" crops into the frame; "fit" shows the whole frame over a blurred background.',
    "- speed 0.25-2 (default 1) plays the clip slower or faster; slow down the build-up to a kill, then cut to a 1x or faster clip for the kill itself. freeze 0-2 holds the last frame for that many seconds.",
    "- A clip's length on the timeline is (end - start) / speed + freeze. Use that to land cuts on beats.",
    "- effects per clip, at the clip's first frames: punch (quick zoom-in that eases back), shake (short camera shake), flash (white flash frame), blur (motion blur on fast movement).",
    "- mood per clip: base, dark (darker, desaturated for intros or calm parts) or vivid (punchier, more saturated for drops).",
    "- look: one grade for the whole edit (brightness -0.2..0.2, contrast 0.7..1.4, saturation 0..2) plus vignette and grain switches, or null.",
    '- texts: on-screen words on the output timeline (seconds from the start of the edit). style "title" fades in, "pop" scales in. Keep them short (max 40 characters).',
    "- music: null, or an audio label with the second to start the song from and a volume 0-1.5. Song time t plays at edit time t - music.start, so place cuts at (onset - music.start). sourceVolume 0-1.5 sets the clips' own sound under the music.",
    '- transitions: "cut" or "fade" (dip to black between clips).',
    "",
    "Forma cannot render sound effects, speech transcription, optical-flow interpolation, RGB split or glitch effects. Say so in notes if the brief asks for them, and get as close as you can with the tools above.",
    "If the brief asks for moments that are not in the footage, include only what matches and say what you could not find in notes. If nothing matches, return an empty clips list and explain in summary.",
    "steps: short sentences describing what you did. notes: anything you could not do. Only read the contact sheets; do not try to open the video files.",
  );
  return lines.join("\n");
}

class EditEngine {
  constructor({
    ffmpeg,
    claude,
    resolve,
    workRoot,
    outputDirectory,
    registerOutput,
    store,
    onJob,
    platform = process.platform,
  }) {
    Object.assign(this, {
      ffmpeg,
      claude,
      resolve,
      workRoot,
      outputDirectory,
      registerOutput,
      store,
      onJob,
      platform,
    });
    this.active = null;
    this.job = null;
  }
  emit(patch) {
    this.job = {
      ...this.job,
      ...patch,
      revision: (this.job?.revision || 0) + 1,
    };
    this.onJob(structuredClone(this.job));
  }
  async start(options) {
    if (this.active) throw new Error("An edit is already running.");
    if (
      !options ||
      typeof options.sessionId !== "string" ||
      typeof options.prompt !== "string" ||
      !options.prompt.trim() ||
      options.prompt.length > 20000 ||
      !Array.isArray(options.fileIds) ||
      !options.fileIds.length ||
      options.fileIds.length > 100 ||
      !Array.isArray(options.skills) ||
      !ASPECTS[options.aspect] ||
      !SHORT_EDGE[options.quality] ||
      !["Auto", ...Object.keys(TARGETS)].includes(options.length)
    )
      throw new Error("Invalid edit settings.");
    if (!this.ffmpeg || !(await fs.stat(this.ffmpeg).catch(() => null)))
      throw new Error(
        "The bundled FFmpeg encoder is missing. Reinstall Forma.",
      );
    const claude = await this.claude.check();
    if (
      claude.state !== "signed-in" ||
      !claude.executable ||
      claude.signingIn ||
      claude.installing
    ) {
      const error = new Error(
        claude.state === "missing"
          ? "Install Claude Code, then sign in under Settings → Claude to run edits."
          : "Sign in to Claude Code under Settings → Claude to run edits.",
      );
      error.code = "claude-unavailable";
      throw error;
    }
    if (this.active) throw new Error("An edit is already running.");
    const active = { cancelled: false, process: null, completion: null };
    this.active = active;
    this.job = {
      id: randomUUID(),
      sessionId: options.sessionId,
      status: "analyzing",
      progress: 0,
      message: "Looking through your footage",
      revision: 0,
    };
    this.emit({});
    active.completion = this.run(active, options, claude.executable)
      .catch((error) =>
        this.emit({
          status: active.cancelled ? "cancelled" : "failed",
          message: active.cancelled ? cancelled().message : error.message,
        }),
      )
      .finally(() => {
        if (this.active === active) this.active = null;
      });
    return structuredClone(this.job);
  }
  exec(active, args, { cwd, stdin, timeout = 600000, onStdout } = {}) {
    if (active.cancelled) return Promise.reject(cancelled());
    return new Promise((resolve, reject) => {
      const [file, ...rest] = args;
      const child = spawn(file, rest, {
        cwd,
        env: file === this.ffmpeg ? process.env : this.claude.env,
        stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      active.process = child;
      let stdout = "",
        stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeout);
      child.stdout.on("data", (d) => {
        stdout = (stdout + d).slice(-2000000);
        onStdout?.(String(d));
      });
      child.stderr.on("data", (d) => {
        stderr = (stderr + d).slice(-4000000);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (active.process === child) active.process = null;
        if (active.cancelled) reject(cancelled());
        else if (timedOut)
          reject(
            new Error(
              file === this.ffmpeg
                ? "Video processing took too long. Try a shorter edit or lower resolution."
                : "Claude did not respond in time. Check the connection and try again.",
            ),
          );
        else resolve({ code, stdout, stderr });
      });
      if (stdin !== undefined) {
        child.stdin.on("error", () => {});
        child.stdin.end(stdin);
      }
    });
  }
  async run(active, options, claudeExe) {
    const work = path.join(this.workRoot, this.job.id);
    let partial;
    try {
      await fs.mkdir(work, { recursive: true });
      const version = await this.exec(active, [claudeExe, "--version"], {
        cwd: work,
        timeout: 15000,
      });
      const installed = semver.coerce(version.stdout);
      if (version.code !== 0 || !installed || semver.lt(installed, "2.1.257"))
        throw new Error(
          "Update Claude Code to 2.1.257 or later before editing. Forma needs its restricted file-reading support. Open Claude connection options to repair the installation.",
        );
      const sources = [];
      let videos = 0,
        audios = 0;
      for (const id of options.fileIds) {
        const filename = await this.resolve(id);
        if (!filename)
          throw new Error(
            "A source file is missing. Reimport it and try again.",
          );
        const kind = /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(filename)
          ? "audio"
          : /\.(png|jpe?g|webp|gif)$/i.test(filename)
            ? "image"
            : "video";
        const probe = parseProbe(
          (
            await this.exec(active, [
              this.ffmpeg,
              "-hide_banner",
              "-i",
              filename,
            ])
          ).stderr,
        );
        if (kind !== "image" && !probe.duration)
          throw new Error(
            `${path.basename(filename)} could not be read. Try an MP4, MOV or WAV.`,
          );
        sources.push({
          ...probe,
          kind,
          path: filename,
          name: path.basename(filename),
          label: kind === "audio" ? `A${++audios}` : `V${++videos}`,
          duration: probe.duration || 10,
        });
      }
      if (!sources.some((s) => s.kind !== "audio"))
        throw new Error(
          "Add at least one video or image. Audio alone cannot make a video.",
        );
      const footage = sources
        .filter((s) => s.kind === "video")
        .reduce((n, s) => n + s.duration, 0);
      const interval = round(Math.min(6, Math.max(1, footage / 150)));
      for (const [i, source] of sources.entries()) {
        if (active.cancelled) throw cancelled();
        this.emit({
          progress: Math.round((i / sources.length) * 30),
          message: `Watching ${source.name}`,
        });
        if (source.kind === "audio") {
          source.shape = musicShape(
            parseLoudness(
              (
                await this.exec(active, [
                  this.ffmpeg,
                  "-hide_banner",
                  "-nostats",
                  "-i",
                  source.path,
                  "-vn",
                  "-af",
                  "aresample=16000,asetnsamples=n=1600:p=0,astats=metadata=1:reset=1:measure_overall=RMS_level:measure_perchannel=none,ametadata=mode=print:key=lavfi.astats.Overall.RMS_level",
                  "-f",
                  "null",
                  "-",
                ])
              ).stderr,
            ).slice(0, 6000),
          );
          continue;
        }
        const pattern = `${source.label}-sheet-%02d.jpg`;
        const sheet = await this.exec(active, [
          this.ffmpeg,
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          ...(source.kind === "video" ? hwaccel(this.platform) : []),
          "-i",
          source.path,
          "-map",
          "0:v:0",
          "-vf",
          source.kind === "video"
            ? `fps=1/${interval},scale=480:-2,tile=${SHEET_COLUMNS}x${SHEET_ROWS}`
            : "scale=960:-2",
          ...(source.kind === "image" ? ["-frames:v", "1"] : []),
          "-q:v",
          "4",
          path.join(work, pattern),
        ]);
        source.sheets = (await fs.readdir(work))
          .filter((f) => f.startsWith(`${source.label}-sheet-`))
          .sort();
        if (sheet.code !== 0 || !source.sheets.length)
          throw new Error(
            `Forma could not decode ${source.name}. ${sheet.stderr.slice(-300)}`,
          );
        if (
          source.kind === "video" &&
          source.hasAudio &&
          options.skills.includes("silence")
        ) {
          const result = await this.exec(active, [
            this.ffmpeg,
            "-hide_banner",
            "-nostats",
            "-i",
            source.path,
            "-vn",
            "-af",
            "silencedetect=noise=-35dB:d=0.4",
            "-f",
            "null",
            "-",
          ]);
          source.silences = parseSilences(result.stderr).slice(0, 200);
        }
      }
      this.emit({
        status: "planning",
        progress: 32,
        message: "Claude is planning your edit",
      });
      const ticker = setInterval(() => {
        if (this.job.status === "planning" && this.job.progress < 58)
          this.emit({ progress: this.job.progress + 1 });
      }, 5000);
      let answer;
      try {
        answer = await this.exec(
          active,
          [
            claudeExe,
            "-p",
            "--output-format",
            "json",
            "--model",
            MODELS[options.model] || "sonnet",
            "--tools",
            "Read,Glob",
            "--allowedTools",
            "Read(./**)",
            "--permission-mode",
            "dontAsk",
            "--strict-mcp-config",
            "--disable-slash-commands",
            "--setting-sources",
            "",
            "--settings",
            JSON.stringify({
              permissions: { blockReadsOutsideWorkingDirectories: true },
              disableAllHooks: true,
              disableClaudeAiConnectors: true,
              autoMemoryEnabled: false,
            }),
            "--no-session-persistence",
            "--json-schema",
            JSON.stringify(PLAN_SCHEMA),
          ],
          {
            cwd: work,
            stdin: briefFor({ ...options, sources, interval }),
            timeout: 900000,
          },
        );
      } finally {
        clearInterval(ticker);
      }
      let reply;
      if (answer.code !== 0)
        throw new Error(
          "Claude could not finish planning this edit. Check your connection and usage limits, then try again.",
        );
      try {
        reply = JSON.parse(answer.stdout.trim().split(/\r?\n/).pop());
      } catch {
        throw new Error(
          `Claude Code did not answer. ${answer.stderr.slice(-400)}`.trim(),
        );
      }
      if (reply.is_error || !reply.structured_output)
        throw new Error(
          `Claude Code could not plan this edit. ${text(reply.result, 400) || "Check your Claude Code sign-in and usage limits."}`,
        );
      const plan = normalizePlan(reply.structured_output, sources);
      let font = null;
      for (const candidate of FONTS[this.platform] || [])
        if (
          plan.texts.length &&
          (await fs.copyFile(candidate, path.join(work, "font.ttf")).then(
            () => true,
            () => false,
          ))
        ) {
          font = "font.ttf";
          break;
        }
      for (const [i, t] of plan.texts.entries())
        await fs.writeFile(path.join(work, `text-${i}.txt`), t.text);
      const fps = sources.some((s) => s.kind === "video" && s.fps >= 50)
        ? 60
        : 30;
      const { width, height } = outputSize(options.aspect, options.quality);
      const folder = this.outputDirectory();
      await fs.mkdir(folder, { recursive: true });
      const stem =
        plan.title
          .replace(/[^\p{L}\p{N} _-]+/gu, "")
          .trim()
          .slice(0, 60) || "Forma edit";
      let name = `${stem}.mp4`;
      for (
        let n = 2;
        await fs.stat(path.join(folder, name)).catch(() => null);
        n++
      )
        name = `${stem} ${n}.mp4`;
      const output = path.join(folder, name);
      partial = path.join(folder, `.${name}.${this.job.id}.partial.mp4`);
      this.emit({
        status: "rendering",
        progress: 60,
        message: `Rendering ${plan.clips.length} clip${plan.clips.length === 1 ? "" : "s"}`,
      });
      const render = await this.exec(
        active,
        [
          this.ffmpeg,
          ...renderArgs(plan, sources, {
            width,
            height,
            fps,
            output: partial,
            platform: this.platform,
            font,
          }),
        ],
        {
          cwd: work,
          timeout: 3600000,
          onStdout: (chunk) => {
            const time = /out_time_us=(\d+)/.exec(chunk);
            if (time)
              this.emit({
                progress: Math.min(
                  97,
                  60 + Math.round((+time[1] / 1e6 / plan.duration) * 37),
                ),
              });
          },
        },
      );
      if (render.code !== 0)
        throw new Error(
          `FFmpeg could not render the edit. ${render.stderr.slice(-600)}`,
        );
      this.emit({
        status: "verifying",
        progress: 98,
        message: "Checking the finished video",
      });
      const check = parseProbe(
        (await this.exec(active, [this.ffmpeg, "-hide_banner", "-i", partial]))
          .stderr,
      );
      const size = (await fs.stat(partial)).size;
      if (!check.duration || size < 1000)
        throw new Error("The render produced an empty video.");
      const decode = await this.exec(
        active,
        [
          this.ffmpeg,
          "-v",
          "error",
          "-xerror",
          "-i",
          partial,
          "-map",
          "0:v:0",
          "-map",
          "0:a?",
          "-f",
          "null",
          "-",
        ],
        { timeout: 120000 },
      );
      if (decode.code !== 0)
        throw new Error(
          "The finished video could not be decoded. No unfinished video was added to your library.",
        );
      await fs.rename(partial, output);
      partial = null;
      const media = await this.registerOutput(output);
      const record = {
        id: media.id,
        title: plan.title,
        filmId: "forma-edit",
        name,
        path: output,
        size,
        duration: check.duration,
        width,
        height,
        fps,
        createdAt: Date.now(),
        hasAudio: true,
      };
      const records = await this.store.read("exports", []);
      await this.store.write(
        "exports",
        [record, ...(Array.isArray(records) ? records : [])].slice(0, 500),
      );
      const labels = new Map(sources.map((s) => [s.label, s.name]));
      if (!font && plan.texts.length)
        plan.notes.push(
          "No bold system font was found, so text overlays were skipped.",
        );
      this.emit({
        status: "completed",
        progress: 100,
        message: "Your edit is ready",
        plan: {
          title: plan.title,
          summary: `${plan.clips.length} clip${plan.clips.length === 1 ? "" : "s"} · ${options.aspect} · ${Math.round(plan.duration)}s · MP4 / ${options.quality} · ${fps} fps${plan.music ? ` · ${labels.get(plan.music.source)}` : ""}`,
          steps: [...plan.steps, ...plan.notes.map((n) => `Note: ${n}`)].slice(
            0,
            16,
          ),
          video: {
            id: media.id,
            url: media.url,
            name,
            width,
            height,
            duration: check.duration,
          },
        },
      });
    } finally {
      if (partial) await fs.rm(partial, { force: true }).catch(() => {});
      await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }
  async cancel() {
    const active = this.active;
    if (!active) return;
    active.cancelled = true;
    active.process?.kill();
    await active.completion;
  }
  close() {
    return this.cancel();
  }
}
module.exports = {
  EditEngine,
  PLAN_SCHEMA,
  briefFor,
  musicShape,
  normalizePlan,
  outputSize,
  parseLoudness,
  parseProbe,
  parseSilences,
  renderArgs,
  tempo,
};
