"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, FolderSearch, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RelativeTime } from "@/components/shell/relative-time";
import type { SourceStatus } from "@/lib/research/types";
import { useGenerate } from "./use-generate";
import { ProgressPanel } from "./progress-panel";

type State = SourceStatus["folders"][number]["state"];
type Folder = SourceStatus["folders"][number] & { root: string };

const STATES: State[] = ["posted", "new", "changed", "skipped", "failed"];

export const STATE_STYLE: Record<State, { label: string; className: string }> = {
  posted: { label: "Posted", className: "bg-brand-soft text-brand" },
  new: { label: "New", className: "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-[var(--warn)]" },
  changed: { label: "Changed", className: "bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] text-[var(--warn)]" },
  skipped: { label: "Skipped", className: "bg-surface-3 text-muted-foreground" },
  failed: { label: "Failed", className: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]" },
};

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${btn} bg-brand text-brand-ink hover:opacity-90`;
const secondary = `${btn} border border-line-strong bg-surface text-ink hover:bg-surface-2`;

export function SourcesView({ sources, titles }: { sources: SourceStatus[]; titles: Record<string, string> }) {
  const router = useRouter();
  const { state: job, runJson } = useGenerate();
  const [filter, setFilter] = useState<State | "all">("all");
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const busy = job.phase === "running";

  const folders: Folder[] = useMemo(
    () => sources.flatMap((s) => s.folders.map((f) => ({ ...f, root: s.root }))),
    [sources],
  );
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<State, number>;
    for (const f of folders) c[f.state]++;
    return c;
  }, [folders]);
  const pending = counts.new + counts.changed;
  const visible = folders.filter(
    (f) => (filter === "all" || f.state === filter) && f.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  async function scan(quiet = false) {
    setScanning(true);
    try {
      const res = await fetch("/api/sources");
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      router.refresh();
      if (!quiet) toast.success("Scan complete");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  // First visit: nothing scanned yet, so scan once automatically.
  useEffect(() => {
    if (sources.length === 0) void scan(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generate(body: Parameters<typeof runJson>[0]) {
    const result = await runJson(body);
    router.refresh();
    if (result.phase === "failed" && result.error) toast.error(result.error.message);
    else toast.success(`Finished: ${result.posts} posted${result.failed ? `, ${result.failed} failed` : ""}`);
  }

  if (sources.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
        {scanning ? (
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <FolderSearch className="size-8 text-muted-foreground" aria-hidden />
        )}
        <h2 className="font-display text-2xl">{scanning ? "Scanning your folders" : "No folders scanned yet"}</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {scanning
            ? "Looking through the watched roots for research folders. This takes a few seconds."
            : "Scan the watched roots to see which folders can become posts."}
        </p>
        {!scanning && (
          <button type="button" onClick={() => scan()} className={primary}>
            Scan now
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      <section aria-label="Watched roots" className="rounded-[var(--radius)] border border-line bg-surface p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ul className="min-w-0 space-y-1">
            {sources.map((s) => (
              <li key={s.root} className="min-w-0">
                <span className="block truncate font-mono text-[13px] text-ink" title={s.root}>
                  {s.root}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.folders.length} folders · scanned {s.scannedAt ? <RelativeTime iso={s.scannedAt} withTime /> : "never"}
                </span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => scan()} disabled={scanning || busy} className={secondary}>
            <RefreshCw className={`size-4 ${scanning ? "animate-spin" : ""}`} aria-hidden />
            {scanning ? "Scanning" : "Rescan"}
          </button>
        </div>
        <SummaryBar counts={counts} total={folders.length} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || pending === 0}
            onClick={() => generate({ all: true })}
            className={primary}
          >
            {pending === 0 ? "Everything is posted" : `Post ${pending} new and changed`}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirm(true)} className={secondary}>
            Regenerate all
          </button>
        </div>
      </section>

      {job.phase !== "idle" && <ProgressPanel job={job} />}

      <section aria-label="Folders" className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div role="group" aria-label="Filter by state" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {(["all", ...STATES] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--focus)] ${
                  filter === s ? "border-transparent bg-ink text-[var(--bg)]" : "border-line bg-surface text-ink-2 hover:bg-surface-2"
                }`}
              >
                {s === "all" ? "All" : STATE_STYLE[s].label}{" "}
                <span className="tabular-nums opacity-70">{s === "all" ? folders.length : counts[s]}</span>
              </button>
            ))}
          </div>
          <label className="relative block md:w-64">
            <span className="sr-only">Search folders</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search folders"
              className="w-full rounded-full border border-line bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
            />
          </label>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-[var(--radius)] border border-dashed border-line-strong px-6 py-10 text-center text-sm text-muted-foreground">
            No folders match {query ? `"${query}"` : "this filter"}.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius)] border border-line bg-surface">
            {visible.map((f) => (
              <FolderRow
                key={f.path}
                folder={f}
                title={f.slug ? titles[f.slug] : undefined}
                live={job.rows[f.name]?.status}
                disabled={busy}
                onRun={() => generate({ targets: [f.path], force: f.state === "posted" })}
              />
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate every post?</AlertDialogTitle>
            <AlertDialogDescription>
              Recall will rewrite all {folders.length - counts.skipped} folders from scratch. This calls Claude for each
              one and can take many minutes. Existing posts are replaced as they finish.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => generate({ all: true, force: true })}>Regenerate all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryBar({ counts, total }: { counts: Record<State, number>; total: number }) {
  const colors: Record<State, string> = {
    posted: "var(--brand)",
    new: "var(--warn)",
    changed: "color-mix(in oklab, var(--warn) 55%, var(--surface))",
    skipped: "var(--line-strong)",
    failed: "var(--danger)",
  };
  return (
    <div className="mt-4">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={STATES.map((s) => `${counts[s]} ${s}`).join(", ")}
      >
        {STATES.map((s) =>
          counts[s] ? <div key={s} style={{ width: `${(counts[s] / Math.max(total, 1)) * 100}%`, background: colors[s] }} /> : null,
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 sm:grid-cols-5">
        {STATES.map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: colors[s] }} aria-hidden />
            <dt className="text-xs text-muted-foreground">{STATE_STYLE[s].label}</dt>
            <dd className="text-sm font-medium tabular-nums text-ink">{counts[s]}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function FolderRow({
  folder,
  title,
  live,
  disabled,
  onRun,
}: {
  folder: Folder;
  title?: string;
  live?: string;
  disabled: boolean;
  onRun: () => void;
}) {
  const style = STATE_STYLE[folder.state];
  const canRun = folder.state !== "skipped";
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink" title={folder.path}>
            {folder.name}
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.className}`}>
            {style.label}
          </span>
        </div>
        {folder.reason && (
          <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
            {folder.state === "failed" && <AlertTriangle className="mt-px size-3 shrink-0 text-[var(--danger)]" aria-hidden />}
            {folder.reason}
          </p>
        )}
        {folder.slug && title && (
          <Link
            href={`/p/${folder.slug}`}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand hover:underline"
          >
            {title} <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        )}
      </div>
      {live && <span className="font-mono text-xs text-muted-foreground">{live}</span>}
      {canRun && (
        <button
          type="button"
          disabled={disabled}
          onClick={onRun}
          aria-label={`${folder.state === "posted" ? "Regenerate" : "Create post for"} ${folder.name}`}
          className={folder.state === "posted" ? secondary : primary}
        >
          {folder.state === "posted" ? "Regenerate" : "Create post"}
        </button>
      )}
    </li>
  );
}
