"use client";

import { useEffect } from "react";
import { Page } from "@/components/shell/page-header";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <Page>
      <div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="font-display text-[40px] leading-none">Something went sideways</h1>
        <p className="mt-3 max-w-sm text-muted-foreground">
          Instants could not load this page. Your research files are untouched.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-faint">ref {error.digest}</p>}
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
        >
          Try again
        </button>
      </div>
    </Page>
  );
}
