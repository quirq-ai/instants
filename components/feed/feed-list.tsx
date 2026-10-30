"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ResearchRecord, VideoStatus } from "@/lib/research/types";
import { FeedCard } from "./feed-card";

/** The feed column with j/k/s/o keyboard navigation. */
export function FeedList({
  records,
  saved,
  pinned,
  read,
  videos = {},
}: {
  records: ResearchRecord[];
  saved: string[];
  pinned: string[];
  read: string[];
  videos?: Record<string, VideoStatus>;
}) {
  const router = useRouter();
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(-1);
  const savedSet = new Set(saved);
  const pinnedSet = new Set(pinned);
  const readSet = new Set(read);

  useEffect(() => {
    function focus(index: number) {
      const el = refs.current[index];
      if (!el) return;
      setActive(index);
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const current = active >= 0 ? active : -1;
      const key = event.key;
      if (key === "j") {
        event.preventDefault();
        focus(Math.min(records.length - 1, current + 1));
      } else if (key === "k") {
        event.preventDefault();
        focus(Math.max(0, current - 1));
      } else if (current >= 0 && key === "s") {
        event.preventDefault();
        refs.current[current]?.querySelector<HTMLButtonElement>('[data-action="save"]')?.click();
      } else if (current >= 0 && (key === "o" || (key === "Enter" && target === refs.current[current]))) {
        event.preventDefault();
        router.push(`/p/${records[current].slug}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, records, router]);

  return (
    <div className="flex flex-col gap-6">
      {records.map((record, index) => (
        <FeedCard
          key={record.slug}
          ref={(el) => {
            refs.current[index] = el;
          }}
          record={record}
          saved={savedSet.has(record.slug)}
          pinned={pinnedSet.has(record.slug)}
          unread={!readSet.has(record.slug)}
          active={index === active}
          video={videos[record.slug] ?? null}
        />
      ))}
      <p className="hidden pb-4 text-center text-xs text-faint md:block">
        <kbd className="rounded border border-line px-1 font-mono">j</kbd> /{" "}
        <kbd className="rounded border border-line px-1 font-mono">k</kbd> move ·{" "}
        <kbd className="rounded border border-line px-1 font-mono">s</kbd> save ·{" "}
        <kbd className="rounded border border-line px-1 font-mono">o</kbd> open
      </p>
    </div>
  );
}
