"use client";

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

type Vote = "up" | "down";
type Summary = { up: number; down: number; mine: Vote | null; canReact: boolean };

/** Thumbs up and down with counts. Clicking your current vote takes it back. */
export function Reactions({ slug }: { slug: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/reactions/${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? (res.json() as Promise<Summary>) : null))
      .then((summary) => live && summary && setData(summary))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug]);

  async function react(vote: Vote) {
    if (!data || busy) return;
    const next = data.mine === vote ? null : vote;
    const before = data;
    const count = (v: Vote) => data[v] - (data.mine === v ? 1 : 0) + (next === v ? 1 : 0);
    setData({ ...data, up: count("up"), down: count("down"), mine: next });
    setBusy(true);
    try {
      const res = await fetch(`/api/reactions/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vote: next }),
      });
      const body = (await res.json().catch(() => null)) as (Summary & { error?: string }) | null;
      if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status})`);
      setData(body);
    } catch (error) {
      setData(before);
      toast.error(error instanceof Error ? error.message : "Could not save your reaction");
    } finally {
      setBusy(false);
    }
  }

  const disabled = !data?.canReact;
  const button = (vote: Vote, label: string, Icon: typeof ThumbsUp) => {
    const active = data?.mine === vote;
    return (
      <button
        type="button"
        onClick={() => react(vote)}
        disabled={disabled}
        aria-pressed={active}
        aria-label={`${label}${data ? `, ${data[vote]}` : ""}`}
        title={disabled ? "Reactions are saved from the hub site" : label}
        className={`flex h-9 items-center gap-1.5 px-3 text-[13px] font-medium tabular-nums transition disabled:cursor-default ${
          active ? "bg-brand-soft text-brand" : "text-ink-2 enabled:hover:bg-surface-2"
        }`}
      >
        <Icon className="size-3.5" fill={active ? "currentColor" : "none"} />
        {data ? data[vote] : "·"}
      </button>
    );
  };

  return (
    <div role="group" aria-label="Reactions" className="flex items-center divide-x divide-line overflow-hidden rounded-full border border-line">
      {button("up", "Like", ThumbsUp)}
      {button("down", "Dislike", ThumbsDown)}
    </div>
  );
}
