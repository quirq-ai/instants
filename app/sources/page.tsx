import { Page, PageHeader } from "@/components/shell/page-header";
import { SourcesView } from "@/components/sources/sources-view";
import { SpaceCard } from "@/components/sources/space-card";
import { redirect } from "next/navigation";
import { hubMode } from "@/lib/research/hub";
import { getActivity, getRecords, getSourceStatus } from "@/lib/research/library";

export const metadata = { title: "Sources" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  // A hub-backed deploy (Vercel) is view only.
  if (hubMode()) redirect("/");
  const [sources, records, activity] = await Promise.all([getSourceStatus(), getRecords(), getActivity()]);
  const titles = Object.fromEntries(records.map((r) => [r.slug, r.post.title]));
  return (
    <Page wide>
      <PageHeader
        eyebrow="Watched folders"
        title="Sources"
        description="Every folder Instants watches, and whether it has a post yet. New and changed folders can be posted in one go. A deleted post's folder stays out until you restore it."
      />
      <SpaceCard />
      <SourcesView sources={sources} titles={titles} hidden={activity.hidden} />
    </Page>
  );
}
