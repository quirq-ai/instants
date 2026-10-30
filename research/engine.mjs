// Instants engine: scan roots, collect material, generate posts with Claude,
// copy media, and write ResearchRecord JSON into the content store (store.mjs).
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { collect, folderMeta, isReadable, IMAGE_EXT, listFiles, walk } from "./collect.mjs";
import { copyMedia, pickMedia } from "./media.mjs";
import { buildPrompt, generatePost, PROMPT_VERSION } from "./generate.mjs";
import { ensureStore, mediaDir, postsDir, sourcesDir, storeDir } from "./store.mjs";

// Bundled by Next, import.meta.dirname is undefined; the server runs from the app root.
const APP_ROOT = import.meta.dirname ? path.resolve(import.meta.dirname, "..") : process.cwd();
export const CACHE_DIR = path.join(APP_ROOT, ".research-cache");
const SOURCES_FILE = path.join(CACHE_DIR, "sources.json");

// INSTANTS_ROOTS (or the older RECALL_ROOTS, colon separated) overrides the default: the folder this app lives in.
export const DEFAULT_ROOTS = (process.env.INSTANTS_ROOTS ?? process.env.RECALL_ROOTS)
  ? (process.env.INSTANTS_ROOTS ?? process.env.RECALL_ROOTS).split(":").filter(Boolean).map((root) => path.resolve(root))
  : [path.dirname(APP_ROOT)];

const LOOSE_FILE = /\.(pdf|md|txt|html|csv|json)$/i;
const THIN = 1500;
// Below this much text (and with fewer than 2 images) a folder is too small to post.
const MIN_CHARS = 400;
const ROOT_DOC = /^(readme|index|contents|toc)\.(md|txt|html)$/i;

export const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, (m) => (m.length <= 5 ? "" : m))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "post";

async function readRecords() {
  await ensureStore();
  const POSTS_DIR = postsDir();
  const files = await fs.readdir(POSTS_DIR).catch(() => []);
  const records = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map((f) => fs.readFile(path.join(POSTS_DIR, f), "utf8").then(JSON.parse).catch(() => null)),
  );
  return records.filter(Boolean);
}

/**
 * Pick a slug for a path: reuse its record's slug, else a free one. Synchronous
 * and recorded in `reserved` so concurrent workers never pick the same slug.
 */
/** "sources/<name>" when target is a direct child of the store's sources folder, else null. */
function storeSourceRel(target) {
  return path.dirname(path.resolve(target)) === path.resolve(sourcesDir()) ? `sources/${path.basename(target)}` : null;
}

/** The record already made from this target (by path, or by store source folder). */
function recordFor(target, records) {
  const rel = storeSourceRel(target);
  return records.find((r) => r.path === target || (rel && r.sourceDir === rel));
}

function slugFor(target, records, reserved) {
  const existing = recordFor(target, records);
  if (existing) {
    reserved.add(existing.slug);
    return existing.slug;
  }
  const base = slugify(path.basename(target));
  const taken = new Set([...records.map((r) => r.slug), ...reserved]);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  reserved.add(slug);
  return slug;
}

const titleCase = (name) =>
  name
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

/** Give a title that collides with another post's a qualifier from the folder name. */
function uniqueTitle(title, name, slug, records) {
  const taken = new Set(records.filter((r) => r.slug !== slug).map((r) => r.post.title.toLowerCase()));
  if (!taken.has(title.toLowerCase())) return title;
  const fromFolder = titleCase(name);
  if (fromFolder && !taken.has(fromFolder.toLowerCase())) return fromFolder;
  return `${title} (${fromFolder || slug})`;
}

/** True when `child` is inside `parent` (after resolving both). */
function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

const abortError = (signal) => (signal?.reason instanceof Error ? signal.reason : new Error("cancelled"));

async function newestMtime(target) {
  const stat = await fs.stat(target);
  if (!stat.isDirectory()) return { mtime: stat.mtimeMs, readable: isReadable(target) ? 1 : 0 };
  const files = await walk(target);
  return {
    mtime: files.reduce((m, f) => Math.max(m, f.mtime), 0),
    readable: files.filter((f) => isReadable(f.rel) || IMAGE_EXT.has(path.extname(f.rel).toLowerCase())).length,
  };
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2));
  await fs.rename(temp, file);
}

/** List each root's direct children and compare them with existing records. */
export async function scanRoots(roots = DEFAULT_ROOTS) {
  const records = await readRecords();
  const byPath = new Map(records.map((r) => [r.path, r]));
  const status = [];
  for (const root of roots) {
    const entry = { root, folders: [], scannedAt: new Date().toISOString() };
    const children = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(root, child.name);
      if (child.name.startsWith(".") || child.name === "archive" || full === APP_ROOT) continue;
      if (!child.isDirectory() && !(child.isFile() && LOOSE_FILE.test(child.name))) continue;
      // A root-level README or index describes the root itself, not one piece of research.
      if (child.isFile() && ROOT_DOC.test(child.name)) continue;
      const record = byPath.get(full);
      try {
        const { mtime, readable } = await newestMtime(full);
        if (!readable) {
          entry.folders.push({ name: child.name, path: full, state: "skipped", reason: "nothing readable" });
          continue;
        }
        const state = !record ? "new" : mtime <= new Date(record.generatedAt).getTime() ? "posted" : "changed";
        entry.folders.push({ name: child.name, path: full, state, ...(record ? { slug: record.slug } : {}) });
      } catch (error) {
        entry.folders.push({ name: child.name, path: full, state: "failed", reason: String(error.message || error) });
      }
    }
    status.push(entry);
  }
  await writeJson(SOURCES_FILE, status);
  return status;
}

/** scanRoots, reusing the saved scan when it is younger than maxAgeMs. */
export async function cachedScan({ maxAgeMs = 30_000 } = {}) {
  if (maxAgeMs > 0) {
    const stat = await fs.stat(SOURCES_FILE).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs < maxAgeMs) {
      const saved = await fs.readFile(SOURCES_FILE, "utf8").then(JSON.parse).catch(() => null);
      if (Array.isArray(saved)) return saved;
    }
  }
  return scanRoots();
}

/**
 * Resolve a requested target to its real path and accept it only when it is a
 * direct child of a watched root (what scanRoots lists), not the app itself,
 * and not a symlink pointing elsewhere. Returns the path or null.
 */
export async function resolveWatchedTarget(target) {
  if (typeof target !== "string" || !target) return null;
  const resolved = path.resolve(target);
  const real = await fs.realpath(resolved).catch(() => null);
  if (!real || real !== resolved) return null;
  // Store sources (uploads and sources arriving from a space) are upload-style targets.
  const srcReal = await fs.realpath(sourcesDir()).catch(() => null);
  if (srcReal && path.dirname(real) === srcReal) {
    const stat = await fs.lstat(real).catch(() => null);
    return stat?.isDirectory() && !path.basename(real).startsWith(".") ? real : null;
  }
  const appReal = await fs.realpath(APP_ROOT).catch(() => APP_ROOT);
  if (real === appReal || isInside(appReal, real)) return null;
  for (const root of DEFAULT_ROOTS) {
    const rootReal = await fs.realpath(root).catch(() => null);
    if (!rootReal || path.dirname(real) !== rootReal) continue;
    const name = path.basename(real);
    if (name.startsWith(".") || name === "archive") return null;
    const stat = await fs.lstat(real).catch(() => null);
    if (!stat || stat.isSymbolicLink()) return null;
    if (stat.isDirectory() || (stat.isFile() && LOOSE_FILE.test(name))) return real;
  }
  return null;
}

/** After a run, patch the saved scan so the UI sees new states without a rescan. */
async function patchSources(results) {
  const status = await fs.readFile(SOURCES_FILE, "utf8").then(JSON.parse).catch(() => null);
  if (!Array.isArray(status)) return;
  for (const root of status)
    for (const folder of root.folders) {
      const result = results.get(folder.path);
      if (!result) continue;
      Object.assign(folder, result);
      if (result.state !== "failed" && result.state !== "skipped") delete folder.reason;
    }
  await writeJson(SOURCES_FILE, status);
}

/** Collect, generate (or reuse cache), copy media, and write one record. */
async function processTarget(target, { force, emit, records, reserved, signal }) {
  const name = path.basename(target);
  const sourceRel = storeSourceRel(target);
  const isUpload = Boolean(sourceRel);
  // Reserve the slug before the first await so parallel workers cannot collide.
  const slug = slugFor(target, records, reserved);
  emit({ type: "stage", name, stage: "collecting" });
  const listing = await listFiles(target);
  const [collected, meta, media] = await Promise.all([
    collect(target, listing),
    folderMeta(target, listing),
    pickMedia(listing, slug),
  ]);
  if (collected.chars < 80 && !media.length) {
    emit({ type: "stage", name, stage: "skipped", detail: "nothing readable" });
    return { skipped: true, reason: "nothing readable" };
  }
  if (!isUpload && collected.chars < MIN_CHARS && media.length < 2) {
    emit({ type: "stage", name, stage: "skipped", detail: "too little material" });
    return { skipped: true, reason: "too little material" };
  }
  if (isUpload) meta.git = undefined;

  const hash = createHash("sha256")
    .update(PROMPT_VERSION)
    .update(collected.contents)
    .update(collected.extra)
    .update(media.map((m) => m.original).join("|"))
    .digest("hex")
    .slice(0, 16);
  const cached = records.find((r) => r.slug === slug);
  if (!force && cached && cached.hash === hash && recordFor(target, [cached])) {
    emit({ type: "stage", name, stage: "cached" });
    return { slug };
  }

  const thin = collected.chars < THIN;
  emit({
    type: "stage",
    name,
    stage: "writing",
    detail: `${collected.sources.length} sources, ${media.length} images${thin ? ", thin" : ""}`,
  });
  const displayName = isUpload ? await uploadTitle(target, name) : name;
  const takenTitles = records.filter((r) => r.slug !== slug).map((r) => r.post.title);
  const prompt = buildPrompt({ name: displayName, meta, collected, media, thin, takenTitles });
  if (signal?.aborted) throw abortError(signal);
  const post = await generatePost(prompt, {
    sources: collected.sources,
    sourceText: collected.sourceText,
    gitText: meta.git
      ? JSON.stringify({ ...meta.git, files: meta.fileCount, bytes: meta.bytes, stack: meta.stack.length })
      : "",
    media: media.map((m) => m.url),
    hasGit: Boolean(meta.git),
    name: displayName,
    thin,
    signal,
    log: (detail) => emit({ type: "stage", name, stage: "writing", detail }),
  });
  post.title = uniqueTitle(post.title, isUpload ? displayName : name, slug, records);
  if (signal?.aborted) throw abortError(signal);

  emit({ type: "stage", name, stage: "rendering", detail: `${media.length} images` });
  const copied = await copyMedia(mediaDir(), slug, media);
  const ok = new Set(copied);
  post.slides = post.slides.filter((s) => s.type !== "image" || ok.has(s.image));
  if (post.slides[0]?.image && !ok.has(post.slides[0].image)) delete post.slides[0].image;

  const newest = listing.files.reduce((m, f) => Math.max(m, f.mtime), 0);
  const record = {
    slug,
    hash,
    name: displayName,
    path: target,
    origin: isUpload ? "upload" : "folder",
    ...(sourceRel ? { sourceDir: sourceRel } : {}),
    files: collected.files,
    media: copied,
    occurredAt: meta.git?.last || new Date(newest || Date.now()).toISOString(),
    generatedAt: new Date().toISOString(),
    meta,
    post,
  };
  await writeJson(path.join(postsDir(), `${slug}.json`), record);
  return { slug, record };
}

async function uploadTitle(folder, fallback) {
  const meta = await fs.readFile(path.join(folder, ".upload.json"), "utf8").then(JSON.parse).catch(() => null);
  return meta?.title || fallback;
}

/** Generate posts for absolute paths, streaming GenerateEvent objects through onEvent. */
export async function runGeneration({ targets, force = false, concurrency = 3, onEvent, signal } = {}) {
  const emit = (event) => {
    try {
      onEvent?.(event);
    } catch {}
  };
  const list = [...new Set((targets || []).map((t) => path.resolve(t)))];
  emit({ type: "start", total: list.length });
  const records = await readRecords();
  const reserved = new Set();
  const results = new Map();
  let posts = 0;
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      if (signal?.aborted) break;
      const target = list[next++];
      const name = path.basename(target);
      try {
        const result = await processTarget(target, { force, emit, records, reserved, signal });
        if (result.skipped) {
          results.set(target, { state: "skipped", reason: result.reason });
          continue;
        }
        if (result.record) {
          const i = records.findIndex((r) => r.slug === result.slug);
          if (i >= 0) records[i] = result.record;
          else records.push(result.record);
        }
        posts++;
        results.set(target, { state: "posted", slug: result.slug });
        emit({ type: "done", name, slug: result.slug });
      } catch (error) {
        failed++;
        const message = String(error?.message || error).slice(0, 400);
        results.set(target, { state: "failed", reason: message });
        emit({ type: "error", name, message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, worker));
  await patchSources(results).catch(() => {});
  emit({ type: "end", posts, failed });
}

const safeName = (name) =>
  path.basename(String(name || "file")).replace(/[^\w.\- ]+/g, "_").replace(/^\.+/, "").slice(0, 120) || "file";

/** Save pasted text and uploaded files into the store's sources/<slug>/; returns the folder. */
export async function ingestUpload({ title, text, files = [] } = {}) {
  await ensureStore();
  const UPLOADS_DIR = sourcesDir();
  const label = (title || "").trim() || files[0]?.name?.replace(/\.[^.]+$/, "") || "Untitled note";
  const base = slugify(label);
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  let slug = base;
  for (let n = 2; ; n++) {
    try {
      await fs.mkdir(path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, slug));
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      slug = `${base}-${n}`;
    }
  }
  const dir = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, slug);
  // Write into a hidden .tmp folder, then rename over the (empty) reserved one, so
  // autosync and the sources watcher only ever see a complete upload.
  const stage = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, `.${slug}.${process.pid}.tmp`);
  try {
    await fs.mkdir(stage, { recursive: true });
    if (text && text.trim()) await fs.writeFile(path.join(stage, "notes.md"), `# ${label}\n\n${text.trim()}\n`);
    const used = new Set();
    for (const file of files) {
      let name = safeName(file.name);
      while (used.has(name)) name = `1-${name}`;
      used.add(name);
      await fs.writeFile(path.join(/*turbopackIgnore: true*/ stage, name), file.buffer);
    }
    await fs.writeFile(path.join(stage, ".upload.json"), JSON.stringify({ title: label, at: new Date().toISOString() }));
    await fs.rename(stage, dir);
  } catch (error) {
    await fs.rm(stage, { recursive: true, force: true });
    await fs.rmdir(dir).catch(() => {});
    throw error;
  }
  return dir;
}

/** Remove a record, its media, and its source folder in the store if it came from an upload. */
export async function deleteRecord(slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("invalid slug");
  const file = path.join(postsDir(), `${slug}.json`);
  const UPLOADS_DIR = sourcesDir();
  const record = await fs.readFile(file, "utf8").then(JSON.parse).catch(() => null);
  await fs.rm(file, { force: true });
  await fs.rm(path.join(mediaDir(), slug), { recursive: true, force: true });
  if (record?.origin === "upload" && (record.sourceDir || typeof record.path === "string")) {
    const dir = record.sourceDir ? path.join(storeDir(), record.sourceDir) : path.resolve(record.path);
    // Only a direct child of the uploads folder, never anything a crafted path escapes to.
    if (path.dirname(dir) === path.resolve(UPLOADS_DIR) && isInside(UPLOADS_DIR, dir))
      await fs.rm(dir, { recursive: true, force: true });
  }
}
