// Read-only content store served straight from Spacehub over HTTPS, for hosts
// with no persistent disk (Vercel). The space project (INSTANTS_SPACE) is the
// database: posts, media and videos are read from the hub's raw file URLs, and
// nothing is written. On by default when VERCEL is set; INSTANTS_STORE=hub or
// INSTANTS_STORE=local forces either mode.
import type { ResearchRecord, VideoStatus } from "./types";

const PROJECT = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function hubMode(): boolean {
  const mode = process.env.INSTANTS_STORE;
  if (mode === "local") return false;
  return mode === "hub" || Boolean(process.env.VERCEL);
}

function project() {
  const value = (process.env.INSTANTS_SPACE || "quirq/curie").trim();
  if (!PROJECT.test(value)) throw new Error(`INSTANTS_SPACE must look like space/project, got "${value}"`);
  return value;
}

/** https origin of the hub: SPACEHUB_HTTP, else SPACEHUB_SERVER with wss mapped to https. */
function origin() {
  const explicit = process.env.SPACEHUB_HTTP?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const server = (process.env.SPACEHUB_SERVER || "wss://hub.quirq.dev").trim();
  return server.replace(/^ws(s?):\/\//, "http$1://").replace(/\/+$/, "");
}

const branch = () => process.env.INSTANTS_BRANCH?.trim() || "main";
const seconds = () => Math.max(0, Number(process.env.INSTANTS_REVALIDATE ?? 60) || 0);
const encodePath = (file: string) => file.split("/").map(encodeURIComponent).join("/");

/** Public URL of a file in the space project, e.g. rawUrl("videos/x.mp4"). */
export function rawUrl(file: string) {
  return `${origin()}/${project()}/raw/${encodeURIComponent(branch())}/${encodePath(file)}`;
}

// Raw and tree URLs are anonymous (the hub ignores tokens on them), so the
// project must be public; the browser loads media from the same URLs.
async function get(url: string) {
  return fetch(url, { next: { revalidate: seconds(), tags: ["hub"] } });
}

async function json<T>(file: string): Promise<T | null> {
  const res = await get(rawUrl(file)).catch(() => null);
  if (!res?.ok) return null;
  return (res.json() as Promise<T>).catch(() => null);
}

/**
 * File names in one folder of the project. The hub has no JSON listing, so
 * this reads the links on its tree page (/<space>/<project>/tree/<branch>/<dir>).
 */
async function list(dir: string): Promise<string[]> {
  const base = `/${project()}/blob/${branch()}/${dir}/`;
  const res = await get(`${origin()}/${project()}/tree/${encodeURIComponent(branch())}/${encodePath(dir)}`);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`Spacehub listing of ${dir} failed (${res.status})`);
  }
  const names = new Set<string>();
  for (const [, href] of (await res.text()).matchAll(/href="([^"]+)"/g)) {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(href, origin()).pathname);
    } catch {
      continue;
    }
    if (pathname.startsWith(base)) {
      const name = pathname.slice(base.length);
      if (name && !name.includes("/")) names.add(name);
    }
  }
  return [...names];
}

/** Map with at most `limit` requests in flight. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const SLUG = /^[a-z0-9-]+$/;

export async function hubRecords(): Promise<ResearchRecord[]> {
  const slugs = (await list("posts")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((s) => SLUG.test(s));
  const records = await pool(slugs, 24, (slug) => json<ResearchRecord>(`posts/${slug}.json`));
  return records
    .filter((record): record is ResearchRecord => Boolean(record?.post?.slides?.length))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export async function hubRecord(slug: string): Promise<ResearchRecord | null> {
  if (!SLUG.test(slug)) return null;
  return json<ResearchRecord>(`posts/${slug}.json`);
}

export async function hubVideoStatus(slug: string): Promise<VideoStatus | null> {
  if (!SLUG.test(slug)) return null;
  const status = await json<VideoStatus>(`videos/${slug}.status.json`);
  return status?.state === "ready" ? status : null;
}

export async function hubVideoStatuses(): Promise<Record<string, VideoStatus>> {
  const slugs = (await list("videos"))
    .filter((f) => f.endsWith(".status.json"))
    .map((f) => f.slice(0, -".status.json".length))
    .filter((s) => SLUG.test(s));
  const out: Record<string, VideoStatus> = {};
  await pool(slugs, 24, async (slug) => {
    const status = await hubVideoStatus(slug);
    if (status) out[slug] = status;
  });
  return out;
}
