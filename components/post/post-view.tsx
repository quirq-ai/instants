"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Bookmark, Download, EyeOff, FileText, FolderOpen, Link2, Pin } from "lucide-react";
import { toast } from "sonner";
import { SlideCarousel, type SlideCarouselHandle } from "@/components/slides";
import type { ResearchRecord, VideoStatus } from "@/lib/research/types";
import { VideoPanel } from "@/components/video/video-panel";
import { VideoPlayer } from "@/components/video/video-player";
import { useVideo } from "@/components/video/use-video";
import { copyPostLink, openFolder, sendActivity, useActivityFlag } from "./activity-client";
import { citations, keyNumbers } from "./meta";
import { RegenerateButton } from "./regenerate";

function Pill({
  label,
  onClick,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition ${
        active ? "border-transparent bg-brand-soft text-brand" : "border-line text-ink-2 hover:bg-surface-2"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** Interactive post body: carousel, actions, key numbers and sources share the slide index. */
export function PostView({
  record,
  saved,
  pinned,
  hidden,
  header,
  meta,
  writeup,
  aside,
  video: initialVideo = null,
}: {
  record: ResearchRecord;
  saved: boolean;
  pinned: boolean;
  hidden: boolean;
  header: React.ReactNode;
  meta: React.ReactNode;
  writeup: React.ReactNode;
  aside: React.ReactNode;
  video?: VideoStatus | null;
}) {
  const { post } = record;
  const [index, setIndex] = useState(0);
  const handle = useRef<SlideCarouselHandle>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const save = useActivityFlag(record.slug, saved, "save", "unsave", { on: "Saved", off: "Removed from saved" });
  const pin = useActivityFlag(record.slug, pinned, "pin", "unpin", { on: "Pinned", off: "Unpinned" });
  const hide = useActivityFlag(record.slug, hidden, "hide", "unhide", {
    on: "Hidden from feed and library",
    off: "Visible again",
  });
  const video = useVideo(record.slug, initialVideo);
  const hasVideo = video.status?.state === "ready" && Boolean(video.status.url);
  const [view, setView] = useState<"video" | "slides">("video");
  const showVideo = hasVideo && view === "video";
  const cites = citations(post.slides);
  const numbers = keyNumbers(post.slides);

  useEffect(() => {
    sendActivity({ action: "read", slug: record.slug }).catch(() => {});
  }, [record.slug]);

  function goTo(slide: number) {
    setView("slides");
    handle.current?.goTo(slide);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      carouselRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function download() {
    try {
      await handle.current?.download(`${record.slug}-${String(index + 1).padStart(2, "0")}.png`);
    } catch {
      toast.error("Could not export this slide");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
      <div className="lg:sticky lg:top-6 lg:self-start" ref={carouselRef}>
        {hasVideo && (
          <div role="group" aria-label="Show" className="mx-auto mb-3 flex w-fit rounded-full border border-line bg-surface p-0.5">
            {(["slides", "video"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`h-8 rounded-full px-4 text-[13px] font-medium capitalize transition focus-visible:outline-2 focus-visible:outline-[var(--focus)] ${
                  view === v ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
        {showVideo && video.status && <VideoPlayer status={video.status} title={post.title} />}
        <div hidden={showVideo}>
          <SlideCarousel
            ref={handle}
            slides={post.slides}
            accent={post.accent}
            title={post.title}
            sources={post.sources}
            initialIndex={index}
            onIndexChange={setIndex}
            size="detail"
          />
          <p className="mt-2 text-center font-mono text-[11px] text-faint">
            slide {index + 1} of {post.slides.length}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <Fragment key="header">{header}</Fragment>
        <div className="flex flex-wrap items-center gap-2">
          <Pill label={save[0] ? "Saved" : "Save"} active={save[0]} onClick={save[1]}>
            <Bookmark className="size-3.5" fill={save[0] ? "currentColor" : "none"} />
          </Pill>
          <Pill label={pin[0] ? "Pinned" : "Pin"} active={pin[0]} onClick={pin[1]}>
            <Pin className="size-3.5" fill={pin[0] ? "currentColor" : "none"} />
          </Pill>
          <Pill label={hide[0] ? "Hidden" : "Hide"} active={hide[0]} onClick={hide[1]}>
            <EyeOff className="size-3.5" />
          </Pill>
          <Pill label="Copy link" onClick={() => copyPostLink(record.slug)}>
            <Link2 className="size-3.5" />
          </Pill>
          <Pill label="Open folder" onClick={() => openFolder(record.slug)}>
            <FolderOpen className="size-3.5" />
          </Pill>
          <Pill label="Download slide" onClick={download}>
            <Download className="size-3.5" />
          </Pill>
          <RegenerateButton slug={record.slug} />
        </div>
        <Fragment key="meta">{meta}</Fragment>

        <Section title="Video">
          <VideoPanel slug={record.slug} video={video} />
        </Section>

        {numbers.length > 0 && (
          <Section title="Key numbers">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {numbers.map((n) => (
                <button
                  key={`${n.slide}-${n.label}`}
                  type="button"
                  aria-label={`${n.value}, ${n.label}. Show slide ${n.slide + 1}`}
                  onClick={() => goTo(n.slide)}
                  className="rounded-[10px] border border-line bg-surface p-3 text-left transition hover:border-line-strong"
                >
                  <div className="break-words font-display text-[24px] leading-tight text-ink">{n.value}</div>
                  <div className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{n.label}</div>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section title="Writeup"><Fragment key="writeup">{writeup}</Fragment></Section>

        {post.sources.length > 0 && (
          <Section title="Sources">
            <ul className="flex flex-col gap-1.5">
              {post.sources.map((source, si) => {
                const slides = cites.get(source.id) ?? [];
                const current = slides.includes(index);
                return (
                  <li
                    key={`${source.id}-${si}`}
                    className={`rounded-[10px] border px-3 py-2.5 transition ${
                      current ? "border-transparent bg-brand-soft" : "border-line"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="break-all font-mono text-[12.5px] text-ink">
                          {source.path}
                          {source.lines && <span className="text-faint">:{source.lines}</span>}
                        </div>
                        {source.note && <p className="mt-0.5 text-[13px] text-muted-foreground">{source.note}</p>}
                        {slides.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {slides.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => goTo(s)}
                                aria-label={`Show slide ${s + 1}`}
                                className={`rounded-full px-2 py-0.5 font-mono text-[11px] transition ${
                                  s === index ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink-2 hover:bg-surface-3"
                                }`}
                              >
                                slide {s + 1}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        <Fragment key="aside">{aside}</Fragment>
      </div>
    </div>
  );
}
