import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, PageHeader } from "@/components/shell/page-header";
import { PostCard } from "@/components/library/post-card";
import { topicSpan } from "@/components/topics/topic-tile";
import { getActivity, getRecords } from "@/lib/research/library";
import { TOPICS } from "@/lib/research/types";
import { compactNumber, topicSlug } from "@/lib/research/format";

type Props = { params: Promise<{ topic: string }> };

const findTopic = (slug: string) => TOPICS.find((t) => topicSlug(t) === slug);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const topic = findTopic((await params).topic);
  return { title: topic ?? "Topic not found" };
}

export default async function TopicPage({ params }: Props) {
  const topic = findTopic((await params).topic);
  if (!topic) notFound();
  const [all, activity] = await Promise.all([getRecords(), getActivity()]);
  const hidden = new Set(activity.hidden);
  const records = all.filter((r) => r.post.topic === topic && !hidden.has(r.slug));
  const kinds = [...records.reduce((m, r) => m.set(r.post.kind, (m.get(r.post.kind) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);
  const commits = records.reduce((s, r) => s + (r.meta.git?.commits ?? 0), 0);

  return (
    <Page wide>
      <PageHeader
        eyebrow={
          <Link href="/topics" className="hover:text-ink">
            Topics
          </Link>
        }
        title={topic}
        description={records.length ? topicSpan(records) : undefined}
      />
      {records.length > 0 && (
        <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-[10px] border border-line bg-surface p-3">
            <dt className="text-[12px] text-faint">Posts</dt>
            <dd className="font-display text-[30px] leading-none">{records.length}</dd>
          </div>
          <div className="rounded-[10px] border border-line bg-surface p-3">
            <dt className="text-[12px] text-faint">Commits</dt>
            <dd className="font-display text-[30px] leading-none">{compactNumber(commits)}</dd>
          </div>
          <div className="col-span-2 rounded-[10px] border border-line bg-surface p-3">
            <dt className="text-[12px] text-faint">Kinds</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {kinds.map(([kind, n]) => (
                <span key={kind} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12.5px] text-ink-2">
                  {kind} <span className="text-faint">{n}</span>
                </span>
              ))}
            </dd>
          </div>
        </dl>
      )}
      {records.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {records.map((r) => (
            <PostCard key={r.slug} record={r} unread={!activity.read[r.slug]} />
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--radius)] border border-dashed border-line-strong px-6 py-14 text-center">
          <h2 className="font-display text-[26px]">Nothing here yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">No visible posts are filed under {topic}.</p>
        </div>
      )}
    </Page>
  );
}
