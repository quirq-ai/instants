// Library / topic grid card and compact row. No client state; works in server and client trees.
import Link from "next/link";
import { Play } from "lucide-react";
import { SlideThumb } from "@/components/slides";
import type { ResearchRecord } from "@/lib/research/types";
import { monthYear } from "@/components/post/meta";
import { Highlight } from "./highlight";

export function PostCard({
  record,
  query = "",
  unread = false,
  hasVideo = false,
}: {
  record: ResearchRecord;
  query?: string;
  unread?: boolean;
  hasVideo?: boolean;
}) {
  const { post } = record;
  return (
    <Link
      href={`/p/${record.slug}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-line-strong"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden border-b border-line bg-surface-2">
        <SlideThumb slide={post.slides[0]} accent={post.accent} />
        {hasVideo && <VideoMark className="left-2.5 top-2.5 size-7" />}
        {unread && (
          <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full bg-brand ring-2 ring-surface" aria-label="Unread" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3.5">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          <span className="size-2 shrink-0 rounded-full" style={{ background: post.accent }} aria-hidden />
          <span className="truncate">{post.topic}</span>
        </div>
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
          <Highlight text={post.title} query={query} />
        </h3>
        <p className="line-clamp-2 text-[13px] text-muted-foreground">
          <Highlight text={post.hook} query={query} />
        </p>
        <div className="mt-auto pt-1.5 text-[12px] text-faint">
          {post.kind} · {monthYear(record.occurredAt)}
        </div>
      </div>
    </Link>
  );
}

export function PostRow({ record, query = "", hasVideo = false }: { record: ResearchRecord; query?: string; hasVideo?: boolean }) {
  const { post } = record;
  return (
    <Link
      href={`/p/${record.slug}`}
      className="flex items-center gap-3 border-b border-line px-1 py-3 transition last:border-b-0 hover:bg-surface-2 sm:px-3"
    >
      <div className="relative aspect-[4/5] w-12 shrink-0 overflow-hidden rounded-md border border-line bg-surface-2">
        <SlideThumb slide={post.slides[0]} accent={post.accent} />
        {hasVideo && <VideoMark className="bottom-1 right-1 size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-semibold text-ink">
          <Highlight text={post.title} query={query} />
        </div>
        <div className="truncate text-[13px] text-muted-foreground">
          <Highlight text={post.summary} query={query} />
        </div>
      </div>
      <div className="hidden shrink-0 text-right text-[12px] text-faint sm:block">
        <div>{post.topic}</div>
        <div>
          {post.kind} · {monthYear(record.occurredAt)}
        </div>
      </div>
    </Link>
  );
}

function VideoMark({ className }: { className: string }) {
  return (
    <span
      role="img"
      aria-label="Has video"
      className={`absolute flex items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 ${className}`}
    >
      <Play className="size-[55%] translate-x-[5%]" fill="currentColor" aria-hidden />
    </span>
  );
}
