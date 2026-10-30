import { Page } from "@/components/shell/page-header";

export default function Loading() {
  return (
    <Page>
      <div className="animate-pulse pt-10" aria-busy="true" aria-label="Loading">
        <div className="h-10 w-48 rounded-lg bg-surface-2" />
        <div className="mt-3 h-4 w-72 rounded bg-surface-2" />
        {[0, 1].map((i) => (
          <div key={i} className="mt-8 rounded-[var(--radius)] border border-line bg-surface p-4">
            <div className="h-5 w-40 rounded bg-surface-2" />
            <div className="mt-4 aspect-[4/5] w-full rounded-lg bg-surface-2" />
            <div className="mt-4 h-4 w-3/4 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </Page>
  );
}
