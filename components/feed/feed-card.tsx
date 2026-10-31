"use client";

import Link from "next/link";
import { forwardRef, useRef, useState } from "react";
import { Bookmark, ChevronDown, Clapperboard, FolderOpen, Images, Link2, Loader2, Pin, Play, Share, SquareArrowOutUpRight } from "lucide-react";
import { slideFile } from "@/components/slides/export";
import { InstagramIcon, XIcon, shareElsewhere, shareToInstagram, shareToX, videoMedia } from "@/components/post/share";
import { SlideCarousel } from "@/components/slides";
import type { ResearchRecord, VideoStatus } from "@/lib/research/types";
import { FeedReel } from "@/components/video/feed-reel";
import { isActive } from "@/components/video/use-video";
import { copyPostLink, openFolder, useActivityFlag } from "@/components/post/activity-client";
import { gitSpan, researchLabel } from "@/components/post/meta";
import { plainExcerpt } from "@/components/post/markdown";

export function useCardFlags(slug: string, saved: boolean, pinned: boolean) {
  const save = useActivityFlag(slug, saved, "save", "unsave", { on: "Saved", off: "Removed from saved" });
  const pin = useActivityFlag(slug, pinned, "pin", "unpin", { on: "Pinned to the top of Latest", off: "Unpinned" });
  return { save, pin };
}

export function ActionButton({
  label,
  onClick,
  active = false,
  action,
  className = "",
  children,
}: {
  action?: string;
  className?: string;
  label: string;
  onClick?: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={action === "save" || action === "pin" ? active : undefined}
      data-action={action}
      title={label}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full transition hover:bg-surface-2 ${
        active ? "text-brand" : "text-ink-2"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export const FeedCard = forwardRef<
  HTMLElement,
  {
    record: ResearchRecord;
    saved: boolean;
    pinned: boolean;
    unread: boolean;
    active: boolean;
    video?: VideoStatus | null;
  }
>(function FeedCard({ record, saved, pinned, unread, active, video = null }, ref) {
  const { post } = record;
  const { save, pin } = useCardFlags(record.slug, saved, pinned);
  const [expanded, setExpanded] = useState(false);
  const span = gitSpan(record);
  const ready = video?.state === "ready" && Boolean(video.url);
  const making = isActive(video);
  // Like Instagram, a post with a video opens on the video; slides are one tap away.
  const [playing, setPlaying] = useState(true);
  const bar = useRef<HTMLDivElement>(null);
  const coverSlide = async () => {
    const slide = bar.current?.closest("article")?.querySelector<HTMLElement>("[data-slide]");
    return slide ? slideFile(slide, `${record.slug}-01.png`) : undefined;
  };

  return (
    <article
      ref={ref}
      tabIndex={-1}
      data-slug={record.slug}
      aria-label={post.title}
      className={`rounded-[var(--radius)] border bg-surface shadow-[var(--shadow)] outline-none transition [content-visibility:auto] [contain-intrinsic-size:auto_900px] ${
        active ? "border-line-strong ring-2 ring-[var(--focus)]/40" : "border-line"
      }`}
    >
      <header className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span
          aria-hidden
          className="mt-1 size-8 shrink-0 rounded-[10px]"
          style={{ background: `linear-gradient(135deg, ${post.accent}, color-mix(in srgb, ${post.accent} 45%, transparent))` }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link href={`/p/${record.slug}`} className="truncate text-[15px] font-semibold text-ink hover:underline">
              {post.title}
            </Link>
            {unread && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Not opened yet" />}
            {pin[0] && <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" />}
            {ready && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
                <Clapperboard className="size-3" aria-hidden /> Video
              </span>
            )}
            {making && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden /> Making video...
              </span>
            )}
          </div>
          <div className="truncate text-[12.5px] text-muted-foreground">
            {post.topic} · {post.kind} · {researchLabel(record)}
          </div>
          {span && <div className="truncate font-mono text-[11px] text-faint">{span}</div>}
        </div>
      </header>

      {playing && ready && video ? (
        <div className="bg-[#0b0c0a]">
          <FeedReel status={video} title={post.title} maxVh={70} />
        </div>
      ) : (
        <SlideCarousel slides={post.slides} accent={post.accent} title={post.title} sources={post.sources} size="feed" />
      )}

      <div ref={bar} className="flex items-center gap-0.5 px-2 pt-2">
        <ActionButton label={save[0] ? "Unsave" : "Save"} active={save[0]} onClick={save[1]} action="save">
          <Bookmark className="size-[19px]" fill={save[0] ? "currentColor" : "none"} />
        </ActionButton>
        <ActionButton label={pin[0] ? "Unpin" : "Pin"} active={pin[0]} onClick={pin[1]} action="pin">
          <Pin className="size-[19px]" fill={pin[0] ? "currentColor" : "none"} />
        </ActionButton>
        <ActionButton label="Post to X" onClick={() => shareToX(record)}>
          <XIcon className="size-[17px]" />
        </ActionButton>
        <ActionButton
          label="Share to Instagram"
          onClick={() =>
            shareToInstagram(record, (playing && ready && videoMedia(record.slug, video)) || coverSlide)
          }
        >
          <InstagramIcon className="size-[19px]" />
        </ActionButton>
        <ActionButton label="Share" onClick={() => shareElsewhere(record)}>
          <Share className="size-[19px]" />
        </ActionButton>
        <ActionButton label="Copy link" onClick={() => copyPostLink(record.slug)} className="max-sm:hidden">
          <Link2 className="size-[19px]" />
        </ActionButton>
        <ActionButton label="Open folder" onClick={() => openFolder(record.slug)} className="max-sm:hidden">
          <FolderOpen className="size-[19px]" />
        </ActionButton>
        {ready && (
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            aria-pressed={playing}
            className="ml-auto flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2"
          >
            {playing ? <Images className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
            <span className="max-sm:sr-only">{playing ? "Show slides" : "Play video"}</span>
          </button>
        )}
        <Link
          href={`/p/${record.slug}`}
          className={`${ready ? "" : "ml-auto "} flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2`}
        >
          <span className="max-sm:sr-only">Open post</span> <SquareArrowOutUpRight className="size-3.5" />
        </Link>
      </div>

      <div className="px-4 pb-4 pt-1">
        <p className="text-[14.5px] leading-relaxed text-ink-2">{post.summary}</p>
        {expanded && <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{plainExcerpt(post.writeup)}</p>}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-ink"
        >
          {expanded ? "Less" : "More from the writeup"}
          <ChevronDown className={`size-3.5 transition ${expanded ? "rotate-180" : ""}`} />
        </button>
        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map((tag, i) => (
              <Link
                key={`${tag}-${i}`}
                href={`/library?tag=${encodeURIComponent(tag)}`}
                className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-ink-2 hover:bg-surface-3"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
});
