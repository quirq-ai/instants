import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Page } from "@/components/shell/page-header";
import { PostView, Section } from "@/components/post/post-view";
import { Markdown } from "@/components/post/markdown";
import { LanguagesBar, Sparkline } from "@/components/post/charts";
import { Notes } from "@/components/post/notes";
import { PostCard } from "@/components/library/post-card";
import { gitSpan, researchLabel } from "@/components/post/meta";
import { getActivity, getRecord, getRecords, getVideoStatus, relatedTo } from "@/lib/research/library";
import { bytes, dateRange, topicSlug } from "@/lib/research/format";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const record = await getRecord(slug);
  return record ? { title: record.post.title, description: record.post.hook } : { title: "Post not found" };
}

const STATUS_TONE: Record<string, string> = {
  shipped: "text-ok",
  working: "text-ok",
  prototype: "text-warn",
  idea: "text-muted-foreground",
  abandoned: "text-faint",
};

function Chip({ children, href }: { children: React.ReactNode; href?: string }) {
  const cls = "inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-surface-2`}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const [record, all, activity, video] = await Promise.all([getRecord(slug), getRecords(), getActivity(), getVideoStatus(slug)]);
  if (!record?.post?.slides?.length) notFound();
  const { post, meta } = record;
  const hiddenSet = new Set(activity.hidden);
  const visible = all.filter((r) => !hiddenSet.has(r.slug));
  const position = visible.findIndex((r) => r.slug === slug);
  const newer = position > 0 ? visible[position - 1] : null;
  const older = position >= 0 && position < visible.length - 1 ? visible[position + 1] : null;
  const related = relatedTo(record, visible, 6);
  const span = gitSpan(record);

  return (
    <Page wide>
      <nav className="flex items-center justify-between pt-5 text-[13px] text-muted-foreground" aria-label="Post navigation">
        <Link href="/" className="hover:text-ink">
          Feed
        </Link>
        <div className="flex gap-1">
          {newer ? (
            <Link href={`/p/${newer.slug}`} className="flex items-center gap-1 rounded-full px-2.5 py-1 hover:bg-surface-2" title={newer.post.title}>
              <ChevronLeft className="size-3.5" /> Newer
            </Link>
          ) : null}
          {older ? (
            <Link href={`/p/${older.slug}`} className="flex items-center gap-1 rounded-full px-2.5 py-1 hover:bg-surface-2" title={older.post.title}>
              Older <ChevronRight className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </nav>

      <div className="pt-4">
        <PostView
          record={record}
          saved={activity.saved.includes(slug)}
          pinned={activity.pinned.includes(slug)}
          hidden={hiddenSet.has(slug)}
          video={video}
          header={
            <header>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: post.accent }} aria-hidden />
                {post.kind} · {researchLabel(record)}
              </div>
              <h1 className="mt-2 font-display text-[40px] leading-[1.05] tracking-tight md:text-[52px]">{post.title}</h1>
              <p className="mt-2 text-[17px] leading-snug text-ink-2">{post.hook}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {record.origin === "upload" ? "From Curie space source" : "From local folder"}{" "}
                <span className="font-mono">{record.origin === "upload" ? (record.sourceDir ?? record.name) : record.name}</span>
              </p>
            </header>
          }
          meta={
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                <Chip href={`/topics/${topicSlug(post.topic)}`}>{post.topic}</Chip>
                <Chip href={`/library?kind=${encodeURIComponent(post.kind)}`}>{post.kind}</Chip>
                <Chip>
                  <span className={STATUS_TONE[post.status] ?? ""}>●</span> {post.status}
                </Chip>
                {meta.stack.map((s, i) => (
                  <Chip key={`${s}-${i}`} href={`/library?stack=${encodeURIComponent(s)}`}>
                    {s}
                  </Chip>
                ))}
              </div>
              <LanguagesBar languages={meta.languages} />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-4">
                <div>
                  <dt className="text-faint">Repo files</dt>
                  <dd className="font-medium">{meta.fileCount}</dd>
                </div>
                <div>
                  <dt className="text-faint">Files analyzed</dt>
                  <dd className="font-medium">{record.files?.length ?? 0}</dd>
                </div>
                <div>
                  <dt className="text-faint">Repo size</dt>
                  <dd className="font-medium">{bytes(meta.bytes)}</dd>
                </div>
                <div>
                  <dt className="text-faint">Repo commits</dt>
                  <dd className="font-medium">{meta.git?.commits ?? "none"}</dd>
                </div>
                <div>
                  <dt className="text-faint">Research</dt>
                  <dd className="font-medium">
                    {meta.git ? dateRange(meta.git.first, meta.git.last) : dateRange(record.occurredAt, record.occurredAt)}
                  </dd>
                </div>
              </dl>
            </div>
          }
          writeup={<Markdown source={post.writeup} />}
          aside={
            <>
              {meta.git && meta.git.activity.length > 1 && (
                <Section title="Git activity">
                  <Sparkline activity={meta.git.activity} accent={post.accent} />
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    Commits per week, last {meta.git.activity.length} active weeks{span ? `. ${span}` : ""}
                  </p>
                </Section>
              )}
              <Section title="Private notes">
                <Notes slug={slug} initial={activity.notes[slug] ?? []} />
              </Section>
              {post.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {post.tags.map((tag, i) => (
                    <Link
                      key={`${tag}-${i}`}
                      href={`/library?tag=${encodeURIComponent(tag)}`}
                      className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[12px] text-ink-2 hover:bg-surface-3"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}
            </>
          }
        />
      </div>

      {related.length > 0 && (
        <section className="mt-14 border-t border-line pt-6" aria-labelledby="related">
          <h2 id="related" className="mb-4 font-display text-[28px]">
            Related research
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {related.map((r) => (
              <PostCard key={r.slug} record={r} unread={!activity.read[r.slug]} />
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
