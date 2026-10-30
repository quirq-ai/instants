import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/shell/page-header";
import { LibraryBrowser } from "@/components/library/library-browser";
import { LIBRARY_KEYS, type LibraryState } from "@/components/library/state";
import { getActivity, getRecords, getVideoStatuses } from "@/lib/research/library";

export const metadata: Metadata = { title: "Library" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const initial = Object.fromEntries(
    LIBRARY_KEYS.map((key) => [key, typeof params[key] === "string" ? params[key] : ""]),
  ) as LibraryState;
  const [all, activity, videos] = await Promise.all([getRecords(), getActivity(), getVideoStatuses()]);
  const hidden = new Set(activity.hidden);
  const hiddenCount = all.filter((r) => hidden.has(r.slug)).length;
  const records = initial.hidden ? all : all.filter((r) => !hidden.has(r.slug));

  return (
    <Page wide>
      <PageHeader
        title="Library"
        description={`Every post in one place. ${records.length} post${records.length === 1 ? "" : "s"}${initial.hidden ? ", including hidden" : ""}.`}
      />
      <LibraryBrowser
        key={initial.hidden}
        records={records}
        initial={initial}
        hiddenCount={hiddenCount}
        read={Object.keys(activity.read)}
        videos={videos}
      />
    </Page>
  );
}
