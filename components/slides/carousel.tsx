"use client";

// Native scroll-snap carousel for a post's slides: swipe on touch, buttons and
// arrow keys on desktop, a segment indicator labeled with slide types.

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Slide as SlideData, Source } from "@/lib/research/types";
import { cn } from "@/lib/utils";
import { Slide, slideHeading } from "./slide";
import { SLIDE_LABELS } from "./palette";
import { downloadSlide, slideFile } from "./export";

export type SlideCarouselHandle = {
  goTo: (index: number) => void;
  index: () => number;
  /** PNG of the current (or given) slide. */
  download: (filename?: string, index?: number) => Promise<string | undefined>;
  /** The current (or given) slide as a PNG file. */
  file: (filename?: string, index?: number) => Promise<File | undefined>;
};

export type SlideCarouselApi = { index: number; total: number; download: (filename?: string) => Promise<string | undefined> };

type Props = {
  slides: SlideData[];
  accent: string;
  title: string;
  sources?: Source[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  size?: "feed" | "detail";
  className?: string;
  ref?: React.Ref<SlideCarouselHandle>;
  /** Extra controls (for example a download button) rendered under the slides. */
  renderActions?: (api: SlideCarouselApi) => React.ReactNode;
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "slide";

export function SlideCarousel({ slides, accent, title, sources, initialIndex = 0, onIndexChange, size = "feed", className, ref, renderActions }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(Math.min(Math.max(initialIndex, 0), Math.max(slides.length - 1, 0)));
  const indexRef = useRef(index);
  const total = slides.length;
  const onChange = useRef(onIndexChange);
  useEffect(() => {
    onChange.current = onIndexChange;
  });

  const goTo = useCallback((i: number, smooth = true) => {
    const el = track.current;
    if (!el) return;
    const next = Math.min(Math.max(i, 0), total - 1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: next * el.clientWidth, behavior: smooth && !reduce ? "smooth" : "auto" });
  }, [total]);

  // Jump to the initial slide without animation.
  useEffect(() => {
    if (initialIndex > 0) goTo(initialIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== indexRef.current) {
      indexRef.current = i;
      setIndex(i);
      onChange.current?.(i);
    }
  };

  const download = useCallback(async (filename?: string, i = indexRef.current) => {
    const node = track.current?.children[i] as HTMLElement | undefined;
    if (!node) return undefined;
    return downloadSlide(node, filename ?? `${slugify(title)}-${i + 1}.png`);
  }, [title]);

  const file = useCallback(async (filename?: string, i = indexRef.current) => {
    const node = track.current?.children[i] as HTMLElement | undefined;
    if (!node) return undefined;
    return slideFile(node, filename ?? `${slugify(title)}-${i + 1}.png`);
  }, [title]);

  useImperativeHandle(ref, () => ({ goTo, index: () => indexRef.current, download, file }), [goTo, download, file]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") goTo(indexRef.current + 1);
    else if (e.key === "ArrowLeft") goTo(indexRef.current - 1);
    else if (e.key === "Home") goTo(0);
    else if (e.key === "End") goTo(total - 1);
    else return;
    e.preventDefault();
  };

  if (!total) {
    return (
      <div className={cn("grid aspect-[4/5] w-full place-items-center rounded-[var(--radius)] border border-dashed border-line bg-surface-2 text-sm text-muted-foreground", className)}>
        No slides yet
      </div>
    );
  }

  const detail = size === "detail";
  return (
    <div className={cn("w-full", className)}>
      <section
        role="region"
        aria-roledescription="carousel"
        aria-label={`${title} slides`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn("group/carousel relative overflow-hidden bg-[#0b0c0a] shadow-[var(--shadow)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]", detail ? "rounded-[18px]" : "rounded-[var(--radius)]")}
      >
        <div
          ref={track}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-live="polite"
        >
          {slides.map((s, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${i + 1} of ${total}: ${slideHeading(s)}`}
              aria-hidden={i !== index ? true : undefined}
              inert={i !== index ? true : undefined}
              className="w-full shrink-0 snap-start snap-always"
            >
              <Slide slide={s} accent={accent} index={i} total={total} title={title} sources={sources} />
            </div>
          ))}
        </div>

        {total > 1 && (
          <>
            <NavButton side="left" disabled={index === 0} onClick={() => goTo(index - 1)} />
            <NavButton side="right" disabled={index === total - 1} onClick={() => goTo(index + 1)} />
          </>
        )}
      </section>

      {total > 1 && (
        <div className="mt-2.5 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-1" role="tablist" aria-label="Choose slide">
            {slides.map((s, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Slide ${i + 1}: ${SLIDE_LABELS[s.type]}`}
                tabIndex={-1}
                onClick={() => goTo(i)}
                className="group/seg relative flex h-5 flex-1 items-center"
              >
                <span className={cn("h-[3px] w-full rounded-full transition-colors", i === index ? "bg-ink" : "bg-line-strong group-hover/seg:bg-faint")} />
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-medium text-bg opacity-0 shadow transition-opacity group-hover/seg:opacity-100 group-focus-visible/seg:opacity-100">
                  {SLIDE_LABELS[s.type]}
                </span>
              </button>
            ))}
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground" aria-live="polite">
            {index + 1}/{total}
          </span>
        </div>
      )}
      {renderActions?.({ index, total, download: (f) => download(f) })}
    </div>
  );
}

function NavButton({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      aria-label={side === "left" ? "Previous slide" : "Next slide"}
      className={cn(
        "absolute top-1/2 hidden size-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-[#16150f] shadow-md transition-opacity hover:bg-white disabled:pointer-events-none md:grid",
        "opacity-0 group-hover/carousel:opacity-100 group-focus-within/carousel:opacity-100 disabled:!opacity-0",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
