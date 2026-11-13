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
  const liked = new Set(activity.liked);
  const shelf = initial.shelf === "liked" || initial.shelf === "hidden" ? initial.shelf : "";
  const records =
    shelf === "hidden" ? all.filter((r) => hidden.has(r.slug)) : shelf === "liked" ? all.filter((r) => liked.has(r.slug)) : all.filter((r) => !hidden.has(r.slug));
  const count = `${records.length} post${records.length === 1 ? "" : "s"}`;

  return (
    <Page wide>
      <PageHeader
        title="Library"
        description={shelf === "hidden" ? `Posts you hid. ${count}.` : shelf === "liked" ? `Posts you liked. ${count}.` : `Every post in one place. ${count}.`}
      />
      <LibraryBrowser
        key={shelf}
        records={records}
        initial={{ ...initial, shelf }}
        allCount={all.length - hidden.size}
        likedCount={liked.size}
        hiddenCount={hidden.size}
        read={Object.keys(activity.read)}
        videos={videos}
      />
    </Page>
  );
}
