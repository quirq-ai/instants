// Feed ordering. Pure functions, used by the server page.
import type { Activity, ResearchRecord } from "@/lib/research/types";

export type FeedTab = "latest" | "rediscover" | "saved";
export const FEED_TABS: { id: FeedTab; label: string }[] = [
  { id: "latest", label: "Latest" },
  { id: "rediscover", label: "Rediscover" },
  { id: "saved", label: "Saved" },
];

export function parseTab(value: unknown): FeedTab {
  return value === "rediscover" || value === "saved" ? value : "latest";
}

/** Small stable string hash (FNV-1a) for seeded shuffles. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

/** Nudge apart neighbours that share a title so they never sit back to back. */
export function spreadSameTitles(records: ResearchRecord[]) {
  const out = [...records];
  for (let i = 1; i < out.length; i++) {
    if (out[i].post.title !== out[i - 1].post.title) continue;
    const j = out.findIndex((r, k) => k > i && r.post.title !== out[i - 1].post.title);
    if (j > 0) out.splice(i, 0, out.splice(j, 1)[0]);
  }
  return out;
}

export function orderFeed(records: ResearchRecord[], activity: Activity, tab: FeedTab, today = new Date()) {
  const pinned = new Set(activity.pinned);
  if (tab === "saved") {
    const order = new Map(activity.saved.map((slug, i) => [slug, i]));
    return records
      .filter((r) => order.has(r.slug))
      .sort((a, b) => order.get(b.slug)! - order.get(a.slug)!); // most recently saved first
  }
  if (tab === "latest") {
    return [...records].sort(
      (a, b) =>
        Number(pinned.has(b.slug)) - Number(pinned.has(a.slug)) || b.occurredAt.localeCompare(a.occurredAt),
    );
  }
  // Rediscover: never-read first, then read longest ago. Within that, older
  // research leads, jittered by a seed that changes once per day.
  const day = today.toISOString().slice(0, 10);
  const byAge = [...records].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const ageRank = new Map(byAge.map((r, i) => [r.slug, i / Math.max(1, byAge.length - 1)]));
  const readRank = (r: ResearchRecord) => (activity.read[r.slug] ? new Date(activity.read[r.slug]).getTime() : 0);
  return [...records].sort((a, b) => {
    const ra = readRank(a);
    const rb = readRank(b);
    if (Boolean(ra) !== Boolean(rb)) return ra ? 1 : -1;
    const score = (r: ResearchRecord, read: number) =>
      (read ? read / 1e13 : 0) + ageRank.get(r.slug)! * 0.6 + hash(`${day}:${r.slug}`) * 0.4;
    return score(a, ra) - score(b, rb);
  });
}
