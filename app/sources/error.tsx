"use client";

import { Page, PageHeader } from "@/components/shell/page-header";

export default function SourcesError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <Page wide>
      <PageHeader eyebrow="Watched folders" title="Sources" />
      <div role="alert" className="rounded-[var(--radius)] border border-line bg-surface p-6">
        <p className="font-medium text-ink">Could not read the source folders.</p>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full border border-line-strong px-4 py-2 text-sm font-medium hover:bg-surface-2"
        >
          Try again
        </button>
      </div>
    </Page>
  );
}
