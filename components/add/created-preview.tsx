import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SlideThumb } from "@/components/slides";
import type { ResearchRecord } from "@/lib/research/types";

/** Shown after a successful upload: the new post's cover and next steps. */
export function CreatedPreview({ record, video }: { record: ResearchRecord; video?: string }) {
  const { post } = record;
  return (
    <section
      aria-labelledby="created-title"
      className="rounded-[var(--radius)] border border-line bg-surface p-5 shadow-[var(--shadow)] md:p-6"
    >
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--ok)]">
        <CheckCircle2 className="size-4" aria-hidden /> Post created
      </div>
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="w-full max-w-[260px] shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-line">
          <SlideThumb slide={post.slides[0]} accent={post.accent} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {post.kind} · {post.topic}
          </div>
          <h2 id="created-title" className="mt-1 font-display text-3xl leading-tight">
            {post.title}
          </h2>
          <p className="mt-2 text-[15px] text-ink-2">{post.hook}</p>
          <p className="mt-1 text-sm text-muted-foreground">{post.slides.length} slides</p>
          {video && (
            <p role="status" className="mt-3 rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3 text-sm text-ink-2">
              {video === "started" ? (
                <>
                  Making a video of this post. It takes several minutes;{" "}
                  <Link href={`/p/${record.slug}`} className="font-medium text-ink underline">
                    follow its progress on the post
                  </Link>
                  .
                </>
              ) : (
                <>
                  The video did not start: {video}.{" "}
                  <Link href={`/p/${record.slug}`} className="font-medium text-ink underline">
                    Try again from the post
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={`/p/${record.slug}`}
              className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-ink hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              Open post
            </Link>
            <Link
              href="/add"
              className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              Add another
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
