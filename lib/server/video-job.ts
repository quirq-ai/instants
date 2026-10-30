// Video jobs, one per post, up to MAX_PARALLEL rendering at once; the rest wait
// in a FIFO for a free slot. Separate from the post generation lock. Lives on
// globalThis so it survives hot reloads; a job older than STALE_MS is dead.
import { runVideo } from "@/research/video.mjs";
import type { VideoStatus } from "@/lib/research/types";

const STALE_MS = 50 * 60 * 1000;
const MAX_PARALLEL = Math.max(1, Number(process.env.INSTANTS_VIDEO_PARALLEL) || 3);

type Held = { id: number; slug: string; startedAt: number; controller: AbortController };
const g = globalThis as unknown as {
  __instantsVideoJobs?: Map<string, Held>;
  __instantsVideoSlots?: { active: number; waiting: (() => void)[] };
  __instantsVideoSeq?: number;
};
const jobs = (g.__instantsVideoJobs ??= new Map());
const slots = (g.__instantsVideoSlots ??= { active: 0, waiting: [] });

const live = (slug: string) => {
  const held = jobs.get(slug);
  return held && Date.now() - held.startedAt < STALE_MS ? held : null;
};

/** Resolve once a render slot is free; the returned function gives it back. */
function acquire(signal: AbortSignal): Promise<() => void> {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    slots.active--;
    slots.waiting.shift()?.();
  };
  if (slots.active < MAX_PARALLEL) {
    slots.active++;
    return Promise.resolve(release);
  }
  return new Promise((resolve, reject) => {
    const turn = () => {
      signal.removeEventListener("abort", onAbort);
      slots.active++;
      resolve(release);
    };
    const onAbort = () => {
      slots.waiting = slots.waiting.filter((w) => w !== turn);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    slots.waiting.push(turn);
  });
}

export const videoJob = {
  /** Slugs with a live video job, rendering or waiting for a slot. */
  running(): string[] {
    return [...jobs.keys()].filter((slug) => live(slug));
  },
  isRunning(slug: string): boolean {
    return Boolean(live(slug));
  },
  limit: MAX_PARALLEL,
  /** True when starting another job now would wait for a slot. */
  full(): boolean {
    return this.running().length >= MAX_PARALLEL;
  },
  /** Start runVideo in the background (not tied to any request). Null when this post already has a live job. */
  start(options: { slug: string; aspect: NonNullable<VideoStatus["aspect"]>; length: number; sound: NonNullable<VideoStatus["sound"]> }): Promise<VideoStatus> | null {
    if (live(options.slug)) return null;
    jobs.get(options.slug)?.controller.abort(new Error("stale video lock"));
    const id = (g.__instantsVideoSeq = (g.__instantsVideoSeq ?? 0) + 1);
    const controller = new AbortController();
    jobs.set(options.slug, { id, slug: options.slug, startedAt: Date.now(), controller });
    let release: (() => void) | undefined;
    let resolveFirst: (s: VideoStatus) => void;
    const first = new Promise<VideoStatus>((r) => (resolveFirst = r));
    runVideo({
      ...options,
      signal: controller.signal,
      onStatus: (s) => resolveFirst(s),
      waitTurn: async () => {
        release = await acquire(controller.signal);
      },
    })
      .catch((error): VideoStatus => {
        const failed: VideoStatus = {
          slug: options.slug, state: "failed", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
          aspect: options.aspect, error: error instanceof Error ? error.message : String(error), log: [],
        };
        resolveFirst(failed);
        return failed;
      })
      .finally(() => {
        release?.();
        if (jobs.get(options.slug)?.id === id) jobs.delete(options.slug);
      });
    return first;
  },
  cancel(slug: string, reason = "cancelled"): boolean {
    const held = live(slug);
    if (!held) return false;
    held.controller.abort(new Error(reason));
    return true;
  },
};
