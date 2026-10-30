// Video: turn one Instants post into an MP4 by running the HyperFrames skill in
// an unattended local `claude` agent scoped to .research-cache/videos-work/<slug>/.
// Live status lives in .research-cache/videos-work/<slug>/status.json (local);
// the finished file is copied to the store's videos/<slug>.mp4 (+ .jpg poster,
// + .status.json with the ready result so other machines see it).
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureStore, mediaDir, postsDir, videosDir, VIDEOS_WORK } from "./store.mjs";

export const VIDEOS_CACHE = VIDEOS_WORK;

export const VIDEO_TIMEOUT = 45 * 60 * 1000;
const PERSIST_MS = 2000;
const LOG_MAX = 60;
const FFMPEG = process.env.FFMPEG_PATH || "/opt/homebrew/bin/ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || path.join(path.dirname(FFMPEG), "ffprobe");
export const ASPECTS = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080] };
const DESTINATION = { "9:16": "Instagram Reels", "1:1": "Instagram feed", "16:9": "YouTube" };

const validSlug = (slug) => typeof slug === "string" && /^[a-z0-9-]+$/.test(slug);
export const statusFile = (slug) => path.join(VIDEOS_CACHE, slug, "status.json");
const noDash = (s) => String(s ?? "").replace(/[\u2013\u2014]/g, ", ").replace(/ ,/g, ",");

function cliEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("CLAUDE") || key === "ANTHROPIC_BASE_URL") delete env[key];
  return env;
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

export async function readVideoStatus(slug) {
  if (!validSlug(slug)) return null;
  return fs.readFile(statusFile(slug), "utf8").then(JSON.parse).catch(() => null);
}

export async function deleteVideo(slug) {
  if (!validSlug(slug)) throw new Error("bad slug");
  await fs.rm(path.join(VIDEOS_CACHE, slug), { recursive: true, force: true });
  for (const ext of [".mp4", ".jpg", ".status.json"]) await fs.rm(path.join(/*turbopackIgnore: true*/ videosDir(), `${slug}${ext}`), { force: true });
}

/** Run a short command, resolve stdout; reject on non-zero exit. */
function run(cmd, args, { signal, timeout = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], signal, timeout });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-400)}`))));
  });
}

// ---------- status tracking ----------

function tracker(slug, initial, onStatus) {
  const status = initial;
  let last = 0;
  let pending = null;
  let chain = Promise.resolve();
  const persist = () => {
    last = Date.now();
    const snap = structuredClone(status);
    chain = chain.then(() => writeJson(statusFile(slug), snap)).catch(() => {});
    try {
      onStatus?.(snap);
    } catch {}
    return chain;
  };
  return {
    status,
    log(text, stage) {
      const line = noDash(text).replace(/\s+/g, " ").trim().slice(0, 240);
      if (line) {
        status.log.push({ at: new Date().toISOString(), text: line });
        if (status.log.length > LOG_MAX) status.log.splice(0, status.log.length - LOG_MAX);
      }
      if (stage) status.stage = stage;
      const wait = PERSIST_MS - (Date.now() - last);
      if (wait <= 0) persist();
      else if (!pending) pending = setTimeout(() => ((pending = null), persist()), wait);
    },
    async set(patch) {
      Object.assign(status, patch);
      if (pending) {
        clearTimeout(pending);
        pending = null;
      }
      await persist();
    },
  };
}

// ---------- inputs ----------

async function prepareInput(record, dir) {
  const input = path.join(dir, "input");
  await fs.rm(input, { recursive: true, force: true });
  await fs.mkdir(input, { recursive: true });
  const assets = [];
  const media = path.join(mediaDir(), record.slug);
  const files = await fs.readdir(media).catch(() => []);
  for (const name of files) {
    await fs.copyFile(path.join(media, name), path.join(input, name)).catch(() => {});
    const url = `/research/media/${record.slug}/${name}`;
    const shown = record.post.slides.find((s) => (s.type === "image" || s.type === "cover") && s.image === url);
    const what = shown ? shown.caption || shown.heading || `${shown.type} slide image` : "media from the research folder";
    assets.push({ file: name, what: noDash(what) });
  }
  await fs.writeFile(
    path.join(input, "post.json"),
    JSON.stringify({ slug: record.slug, name: record.name, occurredAt: record.occurredAt, meta: record.meta, post: record.post }, null, 2),
  );
  await fs.writeFile(path.join(input, "writeup.md"), `# ${record.post.title}\n\n${record.post.hook}\n\n${record.post.writeup}\n`);
  return assets;
}

const ANGLE = { Experiment: "narrative", Research: "concept", Study: "concept", Prototype: "narrative", Tool: "how-to", Simulation: "concept" };

export function buildVideoPrompt(record, { aspect, length, assets }) {
  const post = record.post;
  const [w, h] = ASPECTS[aspect];
  const angle = ANGLE[post.kind] ?? "concept";
  const numbers = post.slides
    .filter((s) => s.type === "bigNumbers" || s.type === "chart")
    .map((s) =>
      s.type === "bigNumbers"
        ? `- ${s.heading}: ${s.items.map((i) => `${i.value} (${i.label})`).join("; ")}`
        : `- ${s.heading} (${s.chart}${s.unit ? `, ${s.unit}` : ""}): x=[${s.x.join(", ")}] ${s.series.map((x) => `${x.name}=[${x.values.join(", ")}]`).join(" ")}`,
    );
  const assetLines = assets.length ? assets.map((a) => `- ./input/${a.file}: ${a.what}`).join("\n") : "- none (typography and shapes only)";
  return `/hyperframes Make a ${length}s video from the research post in ./input (post.json has the full post and slides, writeup.md the long form).

AUTONOMOUS MODE. Do not ask questions. Nobody is watching this session; every brief answer is below and already confirmed by the user.

Setup:
- Create the HyperFrames project in ./project with \`npx hyperframes init\` per the skill, working only inside this directory.
- Write project/BRIEF.md with the confirmed brief below, then run the workflow without asking brief questions.

BRIEF (fully confirmed):
- workflow: faceless-explainer (use general-video only if it fits clearly better)
- flow: automation
- storyboard: no (mode: autonomous)
- message: ${noDash(post.hook)}
- destination: ${DESTINATION[aspect]}
- aspect: ${aspect} (${w}x${h})
- language: en
- length: ${length}s
- angle: ${angle} (post kind: ${post.kind})
- audience: people curious about the research
- narration: no. On-screen typography only. No TTS, no music unless a local file in ./input, no credentials, no sign-in, no cloud rendering.
- assets:
${assetLines}
- customizations: animate the real numbers from the bigNumbers and chart slides, copied exactly as given in ./input/post.json. Never compute, round, re-derive or invent a figure (no new averages, percentages or totals); if a number is not in post.json, leave it out; use accent color ${post.accent}; never put em dashes or en dashes on screen.
- title: ${noDash(post.title)}
- summary: ${noDash(post.summary)}
${numbers.length ? `- real numbers:\n${numbers.join("\n")}` : ""}
- composition: use the whole ${w}x${h} frame. Center each scene's content vertically, size type for a phone held at arm's length (headlines at least 7% of frame width), and let charts fill most of the frame width. No frame should show only a title: bring the main visual in within the first 0.5s of each scene. Use the provided images when they show the project itself (screenshots, renders), full-bleed with a scrim.

Rendering is pre-approved: once lint/check passes, render the final MP4 locally without asking.
When done, print the absolute path of the MP4 on its own line exactly as:
VIDEO_PATH: <absolute path>
If you are blocked and cannot finish, print one line:
VIDEO_ERROR: <reason>
`;
}

// ---------- stream-json parsing ----------

function describeTool(name, input = {}) {
  const rel = (p) => (typeof p === "string" ? p.replace(/^.*?\/project\//, "").replace(/^.*?\/videos\/[^/]+\//, "") : "");
  switch (name) {
    case "Bash": {
      const cmd = String(input.command ?? "").split("\n")[0].slice(0, 120);
      return { text: `Running: ${cmd}`, stage: /hyperframes render/.test(cmd) ? "Rendering" : /hyperframes (lint|check|validate|snapshot)/.test(cmd) ? "Checking" : /hyperframes init/.test(cmd) ? "Setting up" : undefined };
    }
    case "Write":
      return { text: `Writing ${rel(input.file_path)}`, stage: /compositions\//.test(input.file_path ?? "") ? "Building scenes" : /BRIEF|STORYBOARD/.test(input.file_path ?? "") ? "Planning" : undefined };
    case "Edit":
      return { text: `Editing ${rel(input.file_path)}` };
    case "Read":
      return { text: `Reading ${rel(input.file_path)}` };
    case "Skill":
      return { text: `Loading skill ${input.skill ?? input.command ?? ""}`.trim() };
    case "Glob":
    case "Grep":
      return { text: `Searching ${input.pattern ?? ""}` };
    case "TodoWrite":
      return { text: "Updating plan", stage: "Planning" };
    default:
      return { text: `Using ${name}` };
  }
}

async function newestMp4(dir) {
  let best = null;
  const walk = async (d, depth) => {
    if (depth > 6) return;
    const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (e.name.toLowerCase().endsWith(".mp4")) {
        const st = await fs.stat(p).catch(() => null);
        if (st && (!best || st.mtimeMs > best.mtime)) best = { path: p, mtime: st.mtimeMs };
      }
    }
  };
  await walk(dir, 0);
  return best?.path ?? null;
}

function runAgent({ cwd, prompt, signal, t }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason instanceof Error ? signal.reason : new Error("cancelled"));
    const child = spawn(
      "claude",
      [
        "-p",
        "--output-format", "stream-json",
        "--verbose",
        "--model", (process.env.INSTANTS_VIDEO_MODEL ?? process.env.RECALL_VIDEO_MODEL) || "sonnet",
        "--permission-mode", "acceptEdits",
        "--allowedTools", "Bash Read Write Edit Glob Grep Skill TodoWrite",
      ],
      { cwd, stdio: ["pipe", "pipe", "pipe"], env: cliEnv() },
    );
    let buf = "";
    let err = "";
    let videoPath = null;
    let videoError = null;
    let resultText = "";
    let settled = false;
    let killTimer;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn(value);
    };
    const stop = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      killTimer.unref?.();
    };
    const onAbort = () => {
      stop();
      finish(reject, signal.reason instanceof Error ? signal.reason : new Error("cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      stop();
      finish(reject, new Error("video agent timed out after 45 minutes"));
    }, VIDEO_TIMEOUT);

    const scanText = (text) => {
      for (const m of text.matchAll(/^\s*VIDEO_PATH:\s*(.+?\.mp4)\s*$/gim)) videoPath = m[1].trim();
      const e = text.match(/^\s*VIDEO_ERROR:\s*(.+)$/im);
      if (e) videoError = e[1].trim();
    };
    const onLine = (line) => {
      if (!line.trim()) return;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.type === "assistant") {
        for (const block of msg.message?.content ?? []) {
          if (block.type === "text" && block.text) {
            scanText(block.text);
            t.log(block.text.split("\n").find((l) => l.trim()) ?? "");
          } else if (block.type === "tool_use") {
            const d = describeTool(block.name, block.input);
            t.log(d.text, d.stage);
          }
        }
      } else if (msg.type === "result") {
        resultText = String(msg.result ?? "");
        scanText(resultText);
        if (msg.is_error && !videoError) videoError = resultText.slice(0, 400) || msg.subtype || "agent error";
      }
    };
    child.stdout.on("data", (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        onLine(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    child.stderr.on("data", (c) => (err = (err + c).slice(-4000)));
    child.stdin.on("error", () => {});
    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      clearTimeout(killTimer);
      if (buf) onLine(buf);
      if (settled) return;
      if (code !== 0 && !videoPath) return finish(reject, new Error(videoError || `claude exited ${code}: ${err.trim().slice(-400)}`));
      finish(resolve, { videoPath, videoError });
    });
    child.stdin.end(prompt);
  });
}

// ---------- dry mode ----------

async function dryAgent({ dir, signal, t, aspect, length }) {
  const steps = [
    ["Loading skill hyperframes", "Setting up"],
    ["Running: npx hyperframes init project", "Setting up"],
    ["Writing BRIEF.md", "Planning"],
    ["Writing compositions/scene-1.html", "Building scenes"],
    ["Writing compositions/scene-2.html", "Building scenes"],
    ["Running: npx hyperframes check", "Checking"],
    ["Running: npx hyperframes render", "Rendering"],
  ];
  for (const [text, stage] of steps) {
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("cancelled");
    t.log(text, stage);
    await new Promise((r) => setTimeout(r, Number((process.env.INSTANTS_VIDEO_DRY_STEP_MS ?? process.env.RECALL_VIDEO_DRY_STEP_MS)) || 400));
  }
  const [w, h] = ASPECTS[aspect];
  const out = path.join(dir, "project", "renders", "dry.mp4");
  await fs.mkdir(path.dirname(out), { recursive: true });
  const secs = Math.min(3, length);
  await run(FFMPEG, ["-y", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc=size=${w / 4}x${h / 4}:rate=24:duration=${secs}`, "-pix_fmt", "yuv420p", out], { signal });
  return { videoPath: out, videoError: null };
}

// ---------- main ----------

/**
 * Render one post to video. Resolves with the final VideoStatus (ready or
 * failed); never throws for agent failures, only writes them to status.
 * waitTurn, when given, is awaited before any work so a caller can cap how
 * many renders run at once; the status stays "queued" meanwhile.
 */
export async function runVideo({ slug, aspect = "9:16", length = 45, onStatus, signal, waitTurn } = {}) {
  if (!validSlug(slug)) throw new Error("bad slug");
  if (!ASPECTS[aspect]) throw new Error(`aspect must be one of ${Object.keys(ASPECTS).join(", ")}`);
  length = Math.round(Math.min(120, Math.max(10, Number(length) || 45)));
  await ensureStore();
  const dir = path.join(VIDEOS_CACHE, slug);
  const t = tracker(slug, { slug, state: "queued", startedAt: new Date().toISOString(), aspect, log: [], stage: "Queued" }, onStatus);
  await t.set({});
  try {
    if (waitTurn) {
      await t.set({ stage: "Waiting for a free slot" });
      await waitTurn();
      await t.set({ stage: "Starting" });
    }
    const record = await fs.readFile(path.join(postsDir(), `${slug}.json`), "utf8").then(JSON.parse).catch(() => null);
    if (!record?.post) throw new Error(`No post named "${slug}".`);
    t.log("Preparing inputs", "Preparing");
    const assets = await prepareInput(record, dir);
    await t.set({ state: "running" });
    const dry = (process.env.INSTANTS_VIDEO_DRY ?? process.env.RECALL_VIDEO_DRY) === "1";
    t.log(dry ? "Dry run: simulating the agent" : "Starting the video agent");
    const result = dry
      ? await dryAgent({ dir, signal, t, aspect, length })
      : await runAgent({ cwd: dir, prompt: buildVideoPrompt(record, { aspect, length, assets }), signal, t });

    let mp4 = null;
    if (result.videoPath) {
      const p = path.resolve(dir, result.videoPath);
      if (await fs.stat(p).then((s) => s.isFile()).catch(() => false)) mp4 = p;
    }
    mp4 ??= await newestMp4(path.join(dir, "project"));
    if (!mp4) throw new Error(result.videoError || "the agent finished without producing an MP4");

    t.log("Copying video and making poster", "Finishing");
    const VIDEOS_OUT = videosDir();
    await fs.mkdir(VIDEOS_OUT, { recursive: true });
    const outMp4 = path.join(VIDEOS_OUT, `${slug}.mp4`);
    const outJpg = path.join(VIDEOS_OUT, `${slug}.jpg`);
    await fs.copyFile(mp4, `${outMp4}.tmp`);
    await fs.rename(`${outMp4}.tmp`, outMp4);
    let poster;
    const tmpJpg = path.join(VIDEOS_OUT, `.${slug}.poster.tmp.jpg`);
    try {
      await run(FFMPEG, ["-y", "-loglevel", "error", "-ss", "1", "-i", outMp4, "-frames:v", "1", "-q:v", "3", tmpJpg], { signal });
    } catch {
      await run(FFMPEG, ["-y", "-loglevel", "error", "-i", outMp4, "-frames:v", "1", "-q:v", "3", tmpJpg], { signal }).catch(() => {});
    }
    if (await fs.rename(tmpJpg, outJpg).then(() => true, () => false)) poster = `/research/videos/${slug}.jpg`;
    await fs.rm(tmpJpg, { force: true });
    let durationSec;
    try {
      const out = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", outMp4], { signal });
      durationSec = Math.round(Number(out.trim()) * 10) / 10 || undefined;
    } catch {}
    t.log("Video ready", "Done");
    await t.set({
      state: "ready",
      finishedAt: new Date().toISOString(),
      url: `/research/videos/${slug}.mp4`,
      poster,
      durationSec,
      error: undefined,
    });
    await writeJson(path.join(VIDEOS_OUT, `${slug}.status.json`), { ...structuredClone(t.status), log: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    t.log(`Failed: ${message}`, "Failed");
    await t.set({ state: "failed", finishedAt: new Date().toISOString(), error: noDash(message) });
  }
  return structuredClone(t.status);
}
