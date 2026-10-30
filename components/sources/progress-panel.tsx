"use client";

import Link from "next/link";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { finishedCount, type JobState, type RowStatus } from "./use-generate";

const LABEL: Record<RowStatus, string> = {
  queued: "Queued",
  collecting: "Collecting",
  writing: "Writing",
  rendering: "Rendering",
  cached: "Up to date",
  skipped: "Skipped",
  done: "Done",
  error: "Error",
};

/** Live view of a generation job, fed by the NDJSON stream. */
export function ProgressPanel({ job }: { job: JobState }) {
  const finished = finishedCount(job);
  const total = Math.max(job.total, job.order.length);
  const pct = total ? Math.round((finished / total) * 100) : job.phase === "running" ? 0 : 100;
  const running = job.phase === "running";

  return (
    <section
      aria-labelledby="job-title"
      aria-live="polite"
      className="rounded-[var(--radius)] border border-line bg-surface p-4 shadow-[var(--shadow)] md:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="job-title" className="font-display text-2xl">
          {running ? "Writing posts" : job.phase === "failed" ? "Job stopped" : "Job finished"}
        </h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {finished} of {total} · {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Overall progress"
        className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      {job.error && (
        <p role="alert" className="mt-3 flex gap-2 text-sm text-[var(--danger)]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {job.error.message}
        </p>
      )}
      {job.order.length > 0 && (
        <ul className="mt-4 max-h-80 divide-y divide-line overflow-y-auto rounded-[var(--radius-sm)] border border-line">
          {job.order.map((name) => {
            const row = job.rows[name];
            const active = row.status === "collecting" || row.status === "writing" || row.status === "rendering";
            return (
              <li key={name} className="flex items-start gap-3 px-3 py-2 text-sm">
                <span className="mt-0.5 shrink-0">
                  {row.status === "error" ? (
                    <AlertTriangle className="size-4 text-[var(--danger)]" aria-hidden />
                  ) : active ? (
                    <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
                  ) : (
                    <Check className="size-4 text-muted-foreground" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    {row.slug ? (
                      <Link href={`/p/${row.slug}`} className="truncate font-medium text-ink hover:underline">
                        {name}
                      </Link>
                    ) : (
                      <span className="truncate font-medium text-ink">{name}</span>
                    )}
                    <span className={`shrink-0 text-xs ${row.status === "error" ? "text-[var(--danger)]" : "text-muted-foreground"}`}>
                      {LABEL[row.status]}
                    </span>
                  </div>
                  {row.detail && <p className="break-words text-xs text-muted-foreground">{row.detail}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!running && (
        <p className="mt-3 text-sm text-muted-foreground">
          {job.posts} posted{job.failed ? `, ${job.failed} failed` : ""}.
        </p>
      )}
    </section>
  );
}
