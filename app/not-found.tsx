import Link from "next/link";
import { Page } from "@/components/shell/page-header";

export default function NotFound() {
  return (
    <Page>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-faint">404</p>
        <h1 className="mt-2 font-display text-[44px] leading-none">Nothing filed here</h1>
        <p className="mt-3 max-w-sm text-muted-foreground">
          This page does not exist. It may have been renamed, or the research was never posted.
        </p>
        <div className="mt-6 flex gap-2">
          <Link href="/" className="rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
            Back to feed
          </Link>
          <Link href="/library" className="rounded-[10px] border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2">
            Browse library
          </Link>
        </div>
      </div>
    </Page>
  );
}
