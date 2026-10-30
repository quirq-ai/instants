"use client";

import type { VideoStatus } from "@/lib/research/types";
import { ratio } from "./use-video";

/** Aspect-correct player that never grows taller than `maxVh` of the viewport. */
export function VideoPlayer({
  status,
  title,
  maxVh = 78,
  autoPlay = false,
  className = "",
}: {
  status: VideoStatus;
  title: string;
  maxVh?: number;
  autoPlay?: boolean;
  className?: string;
}) {
  const r = ratio(status.aspect);
  if (!status.url) return null;
  return (
    <div
      className={`mx-auto overflow-hidden rounded-[18px] bg-[#0b0c0a] shadow-[var(--shadow)] ${className}`}
      style={{ aspectRatio: r.css, width: `min(100%, calc(${maxVh}vh * ${r.value.toFixed(4)}))` }}
    >
      <video
        key={status.url}
        src={status.url}
        poster={status.poster}
        controls
        playsInline
        autoPlay={autoPlay}
        preload="metadata"
        aria-label={`${title} video`}
        className="block size-full object-contain"
      />
    </div>
  );
}
