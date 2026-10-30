"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, ChevronDown, CloudUpload, FolderOpen, Loader2, RefreshCw, Sparkles } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { RelativeTime } from "@/components/shell/relative-time";
import type { PendingSource, SpaceStatus } from "@/lib/server/space";

export type SpaceSnapshot = {
  config: { project: string | null; autoGenerate: boolean; connectedAt?: string };
  status: SpaceStatus;
  hubUrl: string | null;
  generating: string | null;
  pending: PendingSource[];
};

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40";
const primary = `${btn} bg-brand text-brand-ink hover:opacity-90`;
const secondary = `${btn} border border-line-strong bg-surface text-ink hover:bg-surface-2`;

const PILL: Record<SpaceStatus["state"], { label: string; className: string }> = {
  off: { label: "Off", className: "bg-surface-3 text-muted-foreground" },
  connecting: { label: "Connecting", className: "bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-[var(--warn)]" },
  syncing: { label: "Syncing", className: "bg-brand-soft text-brand" },
  idle: { label: "In sync", className: "bg-brand-soft text-brand" },
  conflict: { label: "Conflict", className: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]" },
  error: { label: "Error", className: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)]" },
};

async function post(body: object): Promise<SpaceSnapshot & { error?: string }> {
  const res = await fetch("/api/space", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: "Bad response" }));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data });
  return data;
}

/** Poll /api/space while the page is visible. */
export function useSpace(intervalMs = 3000) {
  const [snap, setSnap] = useState<SpaceSnapshot | null>(null);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/space", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setSnap(await res.json());
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      void refresh();
      timer ??= setInterval(refresh, intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh, intervalMs]);
  return { snap, setSnap, refresh };
}

export function SpaceCard() {
  const router = useRouter();
  const { snap, setSnap } = useSpace(3000);
  const [project, setProject] = useState("quirq/curie");
  const [busy, setBusy] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  async function act(name: string, body: object, success?: string) {
    setBusy(name);
    try {
      const data = await post(body);
      setSnap(data);
      if (success) toast.success(success);
      router.refresh();
      return data;
    } catch (error) {
      const data = (error as { data?: SpaceSnapshot }).data;
      if (data?.status) setSnap(data);
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const connected = Boolean(snap?.config.project);
  const s = snap?.status;
  const pill = PILL[s?.state ?? "off"];

  return (
    <section aria-label="Space" className="mb-6 rounded-[var(--radius)] border border-line bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CloudUpload className="size-4 text-brand" />
            <h2 className="text-[15px] font-semibold">Space</h2>
            {snap && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill.className}`} aria-live="polite">
                {s?.state === "syncing" || s?.state === "connecting" ? <Loader2 className="size-3 animate-spin" /> : null}
                {pill.label}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Posts, media, videos and uploaded sources sync both ways with a Spacehub project. Saves, pins, notes and read state stay on this machine.
          </p>
        </div>
        {connected && snap?.hubUrl && (
          <a href={snap.hubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-sm text-brand hover:underline">
            {snap.config.project}
            <ArrowUpRight className="size-3.5" />
          </a>
        )}
      </div>

      {!snap ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : !connected ? (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void act("connect", { action: "connect", project }, `Connected to ${project}`);
          }}
        >
          <label className="sr-only" htmlFor="space-project">Spacehub project</label>
          <input
            id="space-project"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="space/project"
            pattern="[A-Za-z0-9][A-Za-z0-9._\-]*/[A-Za-z0-9][A-Za-z0-9._\-]*"
            className="h-10 min-w-0 flex-1 rounded-full border border-line-strong bg-bg px-4 font-mono text-sm outline-none focus-visible:border-[var(--focus)]"
          />
          <button type="submit" className={primary} disabled={busy !== null}>
            {busy === "connect" ? <Loader2 className="size-4 animate-spin" /> : null}
            Connect
          </button>
          {s?.state === "error" && s.lastError && <p className="text-sm text-[var(--danger)] sm:hidden">{s.lastError}</p>}
        </form>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Last push</dt>
              <dd className="font-medium">{s?.lastPush ? <RelativeTime iso={s.lastPush} /> : "not yet"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last pull</dt>
              <dd className="font-medium">{s?.lastPull ? <RelativeTime iso={s.lastPull} /> : "not yet"}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-xs text-muted-foreground">Connected</dt>
              <dd className="font-medium">{snap.config.connectedAt ? <RelativeTime iso={snap.config.connectedAt} /> : "now"}</dd>
            </div>
          </dl>

          {s?.state === "conflict" && (
            <div className="rounded-[var(--radius)] border border-[color-mix(in_oklab,var(--danger)_40%,transparent)] p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-[var(--danger)]">
                <AlertTriangle className="size-4" /> Sync paused on a conflict
              </p>
              <p className="mt-1 text-muted-foreground">
                Someone changed the same file in the space. Rebase again to keep both sets of changes, or open the folder and fix it by hand (git status shows the files), then sync again.
              </p>
              {s.gitStatus && <pre className="mt-2 max-h-40 overflow-auto rounded bg-surface-2 p-2 font-mono text-xs">{s.gitStatus}</pre>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={primary} disabled={busy !== null} onClick={() => act("sync", { action: "syncNow" }, "Rebasing again")}>
                  Keep both by rebasing again
                </button>
                <button type="button" className={secondary} disabled={busy !== null} onClick={() => act("open", { action: "openFolder" })}>
                  <FolderOpen className="size-4" /> Open folder
                </button>
              </div>
            </div>
          )}
          {s?.state === "error" && s.lastError && <p className="text-sm text-[var(--danger)]">{s.lastError}</p>}

          <label className="flex items-start justify-between gap-4 rounded-[var(--radius)] bg-surface-2 p-3">
            <span className="text-sm">
              <span className="font-medium">Auto-generate incoming sources</span>
              <span className="block text-muted-foreground">
                When a source arrives from the space without a post, write its post here automatically. Off: it waits in the list below.
              </span>
            </span>
            <Switch
              checked={snap.config.autoGenerate}
              disabled={busy !== null}
              onCheckedChange={(value) => act("auto", { action: "setAutoGenerate", value })}
              aria-label="Auto-generate incoming sources"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondary} disabled={busy !== null} onClick={() => act("sync", { action: "syncNow" }, "Sync restarted")}>
              <RefreshCw className={`size-4 ${busy === "sync" ? "animate-spin" : ""}`} /> Sync now
            </button>
            <button type="button" className={secondary} disabled={busy !== null} onClick={() => setConfirmOff(true)}>
              Disconnect
            </button>
            <button type="button" className={`${btn} text-muted-foreground hover:text-ink`} onClick={() => setShowLog((v) => !v)} aria-expanded={showLog}>
              Log <ChevronDown className={`size-4 transition ${showLog ? "rotate-180" : ""}`} />
            </button>
          </div>
          {showLog && (
            <pre className="max-h-64 overflow-auto rounded-[var(--radius)] bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed">
              {s?.log.length ? s.log.join("\n") : "No output yet."}
            </pre>
          )}
        </div>
      )}

      {snap && snap.pending.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Pending from space ({snap.pending.length})</h3>
            <button
              type="button"
              className={primary}
              disabled={busy !== null || Boolean(snap.generating)}
              onClick={() => act("all", { action: "generatePending" }, "Generated pending sources")}
            >
              {busy === "all" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Generate all
            </button>
          </div>
          <ul className="mt-3 divide-y divide-line">
            {snap.pending.map((p) => (
              <li key={p.slug} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">sources/{p.slug}</span> · added <RelativeTime iso={p.addedAt} />
                    {p.error ? <span className="text-[var(--danger)]"> · failed: {p.error}</span> : null}
                  </p>
                </div>
                <button
                  type="button"
                  className={secondary}
                  disabled={busy !== null || Boolean(snap.generating)}
                  onClick={() => act(p.slug, { action: "generatePending", slugs: [p.slug] }, `Generated ${p.name}`)}
                >
                  {busy === p.slug || snap.generating === p.slug ? <Loader2 className="size-4 animate-spin" /> : null} Generate
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect from {snap?.config.project}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sync stops and everything in the space is copied back to this machine, so nothing disappears here. The space itself is not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => act("off", { action: "disconnect" }, "Disconnected")}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Tiny sidebar indicator: green idle, pulsing syncing, amber pending, red conflict/error. */
export function SyncDot() {
  const { snap } = useSpace(10_000);
  if (!snap || (!snap.config.project && !snap.pending.length)) return null;
  const st = snap.status.state;
  const [color, label, pulse] =
    st === "conflict" || st === "error"
      ? ["var(--danger)", st === "conflict" ? "Space sync conflict" : "Space sync error", false]
      : snap.pending.length
        ? ["var(--warn)", `${snap.pending.length} pending from space`, false]
        : st === "syncing" || st === "connecting"
          ? ["#83d63a", "Space syncing", true]
          : ["#83d63a", "Space in sync", false];
  return (
    <Link href="/sources" className="flex items-center gap-1.5 text-xs text-faint hover:text-ink" title={label} aria-label={label}>
      <span className={`size-2 rounded-full ${pulse ? "animate-pulse" : ""}`} style={{ background: color }} />
      <span className="max-w-24 truncate">{snap.config.project ?? "pending"}</span>
    </Link>
  );
}
