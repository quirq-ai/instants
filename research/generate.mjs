// Generation: the GeneratedPost JSON Schema, the prompt, the two Claude
// backends (Messages API or local claude CLI) and output validation/repair.
import { spawn } from "node:child_process";

export const PROMPT_VERSION = "recall-4";
export const TOPICS = [
  "AI & Agents", "Developer Tools", "Simulation & Science", "Graphics & Visualization", "Media & Video",
  "Product & Design", "Infrastructure", "Data & Knowledge", "Business & Strategy", "Other",
];
const STATUSES = ["idea", "prototype", "working", "shipped", "abandoned"];
const TIMEOUT = 5 * 60 * 1000;

// ---------- schema ----------

const str = (description) => (description ? { type: "string", description } : { type: "string" });
const src = str("Source id (s1, s2... or git) the content came from");
const slide = (type, properties, required) => ({
  type: "object",
  properties: { type: { type: "string", enum: [type] }, ...properties },
  required: ["type", ...required],
  additionalProperties: false,
});

const SLIDE_SCHEMA = {
  anyOf: [
    slide("cover", { heading: str("Hook headline, under 70 chars"), body: str("One sentence under 160 chars"), image: str("Media URL from the MEDIA list") }, ["heading"]),
    slide("bigNumbers", {
      heading: str(),
      items: {
        type: "array", minItems: 1, maxItems: 4,
        items: { type: "object", properties: { value: str("Short figure, e.g. 1,240 or 3.2x or 41 ms"), label: str("What it measures, under 40 chars"), src }, required: ["value", "label", "src"], additionalProperties: false },
      },
    }, ["heading", "items"]),
    slide("chart", {
      chart: { type: "string", enum: ["bar", "line", "donut", "stackedBar"] },
      heading: str(), unit: str("Unit of the values, e.g. ms, %, files"),
      x: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 16 },
      series: {
        type: "array", minItems: 1, maxItems: 4,
        items: { type: "object", properties: { name: str(), values: { type: "array", items: { type: "number" } } }, required: ["name", "values"], additionalProperties: false },
      },
      takeaway: str("One sentence reading of the chart"), src,
    }, ["chart", "heading", "x", "series", "src"]),
    slide("table", {
      heading: str(),
      columns: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5 },
      rows: { type: "array", items: { type: "array", items: { type: "string" } }, minItems: 1, maxItems: 8 },
      highlight: { type: "integer", description: "Row index to emphasize" }, src,
    }, ["heading", "columns", "rows", "src"]),
    slide("timeline", {
      heading: str(),
      events: {
        type: "array", minItems: 2, maxItems: 8,
        items: { type: "object", properties: { date: str("YYYY-MM-DD or Mon YYYY"), label: str("Under 60 chars"), detail: str() }, required: ["date", "label"], additionalProperties: false },
      },
      src,
    }, ["heading", "events"]),
    slide("code", { heading: str(), lang: str(), code: str("At most 14 lines, copied from the material"), caption: str(), src }, ["heading", "lang", "code", "src"]),
    slide("image", { image: str("Media URL from the MEDIA list"), caption: str(), fit: { type: "string", enum: ["cover", "contain"] }, src }, ["image"]),
    slide("quote", { text: str("Copied word for word from the material"), attribution: str(), verbatim: { type: "boolean" }, src }, ["text", "verbatim", "src"]),
    slide("flow", {
      heading: str(),
      steps: { type: "array", minItems: 2, maxItems: 6, items: { type: "object", properties: { label: str("Under 40 chars"), detail: str("Under 90 chars") }, required: ["label"], additionalProperties: false } },
      src,
    }, ["heading", "steps"]),
    slide("compare", {
      heading: str(),
      left: { type: "object", properties: { title: str(), points: { type: "array", items: { type: "string" }, maxItems: 4 } }, required: ["title", "points"], additionalProperties: false },
      right: { type: "object", properties: { title: str(), points: { type: "array", items: { type: "string" }, maxItems: 4 } }, required: ["title", "points"], additionalProperties: false },
      src,
    }, ["heading", "left", "right"]),
    slide("checklist", {
      heading: str(),
      items: { type: "array", minItems: 2, maxItems: 7, items: { type: "object", properties: { text: str(), done: { type: "boolean" } }, required: ["text", "done"], additionalProperties: false } },
      src,
    }, ["heading", "items"]),
    slide("takeaway", { heading: str("The one thing to remember"), body: str("Under 200 chars") }, ["heading"]),
  ],
};

const RAW_SCHEMA = {
  type: "object",
  properties: {
    title: str("Clean human project title, e.g. Solar Claude (not a slug)"),
    kind: str("One word: Experiment, Research, Prototype, Tool, Simulation, Study, Video, Dataset"),
    topic: { type: "string", enum: TOPICS },
    status: { type: "string", enum: STATUSES },
    hook: str("One line under 90 chars that makes someone want to swipe"),
    summary: str("1 to 2 plain sentences: what it is and what came of it"),
    writeup: str("Markdown, 150 to 400 words"),
    tags: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 6, description: "lowercase, no #" },
    accent: str("Hex color fitting the subject, e.g. #4f8cff"),
    sources: {
      type: "array",
      items: { type: "object", properties: { id: str(), path: str(), lines: str(), note: str("What was taken from it") }, required: ["id", "path"], additionalProperties: false },
    },
    slides: { type: "array", minItems: 3, maxItems: 9, items: SLIDE_SCHEMA },
  },
  required: ["title", "kind", "topic", "status", "hook", "summary", "writeup", "tags", "accent", "sources", "slides"],
  additionalProperties: false,
};

// Structured outputs accept only minItems 0 or 1 and no maxItems; the prompt
// and validatePost enforce the real limits.
function portable(node) {
  if (Array.isArray(node)) return node.map(portable);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "maxItems") continue;
    out[key] = key === "minItems" ? Math.min(value, 1) : portable(value);
  }
  return out;
}
export const POST_SCHEMA = portable(RAW_SCHEMA);

// ---------- prompt ----------

const TOPIC_GUIDE = `Topics (pick the single best fit; tie-breaks in brackets):
- AI & Agents: LLM apps, agents, prompting, evals, model research. [An agent tool for developers goes here if the agent is the point.]
- Developer Tools: CLIs, editors, libraries, build or test tooling used while writing code. [Not sandboxes, VMs, deploy targets or hosting.]
- Simulation & Science: physics, astronomy, numeric models, scientific study.
- Graphics & Visualization: rendering, shaders, 3D, charts, generative visuals.
- Media & Video: video, audio, animation pipelines, motion graphics.
- Product & Design: UI, UX, product specs, design systems, landing pages.
- Infrastructure: sandboxes, VMs, containers, deployment, hosting, networking, CI. [Sandboxes and VMs always go here.]
- Data & Knowledge: datasets, taxonomies, search, RAG, knowledge bases, note systems.
- Business & Strategy: markets, pricing, competitors, plans, fundraising.
- Other: only when nothing above fits.`;

const RECIPES = `Slide recipes (a starting point, adapt to the material; do not open every post the same way):
- Study / Research / Dataset: cover, chart or table, bigNumbers, a second data slide or quote, takeaway.
- Simulation / Graphics / Video work with MEDIA: cover with image, image, chart or code, image, takeaway.
- Tool / Prototype: cover, code, compare or table, timeline when git exists, takeaway.
- Writing or notes: cover, quote (verbatim), checklist or compare, bigNumbers if real figures exist, takeaway.`;

const HOOKS = `Hook examples that work (vary the shape, never reuse a template):
- "Rapier was the bar. This solver cleared it on 8 of 9 scenes."
- "What happens when a galaxy has no dark matter? It flies apart in 40 frames."
- "A weekend fork that ended up with more commits than the original."
Avoid lists of three ("X, Y, Z: ..."), counted openers ("One A, two B, one C"), and hooks that repeat the summary's opening words.`;

export const SYSTEM = `You are the editor of Recall, a private feed that turns someone's past research and experiments into Instagram style carousel posts so they can rediscover and show off their work. You write one post per research item, grounded entirely in the material provided.

Rules:
1. Slide 1 is type "cover". If a MEDIA image fits (a screenshot, render, scene), set cover.image to its URL. Cover heading is a hook, not the title.
2. Scale to the material: 4 to 9 slides total. Rich material (benchmarks, datasets, long docs, git history) earns 7 to 9; modest material 4 to 6. THIN MATERIAL (marked below) gets exactly 3 slides: cover, one data, image, code or quote slide (not flow), takeaway; its writeup is 80 to 150 words.
3. Prefer data slides over text: chart, bigNumbers, table, timeline, compare, code, image, quote. Use a flow slide only when the material describes a real multi-step pipeline or process, never as a generic "how it works" filler, and never as slide 2. At most one takeaway (last slide) and one checklist.
4. Every number you show (bigNumbers values, chart values, table cells with figures) must appear in the material or the FOLDER FACTS, copied exactly as written: same digits, same decimals (771.3 stays 771.3, never 771), same unit. Never estimate, round, convert, or invent. Each such slide (and each bigNumbers item) carries "src" with the id of the source it came from (s1, s2... from the SOURCE LIST, or "git" for FOLDER FACTS). A chart, table or bigNumbers item with no valid src is deleted.
5. Charts: at least 2 x values; every series has exactly one numeric value per x value; all from one consistent measure with a unit. Good chart material: data summaries, tables, benchmark numbers, git weekly activity. Do not chart language shares (the page already shows them) or things that are not comparable. When a source table has several series (implementations, models, configs), keep every series; if you chart only some rows or scenes, say so in the takeaway (e.g. "3 of 9 scenes shown") and keep the hook consistent with what the chart shows.
6. Quote slides: welcome when a README or doc has a sharp line worth showing, copied word for word, with verbatim: true and src. Never paraphrase inside a quote slide.
7. When FOLDER FACTS include git, include one timeline slide built from the git milestones (src "git"), with labels rewritten as short human phrases (dates unchanged). Weekly activity includes zero weeks; a week marked partial is still in progress, so do not present it as a final count.
8. Image slides: only URLs from the MEDIA list, with a caption saying what is shown. When MEDIA has 2 or more entries besides the cover image, include at least 1 image slide (up to 3) using the images that best show the work.
9. Code slides: a short excerpt (max 14 lines) copied from the material that shows the core idea.
10. title: a clean human project title in Title Case (e.g. "OS Taxonomy", "Solar Claude"), never a slug or file name, and never one of the TITLES ALREADY TAKEN (if the natural title is taken, qualify it with what makes this item different). status: idea, prototype, working, shipped, or abandoned, judged from the evidence.
11. writeup: markdown, 150 to 400 words, with short sections covering what it is, why it was made, how it works, findings or results (with the real numbers), and open questions. Plain, confident, specific; no hype.
12. sources: list each source you actually used, with its id and path exactly as in the SOURCE LIST, plus a short note of what you took. Add {"id":"git","path":".git"} if you used git facts.
13. Keep text phone sized: headings under 60 chars, bullet points under 90 chars.
14. Never use em dashes or en dashes. Use commas, colons, or "to" for ranges.

${TOPIC_GUIDE}

${RECIPES}

${HOOKS}`;

export function buildPrompt({ name, meta, collected, media, thin, takenTitles = [] }) {
  const sourceList = collected.sources.map((s) => `${s.id}  ${s.path}  (${s.kind})`).join("\n");
  const facts = {
    name,
    files: meta.fileCount,
    bytes: meta.bytes,
    languages: meta.languages.map((l) => `${l.name} ${(l.share * 100).toFixed(1)}%`),
    stack: meta.stack,
    formats: meta.formats.slice(0, 8).map((f) => `${f.ext} x${f.count}`),
    git: meta.git
      ? {
          commits: meta.git.commits,
          authors: meta.git.authors,
          first: meta.git.first.slice(0, 10),
          last: meta.git.last.slice(0, 10),
          weekly_activity: meta.git.activity.map((a) => {
            const partial = Date.now() - new Date(`${a.week}T00:00:00Z`).getTime() < 7 * 86400000;
            return `${a.week}: ${a.commits}${partial ? " (partial week, in progress)" : ""}`;
          }),
          milestones: meta.git.milestones.map((m) => `${m.date}  ${m.subject}`),
        }
      : "none (not a git repo)",
  };
  const mediaList = media.length
    ? media.map((m) => `${m.url}  (original: ${m.original}, ${m.width}x${m.height})`).join("\n")
    : "none: do not use image slides or cover.image";
  return [
    `RESEARCH ITEM: ${name}`,
    thin ? "THIN MATERIAL: write a compact 3 slide post (no flow slide, writeup 80 to 150 words)." : "",
    takenTitles.length ? `TITLES ALREADY TAKEN (do not reuse): ${takenTitles.join(" | ")}` : "",
    `\n===== SOURCE LIST (cite by id) =====\n${sourceList || "(none)"}\ngit  FOLDER FACTS git history`,
    `\n===== FOLDER FACTS (computed, cite as "git") =====\n${JSON.stringify(facts, null, 1)}`,
    `\n===== MEDIA (only these URLs may be used) =====\n${mediaList}`,
    collected.extra,
    `\n===== MATERIAL =====\n${collected.contents}`,
    "\nWrite the post now as JSON matching the schema.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- backends ----------

async function viaApi(prompt, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.RESEARCH_MODEL || "claude-sonnet-5-5",
        max_tokens: 8000,
        system: SYSTEM,
        tools: [{ name: "write_post", description: "Return the carousel post", input_schema: POST_SCHEMA }],
        tool_choice: { type: "tool", name: "write_post" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!response.ok) throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const data = await response.json();
    const block = data.content?.find((b) => b.type === "tool_use");
    if (!block) throw new Error("Anthropic API returned no tool call");
    return block.input;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

// When launched from inside Claude Code (desktop app, agents), the parent's
// CLAUDE_* and ANTHROPIC_BASE_URL vars make the child try the host's auth.
function cliEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (key.startsWith("CLAUDE") || key === "ANTHROPIC_BASE_URL") delete env[key];
  return env;
}

function viaCli(prompt, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("cancelled"));
    const child = spawn(
      "claude",
      ["-p", "--output-format", "json", "--model", process.env.RESEARCH_CLI_MODEL || "sonnet", "--json-schema", JSON.stringify(POST_SCHEMA)],
      { stdio: ["pipe", "pipe", "pipe"], env: cliEnv() },
    );
    let out = "";
    let err = "";
    let settled = false;
    let killTimer;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn(value);
    };
    // SIGTERM first, SIGKILL if the child ignores it.
    const stop = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
      killTimer.unref?.();
    };
    const onAbort = () => {
      stop();
      finish(reject, new Error("cancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => {
      stop();
      finish(reject, new Error("claude CLI timed out after 5 minutes"));
    }, TIMEOUT);
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.stdin.on("error", () => {});
    child.on("error", (error) => finish(reject, error));
    child.on("close", () => {
      clearTimeout(killTimer);
      if (settled) return;
      try {
        const result = JSON.parse(out);
        if (result.is_error) return finish(reject, new Error(String(result.result || "claude CLI error").slice(0, 300)));
        finish(resolve, result.structured_output ?? JSON.parse(result.result));
      } catch {
        finish(reject, new Error(`claude CLI returned no JSON: ${(err || out).slice(0, 300)}`));
      }
    });
    child.stdin.end(`${SYSTEM}\n\n${prompt}`);
  });
}

// ---------- validation ----------

const DASH = /\s*[\u2013\u2014]\s*/g;
export function stripDashes(value) {
  if (typeof value === "string")
    return value.replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1 to $2").replace(DASH, ", ");
  if (Array.isArray(value)) return value.map(stripDashes);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripDashes(v)]));
  return value;
}

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const strings = (v) => (Array.isArray(v) ? v.filter(isStr).map(String) : []);
const num = (v) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[,%$\s]/g, "")) : NaN);

// Join digit groups split by spaces, thin spaces or commas ("1 118", "1,118" -> "1118").
const normalize = (text) => {
  let t = String(text || "");
  for (let i = 0; i < 2; i++) t = t.replace(/(\d)[\s\u00a0\u2009\u202f,'_](?=\d{3}(?!\d))/g, "$1");
  return t;
};
const escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when the number appears in the text exactly (771 does not match 771.3). */
function appears(value, text) {
  if (!Number.isFinite(value) || !text) return false;
  const forms = new Set([String(value)]);
  if (Math.abs(value) < 1 && value !== 0) forms.add(String(value).replace(/^(-?)0\./, "$1."));
  return [...forms].some((f) => new RegExp(`(^|[^\\d.])${escapeRe(f)}(?![\\d]|\\.\\d)`).test(text));
}
const valueNumber = (v) => {
  const m = normalize(String(v)).match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

/** Valid src for a data slide: the given one, or "git" when the figures are git facts. */
function citeFor(src, numbers, ctx) {
  if (ctx.ids.has(src)) return src;
  if (ctx.ids.has("git") && numbers.length && numbers.every((n) => appears(n, ctx.text.git))) return "git";
  return null;
}

/** Repair or drop one slide. Returns the slide or null. */
function repairSlide(s, ctx) {
  if (!s || typeof s !== "object") return null;
  const out = { ...s };
  if (out.src !== undefined && !ctx.ids.has(out.src)) delete out.src;
  switch (s.type) {
    case "cover":
      if (!isStr(s.heading)) return null;
      if (out.image && !ctx.media.has(out.image)) delete out.image;
      return out;
    case "bigNumbers": {
      const all = (s.items || []).filter((i) => isStr(i?.value) && isStr(i?.label));
      const items = all
        .map((i) => {
          const n = valueNumber(i.value);
          const src = citeFor(i.src, Number.isFinite(n) ? [n] : [], ctx);
          return src ? { value: i.value, label: i.label, src } : null;
        })
        .filter(Boolean)
        .slice(0, 4);
      ctx.stats.uncited += all.length - items.length;
      if (!isStr(s.heading) || !items.length) return null;
      return { ...out, items };
    }
    case "chart": {
      const x = strings(s.x);
      if (!isStr(s.heading) || x.length < 2 || !["bar", "line", "donut", "stackedBar"].includes(s.chart)) return null;
      const series = (s.series || [])
        .filter((ser) => Array.isArray(ser?.values) && ser.values.length === x.length)
        .map((ser) => ({ name: isStr(ser.name) ? ser.name : out.heading, values: ser.values.map(num) }))
        .filter((ser) => ser.values.every(Number.isFinite));
      if (!series.length) return null;
      const kept = s.chart === "donut" ? series.slice(0, 1) : series;
      const values = kept.flatMap((ser) => ser.values);
      const src = citeFor(s.src, values, ctx);
      if (!src) {
        ctx.stats.uncited++;
        return null;
      }
      const found = values.filter((v) => appears(v, ctx.text[src])).length;
      if (found === 0) {
        ctx.stats.unverified++;
        return null;
      }
      if (found < values.length) ctx.stats.partial++;
      return { ...out, src, x, series: kept };
    }
    case "table": {
      const columns = strings(s.columns);
      const rows = (s.rows || []).filter(Array.isArray).map((r) => columns.map((_, i) => String(r[i] ?? "")));
      if (!isStr(s.heading) || columns.length < 2 || !rows.length) return null;
      const cells = rows.flat().filter((c) => /\d/.test(c)).map(valueNumber).filter(Number.isFinite);
      const src = citeFor(s.src, cells, ctx);
      if (!src && cells.length) {
        ctx.stats.uncited++;
        return null;
      }
      if (src) out.src = src;
      if (typeof out.highlight !== "number" || out.highlight < 0 || out.highlight >= rows.length) delete out.highlight;
      return { ...out, columns, rows };
    }
    case "timeline": {
      const events = (s.events || []).filter((e) => isStr(e?.date) && isStr(e?.label));
      if (!isStr(s.heading) || events.length < 2) return null;
      return { ...out, events };
    }
    case "code":
      if (!isStr(s.heading) || !isStr(s.code)) return null;
      return { ...out, lang: isStr(s.lang) ? s.lang : "text", code: s.code.split("\n").slice(0, 18).join("\n") };
    case "image":
      if (!ctx.media.has(s.image)) return null;
      if (out.fit && !["cover", "contain"].includes(out.fit)) delete out.fit;
      return out;
    case "quote":
      if (!isStr(s.text) || s.verbatim !== true || !out.src) return null;
      return out;
    case "flow": {
      const steps = (s.steps || []).filter((st) => isStr(st?.label));
      if (!isStr(s.heading) || steps.length < 2) return null;
      return { ...out, steps };
    }
    case "compare":
      if (!isStr(s.heading) || !isStr(s.left?.title) || !isStr(s.right?.title)) return null;
      return { ...out, left: { title: s.left.title, points: strings(s.left.points) }, right: { title: s.right.title, points: strings(s.right.points) } };
    case "checklist": {
      const items = (s.items || []).filter((i) => isStr(i?.text)).map((i) => ({ text: i.text, done: Boolean(i.done) }));
      if (!isStr(s.heading) || items.length < 2) return null;
      return { ...out, items };
    }
    case "takeaway":
      return isStr(s.heading) ? out : null;
    default:
      return null;
  }
}

/** Validate and repair a model post. Throws when nothing usable is left. */
export function validatePost(raw, { sources, media, hasGit, name, sourceText = {}, gitText = "", thin = false, log }) {
  if (!raw || typeof raw !== "object") throw new Error("model returned no post");
  const post = stripDashes(raw);
  const known = new Map(sources.map((s) => [s.id, s.path]));
  const ids = new Set([...known.keys(), ...(hasGit ? ["git"] : [])]);
  const text = Object.fromEntries(Object.entries({ ...sourceText, git: gitText }).map(([k, v]) => [k, normalize(v)]));
  const stats = { uncited: 0, unverified: 0, partial: 0, flowDropped: 0, imageAdded: 0 };
  const ctx = { ids, media: new Set(media), text, stats };

  let slides = (Array.isArray(post.slides) ? post.slides : []).map((s) => repairSlide(s, ctx)).filter(Boolean);
  const coverAt = slides.findIndex((s) => s.type === "cover");
  if (coverAt > 0) slides.unshift(...slides.splice(coverAt, 1));
  if (coverAt < 0) slides.unshift({ type: "cover", heading: isStr(post.hook) ? post.hook : name });
  slides = slides.filter((s, i) => s.type !== "cover" || i === 0);

  // Thin posts: a generic flow slide adds nothing when another body slide exists.
  if (thin && slides.filter((s) => !["cover", "takeaway", "flow"].includes(s.type)).length) {
    const before = slides.length;
    slides = slides.filter((s) => s.type !== "flow");
    stats.flowDropped = before - slides.length;
  }

  // Image-rich items must show an image beyond the cover.
  const coverImage = slides[0]?.image;
  const spare = media.filter((url) => url !== coverImage);
  if (media.length >= 2 && spare.length && !slides.some((s) => s.type === "image")) {
    if (slides.length >= 9) {
      const drop = slides.findLastIndex((s, i) => i > 0 && s.type !== "takeaway");
      if (drop > 0) slides.splice(drop, 1);
    }
    slides.splice(Math.min(2, slides.length), 0, { type: "image", image: spare[0], fit: "contain" });
    stats.imageAdded = 1;
  }
  slides = slides.slice(0, 9);
  if (slides.length < 2) throw new Error("post had no valid slides");

  const hook = isStr(post.hook) ? post.hook.trim() : "";
  const summary = isStr(post.summary) ? post.summary.trim() : "";
  const formulaic =
    /^(one|two|three|four|five|\d+)\s+\w+[^,]*,\s*(one|two|three|four|five|\d+)\s/i.test(hook) ||
    (summary && hook && summary.toLowerCase().startsWith(hook.toLowerCase().split(/\s+/).slice(0, 4).join(" ")));
  const warnings = [
    stats.uncited && `${stats.uncited} uncited figure(s) dropped`,
    stats.unverified && `${stats.unverified} chart(s) with no value found in source dropped`,
    stats.partial && `${stats.partial} chart(s) with some values not found in source`,
    stats.flowDropped && "flow slide dropped (thin)",
    stats.imageAdded && "image slide added",
    formulaic && "formulaic hook",
  ].filter(Boolean);
  if (warnings.length) log?.(`validator: ${warnings.join(", ")}`);

  const used = new Set(slides.flatMap((s) => [s.src, ...(s.items || []).map((i) => i?.src)]).filter(Boolean));
  const notes = new Map((Array.isArray(post.sources) ? post.sources : []).filter((s) => ids.has(s?.id)).map((s) => [s.id, s]));
  for (const id of notes.keys()) used.add(id);
  const outSources = [...used]
    .filter((id) => ids.has(id))
    .sort((a, b) => (a === "git" ? 1 : b === "git" ? -1 : Number(a.slice(1)) - Number(b.slice(1))))
    .map((id) => {
      const note = notes.get(id);
      return {
        id,
        path: id === "git" ? ".git" : known.get(id),
        ...(isStr(note?.lines) ? { lines: note.lines } : {}),
        ...(isStr(note?.note) ? { note: note.note } : {}),
      };
    });

  const title = isStr(post.title) ? post.title.trim() : name;
  return {
    title,
    kind: isStr(post.kind) ? post.kind.trim() : "Experiment",
    topic: TOPICS.includes(post.topic) ? post.topic : "Other",
    status: STATUSES.includes(post.status) ? post.status : "prototype",
    hook: isStr(post.hook) ? post.hook.trim() : title,
    summary: isStr(post.summary) ? post.summary.trim() : "",
    writeup: isStr(post.writeup) ? post.writeup.trim() : "",
    tags: strings(post.tags).map((t) => t.toLowerCase().replace(/^#/, "").trim()).slice(0, 6),
    accent: /^#[0-9a-f]{6}$/i.test(post.accent || "") ? post.accent : "#83d63a",
    sources: outSources,
    slides,
  };
}

/** Ask Claude for a post (API when ANTHROPIC_API_KEY is set, else the local CLI), validated. One retry. */
export async function generatePost(prompt, context) {
  const call = process.env.ANTHROPIC_API_KEY ? viaApi : viaCli;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (context.signal?.aborted) throw new Error("cancelled");
      return validatePost(await call(prompt, context.signal), context);
    } catch (error) {
      lastError = error;
      if (context.signal?.aborted) break;
    }
  }
  throw lastError;
}
