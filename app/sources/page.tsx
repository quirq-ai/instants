import { Page, PageHeader } from "@/components/shell/page-header";
import { SourcesView } from "@/components/sources/sources-view";
import { SpaceCard } from "@/components/sources/space-card";
import { getRecords, getSourceStatus } from "@/lib/research/library";

export const metadata = { title: "Sources" };
export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const [sources, records] = await Promise.all([getSourceStatus(), getRecords()]);
  const titles = Object.fromEntries(records.map((r) => [r.slug, r.post.title]));
  return (
    <Page wide>
      <PageHeader
        eyebrow="Watched folders"
        title="Sources"
        description="Every folder Instants watches, and whether it has a post yet. New and changed folders can be posted in one go."
      />
      <SpaceCard />
      <SourcesView sources={sources} titles={titles} />
    </Page>
  );
}
