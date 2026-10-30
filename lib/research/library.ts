// Server-only data layer: research records live as JSON files in the content
// store's posts/ (lib/research/store.ts), per-user activity in .research-cache/activity.json.
import fs from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import type { Activity, ResearchRecord, SourceStatus, VideoStatus } from "./types";
import { ensureStore, postsDir, videosDir, VIDEOS_WORK } from "./store";

export const CACHE_DIR = path.join(process.cwd(), ".research-cache");
const ACTIVITY_FILE = path.join(CACHE_DIR, "activity.json");
const SOURCES_FILE = path.join(CACHE_DIR, "sources.json");

const EMPTY_ACTIVITY: Activity = { saved: [], pinned: [], hidden: [], read: {}, notes: {} };

type RecordCache = { key: string; records: ResearchRecord[]; files: Map<string, { mtime: number; record: ResearchRecord | null }> };
const store = globalThis as unknown as { __instantsRecords?: RecordCache; __instantsActivityLock?: Promise<unknown>; __instantsTmp?: number };

/**
 * Load every record, reusing parsed files whose mtime has not changed. The
 * engine writes posts by atomic rename, which bumps the file mtime, so a new
 * or regenerated post is always picked up.
 */
async function loadRecords(): Promise<ResearchRecord[]> {
  await ensureStore().catch(() => {});
  const POSTS_DIR = postsDir();
  const names = (await fs.readdir(POSTS_DIR).catch(() => [] as string[])).filter((file) => file.endsWith(".json"));
  const stats = await Promise.all(
    names.map((name) => fs.stat(path.join(POSTS_DIR, name)).then((st) => [name, st.mtimeMs] as const).catch(() => null)),
  );
  const present = stats.filter((s): s is readonly [string, number] => Boolean(s));
  const key = POSTS_DIR + "|" + present.map(([name, mtime]) => `${name}:${mtime}`).join("|");
  const prev = store.__instantsRecords;
  if (prev && prev.key === key) return prev.records;

  const files = new Map<string, { mtime: number; record: ResearchRecord | null }>();
  await Promise.all(
    present.map(async ([name, mtime]) => {
      const hit = prev?.key.startsWith(`${POSTS_DIR}|`) ? prev.files.get(name) : undefined;
      if (hit && hit.mtime === mtime) return void files.set(name, hit);
      const record = await fs
        .readFile(path.join(POSTS_DIR, name), "utf8")
        .then((text) => JSON.parse(text) as ResearchRecord)
        .catch(() => null);
      files.set(name, { mtime, record });
    }),
  );
  const records = [...files.values()]
    .map((f) => f.record)
    .filter((record): record is ResearchRecord => Boolean(record?.post?.slides?.length))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  store.__instantsRecords = { key, records, files };
  return records;
}

/** Every post, newest research first. Hidden posts are included; callers filter. Deduped per request. */
export const getRecords: () => Promise<ResearchRecord[]> = cache(loadRecords);

export async function getRecord(slug: string): Promise<ResearchRecord | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  await ensureStore().catch(() => {});
  return fs
    .readFile(path.join(postsDir(), `${slug}.json`), "utf8")
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

export async function getActivity(): Promise<Activity> {
  return readActivity().catch(() => structuredClone(EMPTY_ACTIVITY));
}

/** Serialized read-modify-write of the activity file, shared across bundles and hot reloads. */
export function updateActivity(mutate: (activity: Activity) => void): Promise<Activity> {
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
  const [local, shared] = await Promise.all([
    readStatus(path.join(VIDEOS_CACHE, slug, "status.json")),
    readStatus(path.join(videosDir(), `${slug}.status.json`)),
  ]);
  const status = !local ? shared : !shared ? local : shared.startedAt > local.startedAt ? shared : local;
  return status ? settle(status) : null;
}

export async function getVideoStatuses(): Promise<Record<string, VideoStatus>> {
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
