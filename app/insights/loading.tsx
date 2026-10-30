import { Page, PageHeader } from "@/components/shell/page-header";

export default function Loading() {
  return (
    <Page wide>
      <PageHeader eyebrow="Your library" title="Insights" />
      <div className="space-y-3" aria-busy="true" aria-label="Loading insights">
        <div className="h-20 animate-pulse rounded-[var(--radius)] bg-surface-2" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-[var(--radius-sm)] bg-surface-2" />
        ))}
      </div>
    </Page>
  );
}
