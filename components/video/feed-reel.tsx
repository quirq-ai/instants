"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import type { VideoStatus } from "@/lib/research/types";
import { ratio } from "./use-video";

// One mute switch for the whole feed, like Instagram: unmute once and every
// reel you scroll to plays with sound.
let muted = true;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn));
function setMuted(next: boolean) {
  muted = next;
  listeners.forEach((fn) => fn());
}

/** Feed video: plays muted while mostly on screen, pauses off screen, loops; tap to pause. */
export function FeedReel({ status, title, maxVh = 70 }: { status: VideoStatus; title: string; maxVh?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const isMuted = useSyncExternalStore(subscribe, () => muted, () => true);
  const [paused, setPaused] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const r = ratio(status.aspect);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let inView = false;
    const resume = () => {
      if (inView && !userPaused && !still && !document.hidden) el.play().catch(() => {});
    };
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry.intersectionRatio >= 0.6;
        if (inView) resume();
        else el.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    // The browser pauses muted video in a hidden tab; pick up again on return.
    document.addEventListener("visibilitychange", resume);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", resume);
    };
  }, [userPaused]);

  useEffect(() => {
    if (ref.current) ref.current.muted = isMuted;
  }, [isMuted]);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      setUserPaused(false);
      el.play().catch(() => {});
    } else {
      setUserPaused(true);
      el.pause();
    }
  }

  if (!status.url) return null;
  return (
    <div
      className="relative mx-auto overflow-hidden bg-[#0b0c0a]"
      style={{ aspectRatio: r.css, width: `min(100%, calc(${maxVh}vh * ${r.value.toFixed(4)}))` }}
    >
      <video
        ref={ref}
        src={status.url}
        poster={status.poster}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={`${title} video`}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onClick={toggle}
        className="block size-full cursor-pointer object-contain"
      />
      {paused && (
        <button
          type="button"
          onClick={toggle}
          aria-label="Play video"
          className="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
        >
          <Play className="ml-1 size-7" fill="currentColor" />
        </button>
      )}
      <button
        type="button"
        onClick={() => setMuted(!isMuted)}
        aria-label={isMuted ? "Turn sound on" : "Turn sound off"}
        aria-pressed={!isMuted}
        className="absolute bottom-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
      >
        {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
      </button>
    </div>
  );
}
