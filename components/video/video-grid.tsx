"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Loader2, Play, X } from "lucide-react";
import type { VideoStatus } from "@/lib/research/types";
import { VideoPlayer } from "./video-player";
import { ratio } from "./use-video";

export type VideoItem = {
  slug: string;
  title: string;
  topic: string;
  accent: string;
  status: VideoStatus;
};

function duration(sec?: number) {
  if (!sec) return "";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** One tile: poster that previews on hover, opens the player on click. */
function Tile({ item, onOpen }: { item: VideoItem; onOpen: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const { status } = item;
  const r = ratio(status.aspect);
  return (
    <div className="group">
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={() => ref.current?.play().catch(() => {})}
        onMouseLeave={() => {
          if (!ref.current) return;
          ref.current.pause();
          ref.current.currentTime = 0;
        }}
        onFocus={() => ref.current?.play().catch(() => {})}
        onBlur={() => ref.current?.pause()}
        aria-label={`Play ${item.title} video`}
        className="relative block w-full overflow-hidden rounded-[14px] bg-[#0b0c0a] shadow-[var(--shadow)]"
        style={{ aspectRatio: r.css === "16 / 9" ? "16 / 9" : "9 / 16" }}
      >
        <video
          ref={ref}
          src={status.url}
          poster={status.poster}
          muted
          loop
          playsInline
          preload="none"
          className="absolute inset-0 size-full object-cover"
          aria-hidden
        />
        <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />
        <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">
          <Play className="size-3 fill-current" />
          {duration(status.durationSec)}
        </span>
        <span className="absolute right-2.5 top-2.5 rounded-full bg-black/50 px-2 py-0.5 font-mono text-[10.5px] text-white/80">
          {status.aspect ?? "9:16"}
        </span>
      </button>
      <div className="mt-2 flex items-start gap-2 px-0.5">
        <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: item.accent }} aria-hidden />
        <div className="min-w-0">
          <Link href={`/p/${item.slug}`} className="line-clamp-2 text-[14px] font-semibold leading-snug hover:underline">
            {item.title}
          </Link>
          <p className="text-[12.5px] text-muted-foreground">{item.topic}</p>
        </div>
      </div>
    </div>
  );
}

export function VideoGrid({ items, running }: { items: VideoItem[]; running: VideoItem[] }) {
  const [open, setOpen] = useState<VideoItem | null>(null);
  return (
    <>
      {running.length > 0 && (
        <div className="mb-6 flex flex-col gap-2">
          {running.map((item) => (
            <Link
              key={item.slug}
              href={`/p/${item.slug}`}
              className="flex items-center gap-3 rounded-[12px] border border-line bg-surface px-4 py-3 text-sm hover:border-line-strong"
            >
              <Loader2 className="size-4 animate-spin text-brand" />
              <span className="font-medium">{item.title}</span>
              <span className="text-muted-foreground">{item.status.stage ?? "Making video"}...</span>
            </Link>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <Tile key={item.slug} item={item} onOpen={() => setOpen(item)} />
        ))}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${open.title} video`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setOpen(null)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(null)}
        >
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close video"
            autoFocus
          >
            <X className="size-5" />
          </button>
          <VideoPlayer status={open.status} title={open.title} maxVh={80} autoPlay className="w-full" />
          <Link
            href={`/p/${open.slug}`}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:opacity-90"
          >
            Open post: {open.title}
          </Link>
        </div>
      )}
    </>
  );
}
