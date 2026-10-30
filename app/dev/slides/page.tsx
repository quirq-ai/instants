import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/shell/page-header";
import { Slide } from "@/components/slides/slide";
import { SlideCarousel } from "@/components/slides/carousel";
import { FIXTURES, FIXTURE_ACCENTS, FIXTURE_SOURCES } from "@/components/slides/fixtures";

export const metadata: Metadata = { title: "Slide gallery" };

export default function SlidesGalleryPage() {
  const deck = FIXTURES.filter((_, i) => [0, 4, 7, 16, 18, 20, 25, 27, 29, 32].includes(i)).map((f) => f.slide);
  return (
    <Page wide>
      <PageHeader eyebrow="Dev" title="Slide gallery" description="Every slide type and edge case, at feed size in three accents, plus one detail carousel." />

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold text-ink-2">Detail carousel</h2>
        <div className="max-w-[700px]">
          <SlideCarousel slides={deck} accent={FIXTURE_ACCENTS[1]} title="Teaching agents to remember" sources={FIXTURE_SOURCES} size="detail" />
        </div>
      </section>

      {FIXTURE_ACCENTS.map((accent) => (
        <section key={accent} className="mb-12">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-2">
            <span className="size-3 rounded-full" style={{ background: accent }} /> Accent <span className="font-mono text-xs text-muted-foreground">{accent}</span>
          </h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {FIXTURES.map((f, i) => (
              <figure key={f.name} className="m-0 min-w-0">
                <div className="overflow-hidden rounded-[var(--radius)] shadow-[var(--shadow)]">
                  <Slide slide={f.slide} accent={accent} index={i} total={FIXTURES.length} title="Teaching agents to remember" sources={FIXTURE_SOURCES} />
                </div>
                <figcaption className="mt-1.5 font-mono text-xs text-muted-foreground">{f.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </Page>
  );
}
