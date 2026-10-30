import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/page-header";
import { BarList, ColumnChart, Ring, Section, Stat, StackedBar } from "@/components/insights/charts";
import { getActivity, getRecords, getSourceStatus } from "@/lib/research/library";
import { bytes, compactNumber, relativeDate, topicSlug } from "@/lib/research/format";
import { TOPICS } from "@/lib/research/types";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

function tally(values: string[]) {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function InsightsPage() {
  const [all, activity, sources] = await Promise.all([getRecords(), getActivity(), getSourceStatus()]);
  const hidden = new Set(activity.hidden);
  const records = all.filter((r) => !hidden.has(r.slug));

  if (records.length === 0) {
    return (
      <Page wide>
        <PageHeader eyebrow="Your library" title="Insights" />
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <BarChart3 className="size-8 text-muted-foreground" aria-hidden />
          <h2 className="font-display text-2xl">Nothing to chart yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Insights appear once you have posts. Add some research or post your watched folders.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Link href="/add" className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:opacity-90">
              Add research
            </Link>
            <Link href="/sources" className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium hover:bg-surface-2">
              Open sources
            </Link>
          </div>
        </div>
      </Page>
    );
  }

  const folders = sources.flatMap((s) => s.folders);
  const eligible = folders.filter((f) => f.state !== "skipped").length;
  const covered = folders.filter((f) => f.state === "posted").length;
  const commits = records.reduce((s, r) => s + (r.meta?.git?.commits ?? 0), 0);
  const files = records.reduce((s, r) => s + (r.meta?.fileCount ?? 0), 0);
  const size = records.reduce((s, r) => s + (r.meta?.bytes ?? 0), 0);
  const slideTypes = tally(records.flatMap((r) => r.post.slides.map((s) => s.type)));
  const slideCount = slideTypes.reduce((s, [, n]) => s + n, 0);

  // Posts by month, continuous from first to last.
  const months = tally(records.map((r) => monthKey(r.occurredAt)));
  const keys = months.map(([k]) => k).sort();
  const series: { label: string; value: number }[] = [];
  if (keys.length) {
    const counts = new Map(months);
    const [fy, fm] = keys[0].split("-").map(Number);
    const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
    for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); m === 12 ? ((m = 1), y++) : m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const label = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", ...(m === 1 || series.length === 0 ? { year: "2-digit" } : {}) });
      series.push({ label, value: counts.get(key) ?? 0 });
    }
  }

  const topics = tally(records.map((r) => r.post.topic)).sort(
    (a, b) => b[1] - a[1] || TOPICS.indexOf(a[0] as never) - TOPICS.indexOf(b[0] as never),
  );
  const kinds = tally(records.map((r) => r.post.kind));
  const statuses = tally(records.map((r) => r.post.status));

  const langMap = new Map<string, number>();
  for (const r of records) {
    for (const l of r.meta?.languages ?? []) langMap.set(l.name, (langMap.get(l.name) ?? 0) + l.share * (r.meta.bytes || 1));
  }
  const langs = [...langMap.entries()].sort((a, b) => b[1] - a[1]);
  const langParts = langs.slice(0, 6).map(([label, value]) => ({ label, value }));
  const restLang = langs.slice(6).reduce((s, [, v]) => s + v, 0);
  if (restLang > 0) langParts.push({ label: "Other", value: restLang });

  const stack = tally(records.flatMap((r) => r.meta?.stack ?? [])).slice(0, 12);
  const active = records
    .filter((r) => r.meta?.git?.commits)
    .sort((a, b) => (b.meta.git?.commits ?? 0) - (a.meta.git?.commits ?? 0))
    .slice(0, 8);

  const opened = records.filter((r) => activity.read[r.slug]).length;
  const dusty = [...records]
    .sort((a, b) => {
      const ar = activity.read[a.slug] ? 1 : 0;
      const br = activity.read[b.slug] ? 1 : 0;
      return ar - br || a.occurredAt.localeCompare(b.occurredAt);
    })
    .slice(0, 6);

  return (
    <Page wide>
      <PageHeader
        eyebrow="Your library"
        title="Insights"
        description="What you have researched, when, and with what. A quiet look at the whole library."
      />
      <div className="space-y-5 pb-16">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Posts" value={String(records.length)} sub={`${slideCount} slides`} />
          <Stat
            label="Folders"
            value={eligible ? `${covered}/${eligible}` : String(records.length)}
            sub={eligible ? "covered by posts" : "not scanned yet"}
          />
          <Stat label="Commits" value={compactNumber(commits)} />
          <Stat label="Files" value={compactNumber(files)} />
          <Stat label="Size" value={bytes(size)} />
          <Stat label="Opened" value={`${opened}/${records.length}`} sub="posts read" />
        </dl>

        <Section title="Research over time" description="Posts by the month their research last changed.">
          <ColumnChart data={series} label="Posts per month" />
        </Section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Topic mix">
            <BarList
              items={topics.map(([label, value]) => ({ label, value, href: `/topics/${topicSlug(label)}` }))}
            />
          </Section>
          <Section title="Kinds and statuses">
            <div className="space-y-5">
              <StackedBar label="Kinds" parts={kinds.map(([label, value]) => ({ label, value }))} />
              <StackedBar label="Statuses" parts={statuses.map(([label, value]) => ({ label: label[0].toUpperCase() + label.slice(1), value }))} />
            </div>
          </Section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Languages" description="Share of code across the library, weighted by size.">
            {langParts.length ? (
              <StackedBar label="Languages" parts={langParts} />
            ) : (
              <p className="text-sm text-muted-foreground">No language data yet.</p>
            )}
          </Section>
          <Section title="Stack" description="Frameworks and runtimes, by number of projects.">
            {stack.length ? (
              <ul className="flex flex-wrap gap-2">
                {stack.map(([name, n]) => (
                  <li key={name} className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-sm">
                    <span className="text-ink">{name}</span>
                    <span className="tabular-nums text-muted-foreground">{n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No stack detected yet.</p>
            )}
          </Section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Section title="Most active projects" description="By git commits.">
            {active.length ? (
              <BarList
                items={active.map((r) => ({ label: r.post.title, value: r.meta.git?.commits ?? 0, href: `/p/${r.slug}` }))}
                format={(n) => `${n} commits`}
              />
            ) : (
              <p className="text-sm text-muted-foreground">None of these posts have git history.</p>
            )}
          </Section>
          <Section title="Slides by type">
            <BarList items={slideTypes.map(([label, value]) => ({ label, value }))} color="var(--ink-2)" />
          </Section>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
          <Section title="Reading progress">
            <div className="flex items-center gap-5">
              <Ring value={opened} total={records.length} label="Posts opened" />
              <p className="text-sm text-ink-2">
                You have opened <strong className="text-ink">{opened}</strong> of {records.length} posts.
                {records.length - opened > 0 && ` ${records.length - opened} are still waiting.`}
              </p>
            </div>
          </Section>
          <Section title="Gathering dust" description="Never opened, or the oldest research first.">
            <ul className="divide-y divide-line">
              {dusty.map((r) => (
                <li key={r.slug} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/p/${r.slug}`} className="min-w-0 truncate text-sm font-medium text-ink hover:underline">
                    {r.post.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {activity.read[r.slug] ? `opened ${relativeDate(activity.read[r.slug])}, researched ${relativeDate(r.occurredAt)}` : `never opened, ${relativeDate(r.occurredAt)}`}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </Page>
  );
}
