// Server-only data layer: research records live as JSON files on the content
// store's shelves, posts/, liked/ and hidden/ (lib/research/store.ts), per-user
// activity in .research-cache/activity.json.
import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import type { Activity, ResearchRecord, SourceStatus, VideoStatus } from "./types";
import { ensureStore, findPost, movePost, SHELVES, storeDir, videosDir, VIDEOS_WORK, type Shelf } from "./store";
import { hubLibrary, hubMode, hubRecord, hubVideoStatus, hubVideoStatuses } from "./hub";

export const CACHE_DIR = path.join(process.cwd(), ".research-cache");
const ACTIVITY_FILE = path.join(CACHE_DIR, "activity.json");
const SOURCES_FILE = path.join(CACHE_DIR, "sources.json");

export const READ_ONLY = "This site reads its posts from Spacehub and is view only.";

const EMPTY_ACTIVITY: Activity = { saved: [], pinned: [], liked: [], hidden: [], read: {}, notes: {} };

type Library = { records: ResearchRecord[]; liked: string[]; hidden: string[] };
type RecordCache = Library & { key: string; files: Map<string, { mtime: number; record: ResearchRecord | null }> };
const store = globalThis as unknown as {
  __instantsRecords?: RecordCache;
  __instantsActivityLock?: Promise<unknown>;
  __instantsTmp?: number;
  __instantsHiddenMoved?: Promise<void>;
};

// When a sync leaves one post on two shelves, hidden wins, then liked (same order as findPost).
const SHELF_RANK: Record<Shelf, number> = { hidden: 0, liked: 1, posts: 2 };

/**
 * Load every record from every shelf, reusing parsed files whose mtime has
 * not changed. The engine writes posts by atomic rename, which bumps the file
 * mtime, so a new or regenerated post is always picked up.
 */
async function loadLibrary(): Promise<Library> {
  if (hubMode()) return { ...(await hubLibrary()), hidden: [] };
  await ensureStore().catch(() => {});
  const root = storeDir();
  const listed = await Promise.all(
    SHELVES.map(async (shelf) => {
      const names = (await fs.readdir(path.join(root, shelf)).catch(() => [] as string[])).filter((file) => file.endsWith(".json"));
      return Promise.all(
        names.map((name) =>
          fs.stat(path.join(root, shelf, name)).then((st) => ({ shelf, name, id: `${shelf}/${name}`, mtime: st.mtimeMs })).catch(() => null),
        ),
      );
    }),
  );
  const present = listed.flat().filter((s): s is NonNullable<typeof s> => Boolean(s));
  const key = root + "|" + present.map(({ id, mtime }) => `${id}:${mtime}`).join("|");
  const prev = store.__instantsRecords;
  if (prev && prev.key === key) return prev;

  const files = new Map<string, { mtime: number; record: ResearchRecord | null }>();
  await Promise.all(
    present.map(async ({ id, mtime }) => {
      const hit = prev?.key.startsWith(`${root}|`) ? prev.files.get(id) : undefined;
      if (hit && hit.mtime === mtime) return void files.set(id, hit);
      const record = await fs
        .readFile(path.join(root, id), "utf8")
        .then((text) => JSON.parse(text) as ResearchRecord)
        .catch(() => null);
      files.set(id, { mtime, record });
    }),
  );
  const shelfOf = new Map<string, Shelf>();
  const bySlug = new Map<string, ResearchRecord>();
  for (const { shelf, id } of [...present].sort((a, b) => SHELF_RANK[b.shelf] - SHELF_RANK[a.shelf])) {
    const record = files.get(id)?.record;
    if (!record?.post?.slides?.length) continue;
    bySlug.set(record.slug, record);
    shelfOf.set(record.slug, shelf);
  }
  const records = [...bySlug.values()].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const on = (shelf: Shelf) => records.filter((r) => shelfOf.get(r.slug) === shelf).map((r) => r.slug);
  const next = { key, records, files, liked: on("liked"), hidden: on("hidden") };
  store.__instantsRecords = next;
  return next;
}

const getLibrary = cache(loadLibrary);

/** Every post, newest research first. Hidden posts are included; callers filter. Deduped per request. */
export const getRecords = async (): Promise<ResearchRecord[]> => (await getLibrary()).records;

export async function getRecord(slug: string): Promise<ResearchRecord | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  if (hubMode()) return hubRecord(slug);
  await ensureStore().catch(() => {});
  const found = findPost(slug);
  if (!found) return null;
  return fs
    .readFile(found.file, "utf8")
    .then((text) => JSON.parse(text) as ResearchRecord)
    .catch(() => null);
}

/** Posts that share a topic or tags with `record`, best matches first. */
export function relatedTo(record: ResearchRecord, all: ResearchRecord[], limit = 6) {
  const tags = new Set(record.post.tags);
  return all
    .filter((other) => other.slug !== record.slug)
    .map((other) => ({
      other,
      score:
        (other.post.topic === record.post.topic ? 2 : 0) +
        other.post.tags.filter((tag) => tags.has(tag)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ other }) => other);
}

async function readActivity(): Promise<Activity> {
  let text: string;
  try {
    text = await fs.readFile(ACTIVITY_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY_ACTIVITY);
    throw error;
  }
  // A corrupt file must not be silently replaced by an empty one on the next write.
  const stored = JSON.parse(text) as Partial<Activity>;
  return { ...structuredClone(EMPTY_ACTIVITY), ...stored };
}

/**
 * Hides used to be a local list. Move those posts to the store's hidden/
 * shelf once, so the list syncs like every hide made since.
 */
function moveLegacyHidden() {
  store.__instantsHiddenMoved ??= (async () => {
    const stored = await readActivity().catch(() => null);
    if (!stored?.hidden.length) return;
    await ensureStore().catch(() => {});
    for (const slug of stored.hidden) {
      if (findPost(slug)?.shelf === "posts") await movePost(slug, "hidden");
    }
    await updateActivity((a) => {
      a.hidden = [];
    });
  })().catch(() => {
    store.__instantsHiddenMoved = undefined;
  });
  return store.__instantsHiddenMoved;
}

/** Local activity, with `liked` and `hidden` read from the store's shelves. */
export async function getActivity(): Promise<Activity> {
  if (!hubMode()) await moveLegacyHidden();
  const base = hubMode() ? structuredClone(EMPTY_ACTIVITY) : await readActivity().catch(() => structuredClone(EMPTY_ACTIVITY));
  const { liked, hidden } = await getLibrary();
  return { ...base, liked, hidden };
}

/** Serialized read-modify-write of the activity file, shared across bundles and hot reloads. */
export function updateActivity(mutate: (activity: Activity) => void): Promise<Activity> {
  if (hubMode()) return Promise.reject(new Error(READ_ONLY));
  const prev = store.__instantsActivityLock ?? Promise.resolve();
  const next = prev.then(async () => {
    const activity = await readActivity();
    mutate(activity);
    await fs.mkdir(CACHE_DIR, { recursive: true });
    store.__instantsTmp = (store.__instantsTmp ?? 0) + 1;
    const temp = `${ACTIVITY_FILE}.${process.pid}.${store.__instantsTmp}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    await fs.writeFile(temp, JSON.stringify(activity, null, 2));
    await fs.rename(temp, ACTIVITY_FILE);
    return activity;
  });
  store.__instantsActivityLock = next.catch(() => {});
  return next;
}

export async function getSourceStatus(): Promise<SourceStatus[]> {
  if (hubMode()) return [];
  return fs
    .readFile(SOURCES_FILE, "utf8")
    .then((text) => JSON.parse(text) as SourceStatus[])
    .catch(() => []);
}

export async function writeSourceStatus(status: SourceStatus[]) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(SOURCES_FILE, JSON.stringify(status, null, 2));
}

const VIDEOS_CACHE = VIDEOS_WORK;

function liveVideoSlug(slug: string): boolean {
  const held = (globalThis as unknown as { __instantsVideoJobs?: Map<string, { startedAt: number }> }).__instantsVideoJobs?.get(slug);
  return Boolean(held && Date.now() - held.startedAt < 50 * 60 * 1000);
}

/** A queued/running status with no live job is reported as failed ("interrupted"). */
function settle(status: VideoStatus): VideoStatus {
  if ((status.state === "running" || status.state === "queued") && !liveVideoSlug(status.slug)) {
    return { ...status, state: "failed", error: status.error ?? "interrupted", finishedAt: status.finishedAt ?? status.startedAt };
  }
  return status;
}

const readStatus = (file: string) =>
  fs
    .readFile(file, "utf8")
    .then((text) => JSON.parse(text) as VideoStatus)
    .catch(() => null);

/**
 * The local working status (live renders, failures) or the store's ready
 * result (which may have come from another machine), whichever started later.
 */
export async function getVideoStatus(slug: string): Promise<VideoStatus | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  if (hubMode()) return hubVideoStatus(slug);
  const [local, shared] = await Promise.all([
    readStatus(path.join(VIDEOS_CACHE, slug, "status.json")),
    readStatus(path.join(videosDir(), `${slug}.status.json`)),
  ]);
  const status = !local ? shared : !shared ? local : shared.startedAt > local.startedAt ? shared : local;
  return status ? settle(status) : null;
}

export async function getVideoStatuses(): Promise<Record<string, VideoStatus>> {
  if (hubMode()) return hubVideoStatuses();
  const local = (await fs.readdir(VIDEOS_CACHE).catch(() => [] as string[])).filter((s) => /^[a-z0-9-]+$/.test(s));
  const shared = (await fs.readdir(videosDir()).catch(() => [] as string[]))
    .filter((f) => f.endsWith(".status.json"))
    .map((f) => f.slice(0, -".status.json".length));
  const slugs = [...new Set([...local, ...shared])].filter((s) => /^[a-z0-9-]+$/.test(s));
  const out: Record<string, VideoStatus> = {};
  await Promise.all(
    slugs.map(async (slug) => {
      const status = await getVideoStatus(slug);
      if (status) out[slug] = status;
    }),
  );
  return out;
}
