// One tile per topic on /topics: count, date span and a mosaic of three thumbs.
import Link from "next/link";
import { SlideThumb } from "@/components/slides";
import type { ResearchRecord } from "@/lib/research/types";
import { topicSlug } from "@/lib/research/format";
import { monthYear } from "@/components/post/meta";

export function topicSpan(records: ResearchRecord[]) {
  const dates = records.map((r) => r.occurredAt).sort();
  const first = monthYear(dates[0]);
  const last = monthYear(dates[dates.length - 1]);
  return first === last ? first : `${first} to ${last}`;
}

export function TopicTile({ topic, records }: { topic: string; records: ResearchRecord[] }) {
  const thumbs = records.slice(0, 3);
  const accent = records[0]?.post.accent ?? "var(--brand)";
  return (
    <Link
      href={`/topics/${topicSlug(topic)}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-line-strong"
    >
      <div className="grid aspect-[12/5] grid-cols-3 gap-px border-b border-line bg-line">
        {[0, 1, 2].map((i) => (
          <div key={i} className="relative overflow-hidden bg-surface-2">
            {thumbs[i] ? (
              <SlideThumb slide={thumbs[i].post.slides[0]} accent={thumbs[i].post.accent} />
            ) : (
              <div className="size-full" style={{ background: `color-mix(in srgb, ${accent} 12%, transparent)` }} />
            )}
          </div>
        ))}
      </div>
      <div className="flex items-end justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="flex items-baseline gap-2 font-display text-[26px] leading-[1.1]">
            <span className="size-2.5 shrink-0 -translate-y-1 rounded-full" style={{ background: accent }} aria-hidden />
            <span className="text-balance">{topic}</span>
          </h2>
          <p className="text-[12.5px] text-muted-foreground">{topicSpan(records)}</p>
        </div>
        <span className="shrink-0 font-mono text-[13px] text-ink-2">
          {records.length} post{records.length === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  );
}
