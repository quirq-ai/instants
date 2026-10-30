"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { VideoStatus } from "@/lib/research/types";

export type VideoAspect = NonNullable<VideoStatus["aspect"]>;
export const ASPECTS: VideoAspect[] = ["9:16", "1:1", "16:9"];
export const LENGTHS = [30, 45, 60];

export const isActive = (s?: VideoStatus | null) => s?.state === "queued" || s?.state === "running";

/** CSS aspect-ratio value and numeric width/height ratio for a video aspect. */
export function ratio(aspect: VideoAspect = "9:16") {
  const [w, h] = aspect.split(":").map(Number);
  return { css: `${w} / ${h}`, value: w / h };
}

export function elapsedLabel(fromIso: string, to: number) {
  const s = Math.max(0, Math.floor((to - Date.parse(fromIso)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function readError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  return body?.error ?? body?.message ?? `${fallback} (${res.status})`;
}

/** Start a video job; returns the new status (and whether it waits for a slot) or throws with a readable message. */
export async function startVideo(
  slug: string,
  aspect: VideoAspect = "9:16",
  length = 45,
): Promise<{ status: VideoStatus; queued: boolean; limit: number }> {
  const res = await fetch("/api/video", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, aspect, length }),
  });
  if (res.status === 409) throw new Error(await readError(res, "A video for this post is already being made"));
  if (!res.ok) throw new Error(await readError(res, "Could not start the video"));
  return (await res.json()) as { status: VideoStatus; queued: boolean; limit: number };
}

/**
 * Video status for one post. Polls GET /api/video every 3s while this post's
 * job is running and the page is visible. Other posts' jobs run alongside.
 */
export function useVideo(slug: string, initial: VideoStatus | null) {
  const router = useRouter();
  const [status, setStatus] = useState<VideoStatus | null>(initial);
  const [running, setRunning] = useState<string[]>(isActive(initial) ? [slug] : []);
  const [busy, setBusy] = useState(false);
  const prev = useRef(initial?.state);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/video?slug=${encodeURIComponent(slug)}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const body = (await res.json()) as { status: VideoStatus | null; running: string[]; limit?: number };
    setStatus(body.status);
    setRunning(body.running ?? []);
  }, [slug]);

  // React to state transitions.
  useEffect(() => {
    const was = prev.current;
    prev.current = status?.state;
    if (!was || was === status?.state) return;
    if (status?.state === "ready" && (was === "running" || was === "queued")) {
      toast.success("Video ready");
      router.refresh();
    } else if (status?.state === "failed" && (was === "running" || was === "queued")) {
      toast.error(status.error ?? "Video failed");
    }
  }, [status, router]);

  const polling = isActive(status);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!polling) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = setInterval(tick, 3000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [polling, refresh]);

  async function start(aspect: VideoAspect, length: number) {
    setBusy(true);
    try {
      const { status: next, queued, limit } = await startVideo(slug, aspect, length);
      prev.current = next.state;
      setStatus(next);
      setRunning((r) => (r.includes(slug) ? r : [...r, slug]));
      toast.success(queued ? "Video queued" : "Making video", {
        description: queued
          ? `${limit} videos are already rendering. This one starts when a slot frees up.`
          : "This takes several minutes. You can leave the page.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the video");
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/video?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res, "Could not delete the video"));
      prev.current = undefined;
      setStatus(null);
      toast.success("Video deleted");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the video");
    } finally {
      setBusy(false);
    }
  }

  return { status, others: running.filter((s) => s !== slug), busy, start, remove };
}
