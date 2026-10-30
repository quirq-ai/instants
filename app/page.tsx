import Link from "next/link";
import { Bookmark, Clapperboard, Compass, LayoutGrid, Plus, Sparkles } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/page-header";
import { FeedList } from "@/components/feed/feed-list";
import { FEED_TABS, orderFeed, spreadSameTitles, parseTab, type FeedTab } from "@/components/feed/order";
import { getActivity, getRecords, getVideoStatuses } from "@/lib/research/library";
import { topicSlug } from "@/lib/research/format";

type Media = "all" | "video";

function href(tab: FeedTab, topic?: string, media: Media = "all") {
  const params = new URLSearchParams();
  if (tab !== "latest") params.set("tab", tab);
  if (topic) params.set("topic", topic);
  if (media === "video") params.set("media", "video");
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

function Empty({ tab, filtered, total }: { tab: FeedTab; filtered: boolean; total: number }) {
  const copy =
    total === 0
      ? {
          icon: Sparkles,
          title: "No research posted yet",
          body: "Point Instants at a folder of experiments, notes or data and it will turn each one into a post.",
        }
      : filtered
        ? { icon: Compass, title: "Nothing matches these filters", body: "Try another topic, switch to All posts, or make a video from any post." }
        : tab === "saved"
          ? {
              icon: Bookmark,
              title: "Nothing saved yet",
              body: "Tap the bookmark on any post, or press s while a card is selected, to keep it here.",
            }
          : { icon: Compass, title: "Nothing to rediscover", body: "Every post is hidden. Unhide some from the library." };
  const Icon = copy.icon;
  return (
    <div className="flex flex-col items-center rounded-[var(--radius)] border border-dashed border-line-strong px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-4 font-display text-[28px] leading-tight">{copy.title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{copy.body}</p>
      <div className="mt-5 flex gap-2">
        {total === 0 ? (
          <Link href="/add" className="rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
            Add research
          </Link>
        ) : (
          <Link href="/" className="rounded-[10px] border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2">
            Back to Latest
          </Link>
        )}
      </div>
    </div>
  );
}

function feedSummary(total: number, unread: number, saved: number) {
  const parts = [`${total} post${total === 1 ? "" : "s"}`];
  if (unread) parts.push(`${unread} unread`);
  if (saved) parts.push(`${saved} saved`);
  return parts.join(", ");
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const tab = parseTab(params.tab);
  const topicParam = typeof params.topic === "string" ? params.topic : undefined;
  const [all, activity, videos] = await Promise.all([getRecords(), getActivity(), getVideoStatuses()]);
  const hidden = new Set(activity.hidden);
  const visible = all.filter((r) => !hidden.has(r.slug));
  const topics = [...new Set(visible.map((r) => r.post.topic))].sort();
  const topic = topics.find((t) => topicSlug(t) === topicParam);
  const media: Media = params.media === "video" ? "video" : "all";
  const hasVideo = (slug: string) => videos[slug]?.state === "ready" && Boolean(videos[slug]?.url);
  const videoCount = visible.filter((r) => hasVideo(r.slug)).length;
  const inTopic = (topic ? visible.filter((r) => r.post.topic === topic) : visible).filter(
    (r) => media === "all" || hasVideo(r.slug),
  );
  const records = tab === "saved" ? orderFeed(inTopic, activity, tab) : spreadSameTitles(orderFeed(inTopic, activity, tab));
  const unread = visible.filter((r) => !activity.read[r.slug]).length;

  return (
    <Page>
      <PageHeader
        title="Feed"
        description={
          visible.length
            ? feedSummary(visible.length, unread, activity.saved.filter((s) => !hidden.has(s)).length)
            : "Your research, as posts."
        }
        actions={
          <Link
            href="/add"
            className="hidden h-9 items-center gap-1.5 rounded-[10px] bg-brand px-3.5 text-sm font-semibold text-brand-ink transition hover:opacity-90 sm:flex"
          >
            <Plus className="size-4" strokeWidth={2.5} /> Add research
          </Link>
        }
      />

      <div className="flex items-end justify-between gap-3 border-b border-line">
      <nav aria-label="Feed views" className="flex gap-1">
        {FEED_TABS.map(({ id, label }) => {
          const current = id === tab;
          return (
            <Link
              key={id}
              href={href(id, topicParam, media)}
              aria-current={current ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition ${
                current ? "border-ink font-semibold text-ink" : "border-transparent text-muted-foreground hover:text-ink"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div role="group" aria-label="Show" className="mb-1.5 flex shrink-0 rounded-full border border-line bg-surface p-0.5 text-[13px]">
        {([
          { id: "all", label: "All posts", icon: LayoutGrid },
          { id: "video", label: `Videos${videoCount ? ` ${videoCount}` : ""}`, icon: Clapperboard },
        ] as const).map(({ id, label, icon: Icon }) => {
          const current = media === id;
          return (
            <Link
              key={id}
              href={href(tab, topicParam, id)}
              aria-current={current ? "true" : undefined}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition ${
                current ? "bg-ink text-bg" : "text-ink-2 hover:bg-surface-2"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </Link>
          );
        })}
      </div>
      </div>

      {topics.length > 1 && (
        <div className="-mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 py-3 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 md:[mask-image:none]">
          <Link
            href={href(tab, undefined, media)}
            aria-current={!topic ? "true" : undefined}
            className={`shrink-0 snap-start rounded-full border px-3 py-1 text-[13px] transition ${
              !topic ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:bg-surface-2"
            }`}
          >
            All
          </Link>
          {topics.map((t) => (
            <Link
              key={t}
              href={href(tab, topicSlug(t), media)}
              aria-current={t === topic ? "true" : undefined}
              className={`shrink-0 snap-start rounded-full border px-3 py-1 text-[13px] transition ${
                t === topic ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:bg-surface-2"
              }`}
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      <div className="pt-4">
        {records.length ? (
          <FeedList
            records={records}
            saved={activity.saved}
            pinned={activity.pinned}
            read={Object.keys(activity.read)}
            videos={videos}
          />
        ) : (
          <Empty tab={tab} filtered={Boolean(topic) || media === "video"} total={visible.length} />
        )}
      </div>
    </Page>
  );
}
