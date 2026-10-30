// Collector: walk a research folder (or one file), read every format it can,
// and build a numbered, citable material block for the model plus FolderMeta.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

export const run = promisify(execFile);

export const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "target", ".vercel",
  ".turbo", "coverage", "venv", ".venv", "__pycache__", ".research-cache", ".cache",
]);
export const DOC_EXT = new Set([".md", ".mdx", ".txt", ".rst", ".org", ".tex"]);
export const DATA_EXT = new Set([".json", ".jsonl", ".ndjson", ".csv", ".tsv"]);
export const CONFIG_EXT = new Set([".yaml", ".yml", ".toml", ".cff"]);
export const MARKUP_EXT = new Set([".html", ".htm"]);
export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const LANGS = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript",
  ".mjs": "JavaScript", ".cjs": "JavaScript", ".py": "Python", ".rs": "Rust", ".go": "Go",
  ".swift": "Swift", ".kt": "Kotlin", ".java": "Java", ".rb": "Ruby", ".c": "C", ".h": "C",
  ".cpp": "C++", ".cc": "C++", ".hpp": "C++", ".cs": "C#", ".css": "CSS", ".scss": "CSS",
  ".html": "HTML", ".htm": "HTML", ".sh": "Shell", ".sql": "SQL", ".ipynb": "Jupyter",
  ".wgsl": "WGSL", ".glsl": "GLSL", ".lua": "Lua", ".zig": "Zig", ".dart": "Dart",
  ".vue": "Vue", ".svelte": "Svelte", ".php": "PHP", ".m": "Objective-C", ".r": "R", ".jl": "Julia",
};
const CODE_EXT = new Set(Object.keys(LANGS).filter((ext) => !MARKUP_EXT.has(ext)));

export const BUDGET = 45000;
const MAX_FILES = 6000;

/** Recursively list files with size and mtime. */
export async function walk(root, dir = root, depth = 0, out = []) {
  if (depth > 7 || out.length >= MAX_FILES) return out;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) break;
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(root, full, depth + 1, out);
    } else if (entry.isFile()) {
      const stat = await fs.stat(full).catch(() => null);
      if (stat) out.push({ rel: path.relative(root, full), full, size: stat.size, mtime: stat.mtimeMs });
    }
  }
  return out;
}

/** List the files of a target: a folder walk, or the single file itself. */
export async function listFiles(target) {
  // walk() already skips symlinks (Dirent reflects lstat); refuse a symlinked target too.
  const link = await fs.lstat(target);
  if (link.isSymbolicLink()) throw new Error("symlinked targets are not followed");
  const stat = await fs.stat(target);
  if (stat.isDirectory()) return { root: target, isDir: true, files: await walk(target) };
  return {
    root: path.dirname(target),
    isDir: false,
    files: [{ rel: path.basename(target), full: target, size: stat.size, mtime: stat.mtimeMs }],
  };
}

const ext = (rel) => path.extname(rel).toLowerCase();
const isLock = (rel) => /(^|\/)([^/]*lock[^/]*|[^/]*\.min\.[a-z]+|[^/]*\.map|[^/]*tsbuildinfo)$/i.test(rel);

export function isReadable(rel) {
  const e = ext(rel);
  if (isLock(rel)) return false;
  return DOC_EXT.has(e) || DATA_EXT.has(e) || MARKUP_EXT.has(e) || CODE_EXT.has(e) || CONFIG_EXT.has(e) || e === ".pdf";
}

/** Lower is read first. */
function rank(rel) {
  const base = path.basename(rel).toLowerCase();
  const e = ext(base);
  const depth = rel.split(path.sep).length - 1;
  if (base.startsWith("readme")) return depth * 3;
  if (/^(bench|benchmark|results?|analysis|findings|report|summary|changelog|notes|brief|paper|storyboard)/.test(base)) return 5 + depth;
  if (/(^|\/)(docs?|bench|benchmarks?|results?|analysis|reports?)\//i.test(rel) && (DOC_EXT.has(e) || e === ".pdf")) return 8 + depth;
  if (DOC_EXT.has(e) || e === ".pdf") return 12 + depth * 2;
  if (DATA_EXT.has(e)) return 18 + depth * 2;
  if (["package.json", "pyproject.toml", "cargo.toml", "package.swift"].includes(base)) return 22;
  if (base === "claude.md" || base === "agents.md") return 26 + depth;
  if (e === ".ipynb") return 20 + depth;
  if (MARKUP_EXT.has(e)) return 34 + depth;
  if (CONFIG_EXT.has(e)) return 40 + depth;
  return 50 + depth * 2;
}

// ---------- readers ----------

async function readText(file, size) {
  if (size > 4 << 20) return "";
  const text = await fs.readFile(file, "utf8").catch(() => "");
  return text.includes("\u0000") ? "" : text;
}

async function readPdf(file) {
  try {
    const { stdout } = await run("pdftotext", ["-l", "8", "-layout", file, "-"], { maxBuffer: 16 << 20 });
    return stdout.replace(/[ \t]{3,}/g, "  ").replace(/\n{3,}/g, "\n\n");
  } catch {
    return "";
  }
}

const stripHtml = (html) =>
  html
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

function readNotebook(text) {
  try {
    const nb = JSON.parse(text);
    return nb.cells
      .map((cell) => {
        const src = [].concat(cell.source).join("");
        const outputs = (cell.outputs || [])
          .map((o) => [].concat(o.text || o.data?.["text/plain"] || []).join(""))
          .join("\n")
          .slice(0, 600);
        return `[${cell.cell_type}]\n${src}${outputs ? `\n[output]\n${outputs}` : ""}`;
      })
      .join("\n\n");
  } catch {
    return text;
  }
}

// ---------- data summaries ----------

function parseDelimited(text, delim) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      if (rows.length > 200000) break;
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : Math.abs(n) >= 100 ? n.toFixed(1) : n.toPrecision(4).replace(/\.?0+$/, ""));
const asNumber = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Summarize rows of objects: count, columns + types, numeric stats, top categories, samples. */
function summarizeRows(objects, columns) {
  const lines = [`rows: ${objects.length}`, `columns (${columns.length}):`];
  for (const col of columns.slice(0, 40)) {
    const values = objects.map((o) => o[col]).filter((v) => v !== undefined && v !== null && v !== "");
    const nums = values.map(asNumber).filter((n) => n !== null);
    if (values.length && nums.length >= values.length * 0.9) {
      const sum = nums.reduce((a, b) => a + b, 0);
      lines.push(`  ${col}: number, min ${fmt(Math.min(...nums))}, max ${fmt(Math.max(...nums))}, mean ${fmt(sum / nums.length)}, sum ${fmt(sum)}`);
    } else if (values.length && values.every((v) => typeof v === "boolean")) {
      lines.push(`  ${col}: boolean, true ${values.filter(Boolean).length} of ${values.length}`);
    } else if (values.length && values.every((v) => typeof v === "object")) {
      const lens = values.filter(Array.isArray).map((v) => v.length);
      lines.push(`  ${col}: ${lens.length ? `array (len ${Math.min(...lens)} to ${Math.max(...lens)})` : "object"}`);
    } else {
      const counts = new Map();
      for (const v of values) {
        const key = String(v).slice(0, 60);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
      const distinct = counts.size;
      lines.push(
        `  ${col}: text, ${distinct} distinct${distinct < values.length ? `, top: ${top.map(([k, n]) => `${k} (${n})`).join(", ")}` : ""}`,
      );
    }
  }
  lines.push("sample rows:");
  for (const o of objects.slice(0, 5)) {
    const short = Object.fromEntries(
      columns.slice(0, 14).map((c) => {
        const v = o[c];
        return [c, typeof v === "string" ? v.slice(0, 80) : typeof v === "object" && v ? JSON.stringify(v).slice(0, 80) : v];
      }),
    );
    lines.push(`  ${JSON.stringify(short)}`);
  }
  return lines.join("\n");
}

function delimitedSummary(text, delim) {
  const rows = parseDelimited(text, delim);
  if (rows.length < 2) return text.slice(0, 1500);
  const columns = rows[0].map((c, i) => c.trim() || `col${i + 1}`);
  const objects = rows.slice(1).map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
  return summarizeRows(objects, columns);
}

function columnsOf(objects) {
  const cols = new Map();
  for (const o of objects.slice(0, 500))
    for (const key of Object.keys(o)) cols.set(key, (cols.get(key) || 0) + 1);
  return [...cols.keys()];
}

/** Key structure of a JSON value, with array lengths and numeric leaves. */
function jsonStructure(value) {
  const lines = [];
  const numeric = [];
  const visit = (v, at, depth) => {
    if (lines.length > 80) return;
    const pad = "  ".repeat(depth);
    if (Array.isArray(v)) {
      const objs = v.filter((x) => x && typeof x === "object" && !Array.isArray(x));
      if (objs.length && objs.length >= v.length * 0.8) {
        const cols = columnsOf(objs);
        lines.push(`${pad}${at}: array[${v.length}] of objects {${cols.slice(0, 16).join(", ")}${cols.length > 16 ? ", ..." : ""}}`);
        if (depth < 3 && v.length >= 3) {
          const summary = summarizeRows(objs, cols).split("\n").slice(0, 26);
          lines.push(...summary.map((l) => `${pad}  | ${l}`));
        }
      } else {
        const nums = v.map(asNumber).filter((n) => n !== null);
        if (nums.length === v.length && nums.length) {
          lines.push(`${pad}${at}: array[${v.length}] of numbers, min ${fmt(Math.min(...nums))}, max ${fmt(Math.max(...nums))}${v.length <= 24 ? `, values [${nums.map(fmt).join(", ")}]` : ""}`);
        } else lines.push(`${pad}${at}: array[${v.length}]${v.length ? ` e.g. ${JSON.stringify(v.slice(0, 3)).slice(0, 160)}` : ""}`);
      }
    } else if (v && typeof v === "object") {
      const keys = Object.keys(v);
      lines.push(`${pad}${at}: object {${keys.length} keys}`);
      if (depth < 4) for (const key of keys.slice(0, 30)) visit(v[key], key, depth + 1);
    } else if (typeof v === "number") {
      numeric.push(`${at}=${fmt(v)}`);
      lines.push(`${pad}${at}: ${fmt(v)}`);
    } else if (typeof v === "string") {
      lines.push(`${pad}${at}: "${v.slice(0, 100)}${v.length > 100 ? "..." : ""}"`);
    } else lines.push(`${pad}${at}: ${String(v)}`);
  };
  visit(value, "(root)", 0);
  return lines.join("\n");
}

function jsonSummary(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return text.slice(0, 1500);
  }
  if (Array.isArray(value) && value.length && value.every((x) => x && typeof x === "object" && !Array.isArray(x)))
    return summarizeRows(value, columnsOf(value));
  return jsonStructure(value);
}

function jsonlSummary(text) {
  const objects = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line);
      if (v && typeof v === "object") objects.push(v);
    } catch {}
    if (objects.length >= 100000) break;
  }
  return objects.length ? summarizeRows(objects, columnsOf(objects)) : text.slice(0, 1500);
}

// ---------- extraction from prose ----------

/** Markdown pipe tables as structured rows. */
function extractTables(text, rel) {
  const tables = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i]) || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim().replace(/\*\*/g, ""));
    const columns = cells(lines[i]);
    const rows = [];
    let j = i + 2;
    while (j < lines.length && /^\s*\|/.test(lines[j])) rows.push(cells(lines[j++]));
    if (rows.length) tables.push({ at: `${rel}:${i + 1}`, columns, rows });
    i = j;
  }
  return tables;
}

const UNIT = String.raw`(?:%|ms|µs|us|ns|s|sec|seconds?|min|minutes?|h|hrs?|hours?|days?|weeks?|x|×|fps|FPS|Hz|kHz|MHz|GHz|KB|MB|GB|TB|kb|mb|gb|B|bytes|tokens?|k|K|M|B|req\/s|rps|ops\/s|px|pts?|points?|lines|LOC|files|commits|users|steps|nodes|edges|topics|rows|params|parameters|layers|frames|samples|iterations|epochs|agents|tasks|tests|\$|USD|°C|km|m|kg|W|kW|MW|GW|AU)`;
const NUM_RE = new RegExp(String.raw`(?:\$\s?)?\b\d[\d,]*(?:\.\d+)?\s?${UNIT}(?![a-zA-Z])`, "g");

function extractNumbers(text, rel) {
  const found = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && found.length < 30; i++) {
    const line = lines[i];
    if (line.length > 400 || /^\s*\|?\s*:?-{2,}/.test(line)) continue;
    const hits = line.match(NUM_RE);
    if (!hits) continue;
    const real = hits.filter((h) => !/^\d{1,2}\s?(?:m|s|h|B|k|K|M)$/.test(h.trim()) || /\d{2,}/.test(h));
    if (!real.length) continue;
    found.push(`${rel}:${i + 1}: ${line.trim().replace(/\s+/g, " ").slice(0, 200)}`);
  }
  return found;
}

// ---------- folder meta ----------

const KNOWN_STACK = {
  next: "Next.js", react: "React", vue: "Vue", svelte: "Svelte", "@sveltejs/kit": "SvelteKit", vite: "Vite",
  three: "Three.js", "@react-three/fiber": "React Three Fiber", d3: "D3", remotion: "Remotion",
  express: "Express", fastify: "Fastify", hono: "Hono", electron: "Electron", "@tauri-apps/api": "Tauri",
  tailwindcss: "Tailwind CSS", "@anthropic-ai/sdk": "Anthropic SDK", "@anthropic-ai/claude-agent-sdk": "Claude Agent SDK",
  openai: "OpenAI SDK", ai: "AI SDK", "drizzle-orm": "Drizzle", prisma: "Prisma", "@prisma/client": "Prisma",
  recharts: "Recharts", "pixi.js": "PixiJS", phaser: "Phaser", "matter-js": "Matter.js", gsap: "GSAP",
  "@hyperframes/core": "HyperFrames", hyperframes: "HyperFrames", playwright: "Playwright", "@playwright/test": "Playwright",
  vitest: "Vitest", jest: "Jest", typescript: "TypeScript", "@modelcontextprotocol/sdk": "MCP SDK", zod: "Zod",
  wrangler: "Cloudflare Workers", "socket.io": "Socket.IO", "@clerk/nextjs": "Clerk", stripe: "Stripe", bun: "Bun",
  fastapi: "FastAPI", flask: "Flask", django: "Django", torch: "PyTorch", tensorflow: "TensorFlow", jax: "JAX",
  numpy: "NumPy", pandas: "pandas", scipy: "SciPy", matplotlib: "Matplotlib", anthropic: "Anthropic SDK",
  transformers: "Transformers", streamlit: "Streamlit", pydantic: "Pydantic", langchain: "LangChain",
  bevy: "Bevy", tokio: "Tokio", wgpu: "wgpu", axum: "Axum", serde: "Serde", makepad: "Makepad",
};

async function detectStack(root, files) {
  const stack = [];
  const add = (name) => name && !stack.includes(name) && stack.push(name);
  const top = files.filter((f) => f.rel.split(path.sep).length <= 2);
  for (const f of top) {
    const base = path.basename(f.rel).toLowerCase();
    try {
      if (base === "package.json") {
        const pkg = JSON.parse(await fs.readFile(f.full, "utf8"));
        add("Node.js");
        for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) add(KNOWN_STACK[dep]);
      } else if (base === "cargo.toml") {
        add("Rust");
        const text = await fs.readFile(f.full, "utf8");
        for (const m of text.matchAll(/^([a-z0-9_-]+)\s*=/gim)) add(KNOWN_STACK[m[1].toLowerCase()]);
      } else if (base === "pyproject.toml" || base === "requirements.txt") {
        add("Python");
        const text = await fs.readFile(f.full, "utf8");
        for (const m of text.matchAll(/["'\n^]\s*([A-Za-z0-9_.-]+)\s*(?:[<>=~!\[;"']|$)/gm)) add(KNOWN_STACK[m[1].toLowerCase()]);
      } else if (base === "package.swift") add("Swift Package");
      else if (base === "go.mod") add("Go");
      else if (base === "hyperframes.json") add("HyperFrames");
    } catch {}
  }
  if (files.some((f) => f.rel.endsWith(".xcodeproj") || /\.xcodeproj\//.test(f.rel))) add("Xcode");
  return stack.slice(0, 10);
}

function weekOf(iso) {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/** Git facts for a folder: its own repo, or its slice of a parent repo. */
export async function gitMeta(target, isDir) {
  if (!isDir) return undefined;
  let top;
  try {
    top = (await run("git", ["-C", target, "rev-parse", "--show-toplevel"])).stdout.trim();
  } catch {
    return undefined;
  }
  const real = await fs.realpath(target).catch(() => target);
  const args = ["-C", top, "log", "--no-merges", "--format=%aI%x09%ae%x09%s"];
  if (path.resolve(top) !== path.resolve(real)) args.push("--", path.relative(top, real) || ".");
  let out;
  try {
    out = (await run("git", args, { maxBuffer: 32 << 20 })).stdout;
  } catch {
    return undefined;
  }
  const commits = out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [date, email, ...rest] = line.split("\t");
      return { date, email, subject: rest.join("\t") };
    })
    .reverse();
  if (!commits.length) return undefined;
  const weeks = new Map();
  for (const c of commits) weeks.set(weekOf(c.date), (weeks.get(weekOf(c.date)) || 0) + 1);
  // Every week from the first to the last commit, zeros included, so gaps stay visible.
  const activity = [];
  const lastWeek = weekOf(commits.at(-1).date);
  for (let d = new Date(`${weekOf(commits[0].date)}T00:00:00Z`); ; d.setUTCDate(d.getUTCDate() + 7)) {
    const week = d.toISOString().slice(0, 10);
    activity.push({ week, commits: weeks.get(week) || 0 });
    if (week >= lastWeek) break;
  }
  activity.splice(0, Math.max(0, activity.length - 26));

  const score = (s) => (/\b(feat|add|adds|added|ship|ships|shipped|release|launch|launched|initial|v\d)/i.test(s) ? 2 : 0) - (/\b(fix|typo|wip|merge|chore|bump|lint|format)\b/i.test(s) ? 1 : 0);
  const picks = new Set([0, commits.length - 1]);
  const buckets = 8;
  const t0 = new Date(commits[0].date).getTime();
  const t1 = new Date(commits.at(-1).date).getTime();
  const span = Math.max(1, t1 - t0);
  for (let b = 0; b < buckets && picks.size < 8; b++) {
    const inBucket = commits
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => {
        const t = (new Date(c.date).getTime() - t0) / span;
        return t >= b / buckets && (t < (b + 1) / buckets || b === buckets - 1);
      })
      .filter(({ i }) => !picks.has(i));
    if (!inBucket.length) continue;
    inBucket.sort((a, b2) => score(b2.c.subject) - score(a.c.subject));
    picks.add(inBucket[0].i);
  }
  const milestones = [...picks]
    .sort((a, b) => a - b)
    .slice(0, 8)
    .map((i) => ({ date: commits[i].date.slice(0, 10), subject: commits[i].subject.replace(/\s*[\u2013\u2014]\s*/g, ", ").slice(0, 120) }));
  return {
    commits: commits.length,
    authors: new Set(commits.map((c) => c.email)).size,
    first: new Date(commits[0].date).toISOString(),
    last: new Date(commits.at(-1).date).toISOString(),
    activity,
    milestones,
  };
}

export async function folderMeta(target, listing) {
  const { root, isDir, files } = listing;
  const langBytes = new Map();
  const formats = new Map();
  let bytes = 0;
  for (const f of files) {
    bytes += f.size;
    const e = ext(f.rel) || "(none)";
    formats.set(e, (formats.get(e) || 0) + 1);
    const lang = LANGS[e];
    if (lang && !isLock(f.rel)) langBytes.set(lang, (langBytes.get(lang) || 0) + f.size);
  }
  const langTotal = [...langBytes.values()].reduce((a, b) => a + b, 0) || 1;
  return {
    fileCount: files.length,
    bytes,
    languages: [...langBytes.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, b]) => ({ name, share: Math.round((b / langTotal) * 1000) / 1000 })),
    stack: isDir ? await detectStack(root, files) : [],
    git: await gitMeta(target, isDir),
    formats: [...formats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([e, count]) => ({ ext: e, count })),
  };
}

// ---------- material ----------

/** Read one file into model-ready text. Data files become structured summaries. */
async function extract(file) {
  const e = ext(file.rel);
  if (e === ".pdf") return { text: await readPdf(file.full), kind: "pdf" };
  const raw = await readText(file.full, file.size);
  if (!raw.trim()) return { text: "", kind: "empty" };
  if (e === ".csv" || e === ".tsv") return { text: delimitedSummary(raw, e === ".tsv" ? "\t" : ","), kind: "data" };
  if (e === ".jsonl" || e === ".ndjson") return { text: jsonlSummary(raw), kind: "data" };
  if (e === ".json") return { text: jsonSummary(raw), kind: "data" };
  if (e === ".ipynb") return { text: readNotebook(raw), kind: "notebook" };
  if (MARKUP_EXT.has(e)) return { text: stripHtml(raw), kind: "doc", raw };
  if (DOC_EXT.has(e)) return { text: raw, kind: "doc" };
  return { text: raw, kind: "code" };
}

function capFor(kind, index) {
  if (kind === "doc" || kind === "pdf") return index === 0 ? 9000 : index < 4 ? 4500 : 2500;
  if (kind === "data") return 3200;
  if (kind === "notebook") return 4000;
  return 1600;
}

/**
 * Collect a folder or file: returns material text with a numbered source list,
 * the files used (with source ids), and the extracted tables / numbers.
 */
export async function collect(target, listing) {
  listing ??= await listFiles(target);
  const { files } = listing;
  const readable = files
    .filter((f) => isReadable(f.rel))
    .filter((f) => !(ext(f.rel) === ".json" && /(^|\/)(tsconfig|jsconfig|\.eslintrc|components|manifest\.webmanifest)[^/]*$/i.test(f.rel)))
    .sort((a, b) => rank(a.rel) - rank(b.rel) || a.rel.localeCompare(b.rel));

  const sources = [];
  const tables = [];
  const numbers = [];
  const chunks = [];
  const sourceText = {};
  let used = 0;
  let codeCount = 0;
  const reserve = 7000; // for tables + numbers sections
  for (const file of readable) {
    if (used >= BUDGET - reserve) break;
    const isCode = CODE_EXT.has(ext(file.rel)) && ext(file.rel) !== ".ipynb";
    if (isCode && ++codeCount > 12) continue;
    const { text, kind } = await extract(file).catch(() => ({ text: "", kind: "empty" }));
    const clean = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
    if (clean.length < 20) continue;
    const id = `s${sources.length + 1}`;
    if (kind === "doc" || kind === "pdf" || kind === "notebook") {
      tables.push(...extractTables(clean, id).map((t) => ({ ...t, src: id })));
      numbers.push(...extractNumbers(clean, id));
    }
    const cap = Math.min(capFor(kind, sources.length), BUDGET - reserve - used);
    const body = clean.length > cap ? `${clean.slice(0, cap)}\n[... truncated, ${clean.length} chars total]` : clean;
    sources.push({ id, path: file.rel, kind });
    sourceText[id] = clean.slice(0, 400_000);
    chunks.push(`===== [${id}] ${file.rel} (${kind}${kind === "data" ? " summary" : ""}) =====\n${body}`);
    used += body.length + 60;
  }

  let extra = "";
  if (tables.length) {
    extra += "\n\n===== TABLES found in docs (structured) =====\n";
    for (const t of tables.slice(0, 10)) {
      const piece = `[${t.at}] columns: ${JSON.stringify(t.columns)}\n${t.rows.slice(0, 14).map((r) => `  ${JSON.stringify(r)}`).join("\n")}\n`;
      if (extra.length + piece.length > 4500) break;
      extra += piece;
    }
  }
  if (numbers.length) {
    extra += "\n===== NUMBERS with units (source:line) =====\n";
    for (const n of numbers.slice(0, 40)) {
      if (extra.length > reserve - 200) break;
      extra += `${n}\n`;
    }
  }
  return {
    sources,
    files: sources.map((s) => s.path),
    contents: chunks.join("\n\n"),
    sourceText,
    extra,
    chars: chunks.reduce((a, c) => a + c.length, 0),
  };
}
