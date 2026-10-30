import Link from "next/link";
import { Page } from "@/components/shell/page-header";

export default function PostNotFound() {
  return (
    <Page>
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <h1 className="font-display text-[40px] leading-none">This post is gone</h1>
        <p className="mt-3 max-w-sm text-muted-foreground">
          It may have been regenerated under a new name, or its research folder was removed.
        </p>
        <Link href="/library" className="mt-6 rounded-[10px] bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">
          Search the library
        </Link>
      </div>
    </Page>
  );
}
