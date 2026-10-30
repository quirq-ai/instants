"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Search, X } from "lucide-react";
import type { ResearchRecord, VideoStatus } from "@/lib/research/types";
import { researchYear, slideTypes } from "@/components/post/meta";
import { PostCard, PostRow } from "./post-card";
import { LIBRARY_KEYS, type LibraryState } from "./state";

const SORTS = [
  { id: "newest", label: "Newest research" },
  { id: "oldest", label: "Oldest research" },
  { id: "generated", label: "Recently generated" },
  { id: "commits", label: "Most commits" },
  { id: "title", label: "Title A to Z" },
];

const HAS = [
  { id: "chart", label: "Charts" },
  { id: "image", label: "Images" },
  { id: "code", label: "Code" },
  { id: "video", label: "Has video" },
];

type FacetKey = "topic" | "kind" | "status" | "stack" | "has" | "year";

function values(record: ResearchRecord, key: FacetKey, videos: Record<string, VideoStatus> = {}): string[] {
  switch (key) {
    case "topic": return [record.post.topic];
    case "kind": return [record.post.kind];
    case "status": return [record.post.status];
    case "stack": return record.meta.stack;
    case "year": return [researchYear(record)];
    case "has": {
      const types = slideTypes(record);
      const has = HAS.filter((h) => types.has(h.id as never)).map((h) => h.id);
      if (videos[record.slug]?.state === "ready") has.push("video");
      return has;
    }
  }
}

function haystack(record: ResearchRecord) {
  const { post } = record;
  return [post.title, post.hook, post.summary, post.writeup, post.tags.join(" "), post.sources.map((s) => s.path).join(" ")]
    .join("\n")
    .toLowerCase();
}

export function LibraryBrowser({
  records,
  initial,
  hiddenCount,
  read,
  videos = {},
}: {
  records: ResearchRecord[];
  initial: LibraryState;
  hiddenCount: number;
  read: string[];
  videos?: Record<string, VideoStatus>;
}) {
  const [state, setState] = useState(initial);
  useEffect(() => setState(initial), [initial]);
  const readSet = useMemo(() => new Set(read), [read]);
  const index = useMemo(() => new Map(records.map((r) => [r.slug, haystack(r)])), [records]);

  function update(patch: Partial<LibraryState>, push = true) {
    const next = { ...state, ...patch };
    setState(next);
    const params = new URLSearchParams();
    for (const key of LIBRARY_KEYS) if (next[key]) params.set(key, next[key]);
    const url = `${window.location.pathname}${params.size ? `?${params}` : ""}`;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  const q = state.q.trim().toLowerCase();
  const matches = (record: ResearchRecord, skip?: FacetKey) => {
    if (q && !q.split(/\s+/).every((word) => index.get(record.slug)!.includes(word))) return false;
    if (state.tag && !record.post.tags.includes(state.tag)) return false;
    for (const key of ["topic", "kind", "status", "stack", "has", "year"] as FacetKey[]) {
      if (key !== skip && state[key] && !values(record, key, videos).includes(state[key])) return false;
    }
    return true;
  };

  const results = records.filter((r) => matches(r)).sort((a, b) => {
    switch (state.sort) {
      case "oldest": return a.occurredAt.localeCompare(b.occurredAt);
      case "generated": return b.generatedAt.localeCompare(a.generatedAt);
      case "commits": return (b.meta.git?.commits ?? 0) - (a.meta.git?.commits ?? 0);
      case "title": return a.post.title.localeCompare(b.post.title);
      default: return b.occurredAt.localeCompare(a.occurredAt);
    }
  });

  /** Counts per value, computed against every other active filter. */
  function facet(key: FacetKey) {
    const counts = new Map<string, number>();
    records.forEach((r) => {
      if (!matches(r, key)) return;
      values(r, key, videos).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    });
    const all = new Set(records.flatMap((r) => values(r, key, videos)));
    return [...all]
      .map((v) => ({ value: v, count: counts.get(v) ?? 0 }))
      .sort((a, b) => (key === "year" ? b.value.localeCompare(a.value) : b.count - a.count || a.value.localeCompare(b.value)));
  }

  const filtersActive = (["topic", "kind", "status", "stack", "has", "year", "tag", "q"] as const).some((k) => state[k]);
  const clear = () => update({ q: "", topic: "", kind: "", status: "", stack: "", has: "", year: "", tag: "" });

  const FACETS: { key: FacetKey; label: string; display?: (v: string) => string }[] = [
    { key: "topic", label: "Topic" },
    { key: "kind", label: "Kind" },
    { key: "status", label: "Status" },
    { key: "stack", label: "Stack" },
    { key: "has", label: "Has", display: (v) => HAS.find((h) => h.id === v)?.label ?? v },
    { key: "year", label: "Year" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={state.q}
            onChange={(e) => update({ q: e.target.value }, false)}
            placeholder="Search titles, writeups, tags, file paths"
            aria-label="Search the library"
            className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-faint focus:border-line-strong"
          />
        </div>
        <label className="sr-only" htmlFor="library-sort">
          Sort
        </label>
        <select
          id="library-sort"
          value={state.sort || "newest"}
          onChange={(e) => update({ sort: e.target.value === "newest" ? "" : e.target.value })}
          className="h-10 rounded-[10px] border border-line bg-surface px-3 text-sm text-ink outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="flex rounded-[10px] border border-line bg-surface p-0.5" role="group" aria-label="View">
          {[
            { id: "", label: "Grid view", icon: LayoutGrid },
            { id: "list", label: "List view", icon: List },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              aria-pressed={state.view === id}
              onClick={() => update({ view: id })}
              className={`flex size-8 items-center justify-center rounded-[8px] ${
                state.view === id ? "bg-surface-2 text-ink" : "text-muted-foreground hover:text-ink"
              }`}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {FACETS.map(({ key, label, display }) => {
          const options = facet(key);
          if (options.length < 2 && !state[key]) return null;
          return (
            <div key={key} className="flex items-baseline gap-2">
              <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</span>
              <div className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
                {options.map(({ value, count }) => {
                  const on = state[key] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={on}
                      disabled={!count && !on}
                      onClick={() => update({ [key]: on ? "" : value })}
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12.5px] transition disabled:opacity-35 ${
                        on ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:bg-surface-2"
                      }`}
                    >
                      {display ? display(value) : value} <span className={on ? "opacity-70" : "text-faint"}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px] text-muted-foreground">
        <span aria-live="polite">
          {results.length} of {records.length} post{records.length === 1 ? "" : "s"}
          {state.tag && (
            <button
              type="button"
              onClick={() => update({ tag: "" })}
              className="ml-2 inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-ink-2"
              aria-label={`Remove tag filter ${state.tag}`}
            >
              #{state.tag} <X className="size-3" />
            </button>
          )}
        </span>
        <span className="flex gap-3">
          {filtersActive && (
            <button type="button" onClick={clear} className="font-medium text-ink hover:underline">
              Clear filters
            </button>
          )}
          {hiddenCount > 0 && (
            <Link href={state.hidden ? "/library" : "/library?hidden=1"} className="hover:text-ink hover:underline">
              {state.hidden ? "Hide hidden posts" : `${hiddenCount} hidden`}
            </Link>
          )}
        </span>
      </div>

      {results.length === 0 ? (
        <div className="flex flex-col items-center rounded-[var(--radius)] border border-dashed border-line-strong px-6 py-14 text-center">
          <h2 className="font-display text-[28px]">No posts match</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {records.length ? "Loosen a filter or try a different word." : "Nothing has been posted yet."}
          </p>
          {records.length > 0 ? (
            <button type="button" onClick={clear} className="mt-4 rounded-[10px] bg-ink px-4 py-2 text-sm font-medium text-bg">
              Clear filters
            </button>
          ) : (
            <Link href="/add" className="mt-4 rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
              Add research
            </Link>
          )}
        </div>
      ) : state.view === "list" ? (
        <div className="rounded-[var(--radius)] border border-line bg-surface">
          {results.map((r) => (
            <PostRow key={r.slug} record={r} query={state.q} hasVideo={videos[r.slug]?.state === "ready"} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {results.map((r) => (
            <PostCard key={r.slug} record={r} query={state.q} unread={!readSet.has(r.slug)} hasVideo={videos[r.slug]?.state === "ready"} />
          ))}
        </div>
      )}
    </div>
  );
}
