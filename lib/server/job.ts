// One generation job at a time. The lock lives on globalThis so it survives
// hot reloads and is shared by every bundle of the route module. Each holder
// gets an AbortController, and a lock older than STALE_MS is treated as dead
// (a crash or reload mid-run can never wedge generation until restart).
const STALE_MS = 600_000 + 30_000;

type Held = { id: number; startedAt: number; controller: AbortController };
const g = globalThis as unknown as { __instantsJob?: Held | null; __instantsJobSeq?: number };

export const job = {
  running(): boolean {
    const held = g.__instantsJob;
    return Boolean(held && Date.now() - held.startedAt < STALE_MS);
  },
  /** Returns a handle on success, or null when another live job holds the lock. */
  acquire(): { signal: AbortSignal; abort: (reason?: string) => void; release: () => void } | null {
    const held = g.__instantsJob;
    if (held && Date.now() - held.startedAt < STALE_MS) return null;
    if (held) held.controller.abort(new Error("stale job lock"));
    const id = (g.__instantsJobSeq = (g.__instantsJobSeq ?? 0) + 1);
    const controller = new AbortController();
    g.__instantsJob = { id, startedAt: Date.now(), controller };
    return {
      signal: controller.signal,
      abort: (reason = "cancelled") => controller.abort(new Error(reason)),
      release: () => {
        if (g.__instantsJob?.id === id) g.__instantsJob = null;
      },
    };
  },
};
