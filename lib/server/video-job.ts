// One video job at a time, separate from the post generation lock. Lives on
// globalThis so it survives hot reloads; a lock older than STALE_MS is dead.
import { runVideo } from "@/research/video.mjs";
import type { VideoStatus } from "@/lib/research/types";

const STALE_MS = 50 * 60 * 1000;

type Held = { id: number; slug: string; startedAt: number; controller: AbortController; promise?: Promise<VideoStatus> };
const g = globalThis as unknown as { __recallVideoJob?: Held | null; __recallVideoSeq?: number };

const live = () => {
  const held = g.__recallVideoJob;
  return held && Date.now() - held.startedAt < STALE_MS ? held : null;
};

export const videoJob = {
  /** Slug of the running video job, or null. */
  running(): string | null {
    return live()?.slug ?? null;
  },
  /** Start runVideo in the background (not tied to any request). Null when another job holds the lock. */
  start(options: { slug: string; aspect: NonNullable<VideoStatus["aspect"]>; length: number }): Promise<VideoStatus> | null {
    if (live()) return null;
    g.__recallVideoJob?.controller.abort(new Error("stale video lock"));
    const id = (g.__recallVideoSeq = (g.__recallVideoSeq ?? 0) + 1);
    const controller = new AbortController();
    const held: Held = { id, slug: options.slug, startedAt: Date.now(), controller };
    g.__recallVideoJob = held;
    let resolveFirst: (s: VideoStatus) => void;
    const first = new Promise<VideoStatus>((r) => (resolveFirst = r));
    held.promise = runVideo({ ...options, signal: controller.signal, onStatus: (s) => resolveFirst(s) })
      .catch((error): VideoStatus => {
        const failed: VideoStatus = {
          slug: options.slug, state: "failed", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
          aspect: options.aspect, error: error instanceof Error ? error.message : String(error), log: [],
        };
        resolveFirst(failed);
        return failed;
      })
      .finally(() => {
        if (g.__recallVideoJob?.id === id) g.__recallVideoJob = null;
      });
    return first;
  },
  cancel(slug: string, reason = "cancelled"): boolean {
    const held = live();
    if (!held || held.slug !== slug) return false;
    held.controller.abort(new Error(reason));
    return true;
  },
};
