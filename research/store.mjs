// The content store: one directory holding everything Instants generates and
// everything that should travel with the Curie library (posts, media, videos,
// uploaded sources). It is the Spacehub clone when a space is connected, else
// .research-cache/store. Per-user state (activity, scan cache, video working
// dirs, space config) never lives here.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const APP_ROOT = import.meta.dirname ? path.resolve(import.meta.dirname, "..") : process.cwd();
export const CACHE_DIR = path.join(APP_ROOT, ".research-cache");
export const LOCAL_STORE = path.join(CACHE_DIR, "store");
export const SPACE_ROOT = path.join(CACHE_DIR, "space");
export const SPACE_CONFIG = path.join(CACHE_DIR, "space.json");
export const VIDEOS_WORK = path.join(CACHE_DIR, "videos-work");
const PUBLIC_RESEARCH = path.join(APP_ROOT, "public", "research");

export const PROJECT_RE = /^[a-z0-9][a-z0-9._-]{0,63}\/[a-z0-9][a-z0-9._-]{0,99}$/i;
export const MANIFEST = { name: "Curie", version: 1 };
const DEFAULT_CONFIG = { project: null, autoGenerate: false };

let configCache = { mtime: -1, value: DEFAULT_CONFIG };

/** True when a parsed space.json is a config (an older app wrote post records with this name). */
const isConfig = (data) => data && typeof data === "object" && "project" in data && !("post" in data);

/** The space config, re-read only when the file changes. */
export function readSpaceConfig() {
  let mtime;
  try {
    mtime = fs.statSync(SPACE_CONFIG).mtimeMs;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
  if (mtime === configCache.mtime) return { ...configCache.value };
  let value = DEFAULT_CONFIG;
  try {
    const data = JSON.parse(fs.readFileSync(SPACE_CONFIG, "utf8"));
    if (isConfig(data)) {
      value = {
        project: typeof data.project === "string" && PROJECT_RE.test(data.project) ? data.project : null,
        autoGenerate: Boolean(data.autoGenerate),
        ...(typeof data.connectedAt === "string" ? { connectedAt: data.connectedAt } : {}),
      };
    }
  } catch {}
  configCache = { mtime, value };
  return { ...value };
}

export async function writeSpaceConfig(next) {
  await relocateLegacyConfig();
  const value = { project: next.project ?? null, autoGenerate: Boolean(next.autoGenerate) };
  if (next.project && next.connectedAt) value.connectedAt = next.connectedAt;
  await writeJson(SPACE_CONFIG, value);
  configCache = { mtime: -1, value: DEFAULT_CONFIG };
  return value;
}

/** An older app version wrote a post record named space.json; move it out of the config's way. */
async function relocateLegacyConfig() {
  const data = await fsp.readFile(SPACE_CONFIG, "utf8").then(JSON.parse).catch(() => null);
  if (!data || isConfig(data)) return;
  await fsp.mkdir(path.join(CACHE_DIR, "legacy"), { recursive: true });
  await fsp.rename(SPACE_CONFIG, path.join(CACHE_DIR, "legacy", "space.json")).catch(() => {});
}

export const spaceDirFor = (project) => path.join(SPACE_ROOT, project.replace("/", "__"));

/** The space clone when a space is connected and cloned, else the local store. */
export function storeDir() {
  const { project } = readSpaceConfig();
  if (project) {
    const dir = spaceDirFor(project);
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
  }
  return LOCAL_STORE;
}

export const postsDir = () => path.join(storeDir(), "posts");
export const mediaDir = () => path.join(storeDir(), "media");
export const videosDir = () => path.join(storeDir(), "videos");
export const sourcesDir = () => path.join(storeDir(), "sources");

/** Resolve a store-relative path, refusing anything that escapes the store. */
export function resolveInStore(rel, root = storeDir()) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) return null;
  const full = path.resolve(root, rel);
  const back = path.relative(root, full);
  if (!back || back.startsWith("..") || path.isAbsolute(back)) return null;
  return full;
}

export async function writeJson(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, file);
}

const README = `# Curie

The Curie library for Instants: research turned into carousel posts.
This folder is written by the Instants app; when it is a Spacehub project it
syncs both ways with every machine that connects to it.

- \`posts/<slug>.json\`: one post record (slides, sources, metadata)
- \`media/<slug>/*\`: images used by a post's slides
- \`videos/<slug>.mp4\`, \`<slug>.jpg\`, \`<slug>.status.json\`: rendered video, poster, render result
- \`sources/<slug>/*\`: uploaded sources (with \`.upload.json\`); a source with no post yet is pending
- \`instants.json\`: library manifest

Saves, pins, notes and read state stay on each machine and are never written here.
`;

/** Make the layout, manifest and README exist in a store (missing pieces only). */
export async function scaffoldStore(root = storeDir()) {
  for (const sub of ["posts", "media", "videos", "sources"]) await fsp.mkdir(path.join(/*turbopackIgnore: true*/ root, sub), { recursive: true });
  const manifest = path.join(root, "instants.json");
  if (!fs.existsSync(manifest)) await writeJson(manifest, MANIFEST);
  const readme = path.join(root, "README.md");
  if (!fs.existsSync(readme)) await fsp.writeFile(readme, README);
  await ensureStoreGitignore(root);
}

// Temp files from atomic writes (temp + rename) must never be committed by autosync.
const GITIGNORE_LINES = ["*.tmp", "*.tmp.*", ".DS_Store"];

/** Make the store's .gitignore list the temp-file patterns (appends only what is missing). */
export async function ensureStoreGitignore(root = storeDir()) {
  const file = path.join(root, ".gitignore");
  const current = await fsp.readFile(file, "utf8").catch(() => "");
  const have = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const missing = GITIGNORE_LINES.filter((l) => !have.has(l));
  if (!missing.length) return;
  const header = current ? "" : "# Written by Instants: temp files from atomic writes never sync.\n";
  const sep = current && !current.endsWith("\n") ? "\n" : "";
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, `${current}${sep}${header}${missing.join("\n")}\n`);
  await fsp.rename(tmp, file);
}

const SKIP = (name) => name === ".git" || name === ".DS_Store" || /\.tmp(\.|$)/.test(name);

async function sameContent(a, b) {
  const [sa, sb] = await Promise.all([fsp.stat(a), fsp.stat(b)]);
  if (sa.size !== sb.size) return false;
  const [ba, bb] = await Promise.all([fsp.readFile(a), fsp.readFile(b)]);
  return ba.equals(bb);
}

/**
 * Merge `src` into `dst`. mode "missing" copies only files dst lacks; "newer"
 * also replaces files whose content differs and are older in dst; "move"
 * renames missing files and drops the source copy of files dst already has.
 * Never deletes anything in dst. Returns the number of files written.
 */
export async function mergeTree(src, dst, mode = "missing") {
  let count = 0;
  const entries = await fsp.readdir(src, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (SKIP(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      count += await mergeTree(from, to, mode);
      if (mode === "move") await fsp.rmdir(from).catch(() => {});
      continue;
    }
    if (!entry.isFile()) continue;
    const there = await fsp.stat(to).catch(() => null);
    await fsp.mkdir(dst, { recursive: true });
    if (mode === "move") {
      if (!there) {
        await fsp.rename(from, to).catch(async () => {
          const tmp = `${to}.${process.pid}.tmp`;
          await fsp.copyFile(from, tmp);
          await fsp.rename(tmp, to);
          await fsp.rm(from, { force: true });
        });
        count++;
      } else if (await sameContent(from, to).catch(() => false)) await fsp.rm(from, { force: true });
      else {
        // Both copies exist and differ: never drop one. Park the source copy under legacy/.
        const park = path.join(CACHE_DIR, "legacy", "conflicts", path.relative(CACHE_DIR, from).replace(/^(\.\.[\\/])+/, ""));
        await fsp.mkdir(path.dirname(park), { recursive: true });
        await fsp.rename(from, park).catch(() => fsp.copyFile(from, park).then(() => fsp.rm(from, { force: true })));
      }
      continue;
    }
    if (there && mode === "missing") continue;
    if (there && mode === "newer") {
      const here = await fsp.stat(from);
      if (here.size === there.size && here.mtimeMs <= there.mtimeMs) continue;
      if (here.mtimeMs < there.mtimeMs) continue;
    }
    const tmp = `${to}.${process.pid}.tmp`;
    await fsp.copyFile(from, tmp);
    await fsp.rename(tmp, to);
    count++;
  }
  return count;
}

/**
 * Move content an older layout left in public/research and .research-cache
 * into the store. Idempotent: every step only acts on what is still there.
 */
export async function migrateStore() {
  await relocateLegacyConfig();
  const root = storeDir();
  await scaffoldStore(root);
  const moved = {};
  moved.posts = await mergeTree(path.join(CACHE_DIR, "posts"), path.join(root, "posts"), "move");
  moved.media = await mergeTree(path.join(PUBLIC_RESEARCH, "media"), path.join(root, "media"), "move");
  moved.videos = await mergeTree(path.join(PUBLIC_RESEARCH, "videos"), path.join(root, "videos"), "move");
  moved.sources = await mergeTree(path.join(CACHE_DIR, "uploads"), path.join(root, "sources"), "move");
  for (const dir of [path.join(CACHE_DIR, "posts"), path.join(CACHE_DIR, "uploads"), path.join(PUBLIC_RESEARCH, "media"), path.join(PUBLIC_RESEARCH, "videos"), PUBLIC_RESEARCH])
    await fsp.rmdir(dir).catch(() => {});

  // Video working dirs: .research-cache/videos/<slug>/ -> videos-work/<slug>/, ready results into the store.
  const oldVideos = path.join(CACHE_DIR, "videos");
  moved.videoWork = 0;
  for (const slug of await fsp.readdir(oldVideos).catch(() => [])) {
    if (!/^[a-z0-9-]+$/.test(slug)) continue;
    const from = path.join(oldVideos, slug);
    const to = path.join(VIDEOS_WORK, slug);
    if (!fs.existsSync(to)) {
      await fsp.mkdir(VIDEOS_WORK, { recursive: true });
      await fsp.rename(from, to);
      moved.videoWork++;
    }
  }
  await fsp.rmdir(oldVideos).catch(() => {});
  for (const slug of await fsp.readdir(VIDEOS_WORK).catch(() => [])) {
    const status = await fsp.readFile(path.join(VIDEOS_WORK, slug, "status.json"), "utf8").then(JSON.parse).catch(() => null);
    const out = path.join(root, "videos", `${slug}.status.json`);
    if (status?.state === "ready" && fs.existsSync(path.join(root, "videos", `${slug}.mp4`)) && !fs.existsSync(out))
      await writeJson(out, { ...status, log: [] });
  }

  // Upload records: point them at their source folder inside the store.
  moved.records = 0;
  const posts = path.join(root, "posts");
  for (const file of await fsp.readdir(posts).catch(() => [])) {
    if (!file.endsWith(".json")) continue;
    const full = path.join(posts, file);
    const record = await fsp.readFile(full, "utf8").then(JSON.parse).catch(() => null);
    if (record?.origin !== "upload" || record.sourceDir) continue;
    const name = path.basename(String(record.path || ""));
    if (!name || !fs.existsSync(path.join(root, "sources", name))) continue;
    record.sourceDir = `sources/${name}`;
    record.path = path.join(root, "sources", name);
    await writeJson(full, record);
    moved.records++;
  }
  return { store: root, moved };
}

const g = globalThis;
/** migrateStore once per process (shared across bundles). */
export function ensureStore() {
  g.__instantsStoreReady ??= migrateStore().catch((error) => {
    g.__instantsStoreReady = undefined;
    throw error;
  });
  return g.__instantsStoreReady;
}

/** Absolute folder of an upload-style record's source in the current store. */
export function recordSourcePath(record) {
  if (record?.sourceDir) return resolveInStore(record.sourceDir);
  return record?.path ?? null;
}
