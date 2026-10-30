import Link from "next/link";
import { Clapperboard } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/page-header";
import { VideoGrid, type VideoItem } from "@/components/video/video-grid";
import { getActivity, getRecords, getVideoStatuses } from "@/lib/research/library";

export const dynamic = "force-dynamic";
export const metadata = { title: "Videos" };

export default async function VideosPage() {
  const [records, activity, statuses] = await Promise.all([getRecords(), getActivity(), getVideoStatuses()]);
  const hidden = new Set(activity.hidden);
  const items: VideoItem[] = records
    .filter((r) => statuses[r.slug] && !hidden.has(r.slug))
    .map((r) => ({
      slug: r.slug,
      title: r.post.title,
      topic: r.post.topic,
      accent: r.post.accent,
      status: statuses[r.slug],
    }));
  const ready = items
    .filter((i) => i.status.state === "ready" && i.status.url)
    .sort((a, b) => (b.status.finishedAt ?? "").localeCompare(a.status.finishedAt ?? ""));
  const running = items.filter((i) => i.status.state === "running" || i.status.state === "queued");
  const minutes = Math.round(ready.reduce((sum, i) => sum + (i.status.durationSec ?? 0), 0) / 60);

  return (
    <Page wide>
      <PageHeader
        title="Videos"
        description={
          ready.length
            ? `${ready.length} video${ready.length === 1 ? "" : "s"}${minutes ? `, about ${minutes} min in all` : ""}. Hover to preview, click to watch.`
            : "Short videos made from your posts with HyperFrames."
        }
      />
      {ready.length || running.length ? (
        <VideoGrid items={ready} running={running} />
      ) : (
        <div className="flex flex-col items-center rounded-[var(--radius)] border border-dashed border-line-strong px-6 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Clapperboard className="size-5" />
          </span>
          <h2 className="mt-4 font-display text-[28px] leading-tight">No videos yet</h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
            Open any post and use Make video in its Video panel. Finished videos collect here.
          </p>
          <Link href="/library" className="mt-5 rounded-[10px] border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2">
            Pick a post
          </Link>
        </div>
      )}
    </Page>
  );
}
