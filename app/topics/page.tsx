import type { Metadata } from "next";
import Link from "next/link";
import { Page, PageHeader } from "@/components/shell/page-header";
import { TopicTile } from "@/components/topics/topic-tile";
import { getActivity, getRecords } from "@/lib/research/library";
import { TOPICS } from "@/lib/research/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Topics" };

export default async function TopicsPage() {
  const [all, activity] = await Promise.all([getRecords(), getActivity()]);
  const hidden = new Set(activity.hidden);
  const visible = all.filter((r) => !hidden.has(r.slug));
  const groups = TOPICS.map((topic) => ({ topic, records: visible.filter((r) => r.post.topic === topic) }))
    .filter((g) => g.records.length)
    .sort((a, b) => b.records.length - a.records.length);

  return (
    <Page wide>
      <PageHeader
        title="Topics"
        description={groups.length ? `${visible.length} posts across ${groups.length} topics.` : "Posts grouped by what they are about."}
      />
      {groups.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <TopicTile key={g.topic} topic={g.topic} records={g.records} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center rounded-[var(--radius)] border border-dashed border-line-strong px-6 py-16 text-center">
          <h2 className="font-display text-[28px]">No topics yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Topics appear as soon as the first post is written.</p>
          <Link href="/add" className="mt-4 rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
            Add research
          </Link>
        </div>
      )}
    </Page>
  );
}
