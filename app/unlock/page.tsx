import { Page, PageHeader } from "@/components/shell/page-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unlock" };

export default async function UnlockPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const enabled = Boolean(process.env.INSTANTS_ADMIN_TOKEN);
  return (
    <Page>
      <PageHeader title="Unlock" description="Enter the admin token to save, generate and manage the space on this deploy." />
      {enabled ? (
        <form method="post" action="/api/unlock" className="flex max-w-sm flex-col gap-3">
          <input
            type="password"
            name="token"
            required
            autoComplete="current-password"
            placeholder="INSTANTS_ADMIN_TOKEN"
            className="h-11 rounded-[10px] border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
          />
          {error && <p className="text-sm text-danger">That token did not match.</p>}
          <button type="submit" className="h-11 rounded-[10px] bg-brand text-sm font-semibold text-brand-ink hover:opacity-90">
            Unlock
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">This server has no INSTANTS_ADMIN_TOKEN, so actions only work on localhost.</p>
      )}
    </Page>
  );
}
