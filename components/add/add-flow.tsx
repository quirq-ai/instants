"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  File as FileIcon,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { bytes } from "@/lib/research/format";
import { useGenerate } from "@/components/sources/use-generate";
import { ASPECTS, startVideo, type VideoAspect } from "@/components/video/use-video";

const MAX = 50 * 1024 * 1024;
const STEPS = ["Reading files", "Writing post", "Preparing slides", "Done"];

function iconFor(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (/^(png|jpe?g|gif|webp|svg|heic|avif)$/.test(ext)) return FileImage;
  if (/^(mp4|mov|webm|mkv)$/.test(ext)) return FileVideo;
  if (/^(csv|tsv|xlsx?|json|parquet)$/.test(ext)) return FileSpreadsheet;
  if (/^(md|txt|pdf|docx?|rtf|html?)$/.test(ext)) return FileText;
  if (/^(ts|tsx|js|mjs|py|rs|go|rb|java|c|cpp|swift|sh|ipynb)$/.test(ext)) return FileCode;
  return FileIcon;
}

function useElapsed(start?: number, end?: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!start || end) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [start, end]);
  if (!start) return "0:00";
  const s = Math.max(0, Math.floor(((end ?? now) - start) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function AddFlow({ missing = false }: { missing?: boolean }) {
  const router = useRouter();
  const { state, runForm, reset } = useGenerate();
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [makeVideo, setMakeVideo] = useState(false);
  const [aspect, setAspect] = useState<VideoAspect>("9:16");
  const input = useRef<HTMLInputElement>(null);
  const elapsed = useElapsed(state.startedAt, state.finishedAt);

  const total = files.reduce((sum, f) => sum + f.size, 0) + text.length;
  const tooBig = total > MAX;
  const empty = files.length === 0 && !text.trim();
  const busy = state.phase === "running";

  const row = state.order.map((n) => state.rows[n]).find(Boolean);
  const slug = state.order.map((n) => state.rows[n]).find((r) => r.slug)?.slug;
  const step =
    state.phase === "finished" && slug
      ? 3
      : row?.status === "rendering"
        ? 2
        : row?.status === "writing"
          ? 1
          : 0;
  const rowError = state.order.map((n) => state.rows[n]).find((r) => r.status === "error");
  const error =
    state.error?.message ??
    (state.phase === "finished" && !slug
      ? rowError?.detail
        ? rowError.detail
        : "The generator finished without creating a post."
      : undefined);

  useEffect(() => {
    if (state.phase === "finished" && slug) {
      let cancelled = false;
      const go = (video?: string) => {
        if (!cancelled) router.push(`/add?created=${slug}${video ? `&video=${encodeURIComponent(video)}` : ""}`);
      };
      if (!makeVideo) {
        const id = setTimeout(() => go(), 600);
        return () => clearTimeout(id);
      }
      startVideo(slug, aspect)
        .then(() => go("started"))
        .catch((error: unknown) => go(error instanceof Error ? error.message : "Could not start the video"));
      return () => {
        cancelled = true;
      };
    }
  }, [state.phase, slug, router, makeVideo, aspect]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...incoming.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (empty || tooBig || busy) return;
    const form = new FormData();
    form.set("title", title);
    form.set("text", text);
    for (const file of files) form.append("files", file, file.name);
    await runForm(form);
  }

  if (state.phase !== "idle" && !(state.phase === "failed" && !state.startedAt)) {
    return (
      <section
        aria-live="polite"
        aria-labelledby="progress-title"
        className="rounded-[var(--radius)] border border-line bg-surface p-5 shadow-[var(--shadow)] md:p-6"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="progress-title" className="font-display text-2xl">
            {error ? "Could not create the post" : step === 3 ? "Post ready" : "Creating your post"}
          </h2>
          <span className="font-mono text-sm tabular-nums text-muted-foreground" aria-label={`Elapsed ${elapsed}`}>
            {elapsed}
          </span>
        </div>
        <ol className="mt-5 grid gap-3 sm:grid-cols-4">
          {STEPS.map((label, i) => {
            const done = i < step || (i === 3 && step === 3);
            const active = i === step && !done && !error;
            const failed = Boolean(error) && i === step;
            return (
              <li
                key={label}
                className="flex items-center gap-2.5 sm:flex-col sm:items-start"
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                    failed
                      ? "border-[var(--danger)] text-[var(--danger)]"
                      : done
                        ? "border-transparent bg-brand text-brand-ink"
                        : active
                          ? "border-[var(--brand)] text-brand"
                          : "border-line-strong text-faint"
                  }`}
                >
                  {failed ? (
                    <X className="size-3.5" aria-hidden />
                  ) : done ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : active ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className={`text-sm ${active || done ? "text-ink" : "text-muted-foreground"}`}>{label}</span>
              </li>
            );
          })}
        </ol>
        {row?.detail && !error && <p className="mt-4 truncate text-sm text-muted-foreground">{row.detail}</p>}
        {error && (
          <div role="alert" className="mt-5 flex gap-3 rounded-[var(--radius-sm)] border border-line bg-surface-2 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" aria-hidden />
            <div className="min-w-0">
              <p className="break-words text-ink">{error}</p>
              <button
                type="button"
                onClick={reset}
                className="mt-3 rounded-full border border-line-strong px-4 py-1.5 font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                Back to edit
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-describedby="formats">
      {missing && (
        <p role="status" className="rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3 text-sm text-muted-foreground">
          That post could not be found. It may still be writing, or it was removed.
        </p>
      )}
      {state.error && (
        <div role="alert" className="flex gap-3 rounded-[var(--radius-sm)] border border-line bg-surface-2 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" aria-hidden />
          <p className="text-ink">{state.error.message}</p>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label="Add files: drop them here or press Enter to choose"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius)] border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${
          dragging ? "border-[var(--brand)] bg-brand-soft" : "border-line-strong bg-surface hover:bg-surface-2"
        }`}
      >
        <UploadCloud className="size-9 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-medium text-ink">Drop files here, or click to choose</p>
          <p id="formats" className="mt-1 text-sm text-muted-foreground">
            Any format: notes, PDFs, CSVs, notebooks, code, images, video. Up to 50 MB in total.
          </p>
        </div>
        <input ref={input} type="file" multiple className="sr-only" tabIndex={-1} onChange={(e) => addFiles(e.target.files)} />
      </div>

      {files.length > 0 && (
        <ul aria-label="Selected files" className="divide-y divide-line rounded-[var(--radius)] border border-line bg-surface">
          {files.map((file, i) => {
            const Icon = iconFor(file.name);
            return (
              <li key={`${file.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{file.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{bytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove ${file.name}`}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <label htmlFor="add-text" className="mb-1.5 block text-sm font-medium text-ink">
          Notes, links or tables
        </label>
        <textarea
          id="add-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          placeholder="Paste findings, a results table, links to read, or what you were trying to learn."
          className="w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3.5 py-3 text-[15px] text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        />
      </div>

      <div>
        <label htmlFor="add-title" className="mb-1.5 block text-sm font-medium text-ink">
          Title <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id="add-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Instants will suggest one"
          className="w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        />
      </div>

      <fieldset className="rounded-[var(--radius-sm)] border border-line bg-surface px-3.5 py-3">
        <legend className="sr-only">Video</legend>
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={makeVideo}
            onChange={(e) => setMakeVideo(e.target.checked)}
            className="size-4 accent-[var(--brand)]"
          />
          Also make a video
        </label>
        {makeVideo && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span id="add-aspect" className="text-[13px] text-muted-foreground">
              Aspect
            </span>
            <div role="radiogroup" aria-labelledby="add-aspect" className="flex rounded-full border border-line p-0.5">
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={aspect === a}
                  onClick={() => setAspect(a)}
                  className={`h-8 rounded-full px-3 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-[var(--focus)] ${
                    aspect === a ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <p className="basis-full text-[12px] text-muted-foreground">
              Starts after the post is created. Uses your HyperFrames skill through a local claude agent; takes several minutes.
            </p>
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${tooBig ? "text-[var(--danger)]" : "text-muted-foreground"}`}>
          {tooBig
            ? `${bytes(total)} selected. Remove files to get under 50 MB.`
            : empty
              ? "Add a file or some text to start."
              : `${files.length} file${files.length === 1 ? "" : "s"}, ${bytes(total)}`}
        </p>
        <button
          type="submit"
          disabled={empty || tooBig || busy}
          className="w-full rounded-full bg-brand px-6 py-3 text-[15px] font-medium text-brand-ink hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          Create post
        </button>
      </div>
    </form>
  );
}
