import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/page-header";
import { AddFlow } from "@/components/add/add-flow";
import { CreatedPreview } from "@/components/add/created-preview";
import { getRecord } from "@/lib/research/library";

export const metadata = { title: "Add research" };

export default async function AddPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; video?: string }>;
}) {
  const { created, video } = await searchParams;
  const record = created ? await getRecord(created) : null;

  return (
    <Page>
      <PageHeader
        eyebrow="Feed your research"
        title="Add research"
        description="Drop in notes, data, screenshots or code. Recall reads it and writes a carousel post you can browse later."
      />
      {record ? <CreatedPreview record={record} video={video} /> : <AddFlow missing={Boolean(created)} />}

      <section
        aria-labelledby="from-folder"
        className="mb-16 mt-10 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius)] border border-line bg-surface-2 p-5"
      >
        <div className="flex min-w-0 items-start gap-3">
          <FolderOpen className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <h2 id="from-folder" className="font-medium text-ink">
              Or post from a folder
            </h2>
            <p className="text-sm text-muted-foreground">
              Recall watches your experiment folders. Turn any new or changed folder into a post.
            </p>
          </div>
        </div>
        <Link
          href="/sources"
          className="rounded-full border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        >
          Open sources
        </Link>
      </section>
    </Page>
  );
}
