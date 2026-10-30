"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Clapperboard, Download, Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { VideoStatus } from "@/lib/research/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ASPECTS, LENGTHS, elapsedLabel, isActive, type VideoAspect, type useVideo } from "./use-video";

type Video = ReturnType<typeof useVideo>;

const btn =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-ink-2 transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:opacity-50";

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format = String,
  disabled,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-[12px] text-muted-foreground" id={`seg-${label}`}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`seg-${label}`} className="flex rounded-full border border-line bg-surface p-0.5">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={o === value}
            disabled={disabled}
            onClick={() => onChange(o)}
            className={`h-8 min-w-12 rounded-full px-3 text-[13px] font-medium transition focus-visible:outline-2 focus-visible:outline-[var(--focus)] disabled:opacity-50 ${
              o === value ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2"
            }`}
          >
            {format(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

function Log({ log }: { log: VideoStatus["log"] }) {
  if (!log?.length) return null;
  return (
    <details className="mt-3 rounded-[10px] border border-line bg-surface-2">
      <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-medium text-ink-2">Recent log ({log.length})</summary>
      <ol className="max-h-56 overflow-auto px-3 pb-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
        {log.map((l, i) => (
          <li key={i} className="break-words">
            <span className="text-faint">{new Date(l.at).toLocaleTimeString()}</span> {l.text}
          </li>
        ))}
      </ol>
    </details>
  );
}

function Confirm({
  trigger,
  title,
  body,
  action,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  body: string;
  action: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** The post page "Video" section: make, watch progress, play, remake or delete. */
export function VideoPanel({ slug, video }: { slug: string; video: Video }) {
  const { status, otherRunning, busy, start, remove } = video;
  const [aspect, setAspect] = useState<VideoAspect>(status?.aspect ?? "9:16");
  const [length, setLength] = useState(45);
  const active = isActive(status);
  const now = useNow(active);
  const blocked = Boolean(otherRunning) || busy;

  const otherNote = otherRunning ? (
    <p role="status" className="mt-3 text-[12.5px] text-muted-foreground">
      A video for{" "}
      <Link href={`/p/${otherRunning}`} className="font-medium text-ink underline">
        {otherRunning}
      </Link>{" "}
      is being made. One video at a time.
    </p>
  ) : null;

  if (active && status) {
    return (
      <div role="status" aria-live="polite" className="rounded-[12px] border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[14px] font-medium text-ink">
            <Loader2 className="size-4 shrink-0 animate-spin text-brand" aria-hidden />
            <span className="truncate">{status.stage ?? (status.state === "queued" ? "Queued" : "Making video")}</span>
          </div>
          <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
            {elapsedLabel(status.startedAt, now)}
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          {status.aspect ?? "9:16"} video. This takes several minutes; you can leave this page.
        </p>
        <Log log={status.log} />
      </div>
    );
  }

  if (status?.state === "ready" && status.url) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-muted-foreground">
          {status.aspect ?? "9:16"}
          {status.durationSec ? `, ${Math.round(status.durationSec)}s` : ""}
          {status.finishedAt ? `, made ${new Date(status.finishedAt).toLocaleString()}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={status.url} download={`${slug}.mp4`} className={btn}>
            <Download className="size-3.5" aria-hidden /> Download
          </a>
          <Confirm
            title="Remake this video?"
            body={`The current video is replaced by a new ${aspect}, ${length}s render. This takes several minutes.`}
            action="Remake"
            onConfirm={() => start(aspect, length)}
            trigger={
              <button type="button" className={btn} disabled={blocked}>
                <RotateCcw className="size-3.5" aria-hidden /> Remake
              </button>
            }
          />
          <Confirm
            title="Delete this video?"
            body="The MP4 and its status are removed. The post and slides stay."
            action="Delete"
            onConfirm={remove}
            trigger={
              <button type="button" className={btn} disabled={busy}>
                <Trash2 className="size-3.5" aria-hidden /> Delete
              </button>
            }
          />
        </div>
        <details className="text-[13px]">
          <summary className="cursor-pointer text-muted-foreground">Remake options</summary>
          <div className="mt-2 flex flex-col gap-2">
            <Segmented label="Aspect" options={ASPECTS} value={aspect} onChange={setAspect} />
            <Segmented label="Length" options={LENGTHS} value={length} onChange={setLength} format={(v) => `${v}s`} />
          </div>
        </details>
        {otherNote}
      </div>
    );
  }

  const failed = status?.state === "failed";
  return (
    <div className="rounded-[12px] border border-line bg-surface p-4">
      {failed ? (
        <div role="alert" className="mb-3 flex gap-2 text-[13.5px]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-ink">The video failed</p>
            <p className="break-words text-muted-foreground">{status?.error ?? "Unknown error"}</p>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-2 text-[14px] font-medium text-ink">
          <Clapperboard className="size-4 text-brand" aria-hidden /> Make a short video of this post
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Segmented label="Aspect" options={ASPECTS} value={aspect} onChange={setAspect} disabled={blocked} />
        <Segmented label="Length" options={LENGTHS} value={length} onChange={setLength} format={(v) => `${v}s`} disabled={blocked} />
      </div>
      <button
        type="button"
        onClick={() => start(aspect, length)}
        disabled={blocked}
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-brand px-5 text-[14px] font-semibold text-brand-ink transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : failed ? <RotateCcw className="size-4" aria-hidden /> : <Clapperboard className="size-4" aria-hidden />}
        {failed ? "Retry" : "Make video"}
      </button>
      <p className="mt-2 text-[12px] text-muted-foreground">
        Uses your HyperFrames skill through a local claude agent; takes several minutes.
      </p>
      {failed && <Log log={status?.log ?? []} />}
      {otherNote}
    </div>
  );
}
