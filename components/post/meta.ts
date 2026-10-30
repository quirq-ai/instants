// Derived, display-ready facts about a record. Safe on server and client.
import type { ResearchRecord, Slide } from "@/lib/research/types";
import { compactNumber, dateRange } from "@/lib/research/format";

export function monthYear(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** "research from Mar 2026" */
export function researchLabel(record: ResearchRecord) {
  const when = monthYear(record.occurredAt);
  return when ? `research from ${when}` : "research date unknown";
}

/** "Jan 3 to Mar 9, 2026 · 42 commits" or null without git. */
export function gitSpan(record: ResearchRecord) {
  const git = record.meta.git;
  if (!git) return null;
  return `${dateRange(git.first, git.last)} · ${git.commits} commit${git.commits === 1 ? "" : "s"}`;
}

export function slideTypes(record: ResearchRecord) {
  return new Set(record.post.slides.map((slide) => slide.type));
}

export function researchYear(record: ResearchRecord) {
  const y = new Date(record.occurredAt).getFullYear();
  return Number.isFinite(y) ? String(y) : "Unknown";
}

export type KeyNumber = { value: string; label: string; slide: number };

/** Big numbers and chart peaks, in slide order. */
export function keyNumbers(slides: Slide[]): KeyNumber[] {
  const out: KeyNumber[] = [];
  slides.forEach((slide, index) => {
    if (slide.type === "bigNumbers") {
      slide.items.forEach((item) => out.push({ value: item.value, label: item.label, slide: index }));
    } else if (slide.type === "chart") {
      const values = slide.series.flatMap((s) => s.values).filter(Number.isFinite);
      if (!values.length) return;
      const peak = Math.max(...values);
      out.push({
        value: `${compactNumber(peak)}${slide.unit ? ` ${slide.unit}` : ""}`,
        label: `peak in ${slide.heading}`,
        slide: index,
      });
    }
  });
  return out.slice(0, 8);
}

/** Which slide indexes cite each source id. */
export function citations(slides: Slide[]) {
  const map = new Map<string, number[]>();
  slides.forEach((slide, index) => {
    const ids = new Set<string>();
    if ("src" in slide && slide.src) ids.add(slide.src);
    if (slide.type === "bigNumbers") slide.items.forEach((item) => item.src && ids.add(item.src));
    ids.forEach((id) => map.set(id, [...(map.get(id) ?? []), index]));
  });
  return map;
}
