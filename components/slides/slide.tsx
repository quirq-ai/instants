"use client";

// Live React renderer for every Slide type. Designed at 1080x1350 logical px
// and scaled with container query units, so a slide looks the same at any width.

import { useState } from "react";
import { Check } from "lucide-react";
import type { Slide as SlideData, Source } from "@/lib/research/types";
import { SlideChart } from "./chart";
import { tokenize } from "./code-tokens";
import { SLIDE_LABELS, clamp, sizeByLength, slidePalette, u, type SlidePalette } from "./palette";

type Props = {
  slide: SlideData;
  accent: string;
  index?: number;
  total?: number;
  title?: string;
  sources?: Source[];
  className?: string;
};

/** A slide's heading for labels and indicators. */
export function slideHeading(slide: SlideData): string {
  if (slide.type === "quote") return slide.text;
  if (slide.type === "image") return slide.caption || "Image";
  return slide.heading;
}

/** One 4:5 slide card. The outer element is the size container. */
export function Slide({ slide, accent, index, total, title, sources, className }: Props) {
  const p = slidePalette(accent);
  const src = "src" in slide ? slide.src : undefined;
  const source = src ? sources?.find((s) => s.id === src) : undefined;
  const full = slide.type === "cover" || slide.type === "image" || slide.type === "quote" || slide.type === "takeaway";
  return (
    <div className={className} style={{ containerType: "inline-size", aspectRatio: "4 / 5", width: "100%" }}>
      <div
        data-slide
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: `radial-gradient(120% 70% at 100% 0%, ${p.bg2} 0%, ${p.bg} 60%)`,
          color: p.ink,
          fontFamily: "var(--font-sans)",
          fontSize: u(30),
          lineHeight: 1.4,
          display: "flex",
          flexDirection: "column",
          padding: `${u(72)} ${u(72)} ${u(56)}`,
          letterSpacing: "-0.005em",
        }}
      >
        <Body slide={slide} p={p} />
        <Footer p={p} title={title} index={index} total={total} source={source} srcId={src} overlay={full} type={slide.type} />
      </div>
    </div>
  );
}

function Kicker({ p, children }: { p: SlidePalette; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: u(14), fontFamily: "var(--font-mono)", fontSize: u(22), letterSpacing: "0.14em", textTransform: "uppercase", color: p.accent, marginBottom: u(22) }}>
      <span style={{ width: u(28), height: u(4), background: p.accent, borderRadius: u(2) }} />
      {children}
    </div>
  );
}

function Heading({ text, p, lines = 3 }: { text: string; p: SlidePalette; lines?: number }) {
  const size = sizeByLength(text, [[28, 68], [50, 60], [80, 52], [120, 44]], 38);
  return (
    <h3 style={{ margin: 0, fontSize: u(size), lineHeight: 1.12, fontWeight: 650, letterSpacing: "-0.025em", color: p.ink, textWrap: "balance", ...clamp(lines) }}>
      {text}
    </h3>
  );
}

function Header({ slide, p, label }: { slide: { heading: string; type: string }; p: SlidePalette; label?: string }) {
  return (
    <div style={{ flexShrink: 0, marginBottom: u(44) }}>
      <Kicker p={p}>{label ?? SLIDE_LABELS[slide.type]}</Kicker>
      <Heading text={slide.heading} p={p} />
    </div>
  );
}

const fill: React.CSSProperties = { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" };

function Body({ slide, p }: { slide: SlideData; p: SlidePalette }) {
  switch (slide.type) {
    case "cover":
      return <Cover slide={slide} p={p} />;
    case "bigNumbers": {
      const items = slide.items.slice(0, 4);
      const cols = items.length === 4 ? 2 : 1;
      return (
        <div style={fill}>
          <Header slide={slide} p={p} />
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: "1fr", gap: u(20) }}>
            {items.map((it, i) => {
              const big = sizeByLength(it.value, cols === 1 ? [[6, 150], [10, 120], [16, 90]] : [[3, 136], [5, 104], [8, 80], [12, 58]], cols === 1 ? 70 : 46);
              return (
                <div key={i} style={{ background: p.panel, border: `${u(2)} solid ${p.line}`, borderRadius: u(28), padding: u(36), display: "flex", flexDirection: "column", justifyContent: "flex-end", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                  <div style={{ fontSize: u(big), fontWeight: 700, lineHeight: 1, letterSpacing: "-0.04em", color: i === 0 ? p.accent : p.ink, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {it.value}
                  </div>
                  <div style={{ marginTop: u(16), fontSize: u(28), color: p.ink2, lineHeight: 1.3, ...clamp(2) }}>{it.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    case "chart": {
      const multi = slide.chart !== "donut" && slide.series.length > 1;
      const h = 760 - (slide.takeaway ? 90 : 0) - (multi ? 60 : 0);
      return (
        <div style={fill}>
          <Header slide={slide} p={p} label={`${SLIDE_LABELS.chart} · ${slide.chart === "stackedBar" ? "stacked" : slide.chart}`} />
          {multi && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: `${u(10)} ${u(28)}`, marginBottom: u(18), fontSize: u(24), color: p.ink2, maxHeight: u(76), overflow: "hidden" }}>
              {slide.series.map((s, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: u(10) }}>
                  <span style={{ width: u(20), height: u(20), borderRadius: u(5), background: p.series[i % p.series.length] }} />
                  {s.name}
                </span>
              ))}
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center" }}>
            <SlideChart kind={slide.chart} x={slide.x} series={slide.series} unit={slide.unit} palette={p} height={h} />
          </div>
          {slide.takeaway && (
            <div style={{ marginTop: u(24), paddingLeft: u(24), borderLeft: `${u(5)} solid ${p.accent}`, fontSize: u(30), color: p.ink, lineHeight: 1.35, ...clamp(2) }}>
              {slide.takeaway}
            </div>
          )}
        </div>
      );
    }
    case "table":
      return <Table slide={slide} p={p} />;
    case "timeline":
      return <Timeline slide={slide} p={p} />;
    case "code":
      return <Code slide={slide} p={p} />;
    case "image":
      return <ImageSlide slide={slide} p={p} />;
    case "quote": {
      const size = sizeByLength(slide.text, [[60, 96], [110, 80], [180, 66], [260, 54]], 46);
      return (
        <div style={{ ...fill, justifyContent: "center", paddingBottom: u(40) }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: u(260), lineHeight: 0.6, color: p.accent, height: u(120) }} aria-hidden>
            &ldquo;
          </div>
          <blockquote style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: u(size), lineHeight: 1.1, letterSpacing: "-0.01em", color: p.ink, ...clamp(9) }}>
            {slide.text}
          </blockquote>
          <div style={{ marginTop: u(48), display: "flex", alignItems: "center", gap: u(18), flexWrap: "wrap" }}>
            {slide.attribution && <span style={{ fontSize: u(28), color: p.ink2, ...clamp(1) }}>{slide.attribution}</span>}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: u(20), letterSpacing: "0.12em", textTransform: "uppercase", padding: `${u(6)} ${u(14)}`, borderRadius: u(999), border: `${u(2)} solid ${slide.verbatim ? p.accent : p.line}`, color: slide.verbatim ? p.accent : p.muted }}>
              {slide.verbatim ? "Verbatim" : "Paraphrased"}
            </span>
          </div>
        </div>
      );
    }
    case "flow":
      return <Flow slide={slide} p={p} />;
    case "compare":
      return (
        <div style={fill}>
          <Header slide={slide} p={p} />
          <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: u(20) }}>
            {[slide.left, slide.right].map((col, ci) => (
              <div key={ci} style={{ borderRadius: u(28), padding: u(36), minWidth: 0, minHeight: 0, overflow: "hidden", background: ci ? p.accentSoft : p.panel, border: `${u(2)} solid ${ci ? p.accent : p.line}` }}>
                <div style={{ fontSize: u(38), fontWeight: 650, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: u(28), ...clamp(2) }}>{col.title}</div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: u(20) }}>
                  {col.points.slice(0, 6).map((pt, i) => (
                    <li key={i} style={{ display: "flex", gap: u(14), fontSize: u(27), lineHeight: 1.3, color: p.ink2 }}>
                      <span style={{ flexShrink: 0, width: u(10), height: u(10), marginTop: u(14), borderRadius: "50%", background: ci ? p.accent : p.muted }} />
                      <span style={clamp(3)}>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      );
    case "checklist": {
      const items = slide.items.slice(0, 8);
      const done = slide.items.filter((i) => i.done).length;
      return (
        <div style={fill}>
          <Header slide={slide} p={p} label={`Checklist · ${done}/${slide.items.length} done`} />
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: u(items.length > 6 ? 14 : 20) }}>
            {items.map((it, i) => (
              <li key={i} style={{ display: "flex", alignItems: "center", gap: u(24), padding: `${u(items.length > 6 ? 18 : 24)} ${u(28)}`, borderRadius: u(22), background: p.panel, border: `${u(2)} solid ${p.line}` }}>
                <span style={{ flexShrink: 0, width: u(46), height: u(46), borderRadius: u(14), display: "grid", placeItems: "center", background: it.done ? p.accent : "transparent", border: `${u(3)} solid ${it.done ? p.accent : p.muted}`, color: p.onAccent }}>
                  {it.done && <Check style={{ width: u(30), height: u(30) }} strokeWidth={3.2} aria-label="done" />}
                </span>
                <span style={{ fontSize: u(30), lineHeight: 1.3, color: it.done ? p.ink : p.ink2, ...clamp(2) }}>{it.text}</span>
              </li>
            ))}
          </ul>
          {slide.items.length > items.length && <div style={{ marginTop: u(16), fontFamily: "var(--font-mono)", fontSize: u(22), color: p.muted }}>+{slide.items.length - items.length} more</div>}
        </div>
      );
    }
    case "takeaway": {
      const size = sizeByLength(slide.heading, [[30, 112], [60, 92], [100, 74], [150, 60]], 50);
      return (
        <div style={{ ...fill, justifyContent: "flex-end", paddingBottom: u(40) }}>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(90% 60% at 0% 100%, ${p.accentSoft}, transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <Kicker p={p}>Takeaway</Kicker>
            <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: u(size), lineHeight: 1.02, letterSpacing: "-0.015em", textWrap: "balance", ...clamp(6) }}>{slide.heading}</h3>
            {slide.body && <p style={{ margin: `${u(36)} 0 0`, fontSize: u(32), lineHeight: 1.45, color: p.ink2, maxWidth: u(860), ...clamp(5) }}>{slide.body}</p>}
          </div>
        </div>
      );
    }
  }
}

/** Tracks image failures, including ones that happened before hydration. */
function useImageOk(src?: string) {
  const [failed, setFailed] = useState<string | null>(null);
  const onError = () => setFailed(src ?? null);
  const ref = (img: HTMLImageElement | null) => {
    if (!img) return;
    if (img.complete && img.naturalWidth === 0) onError();
    else img.addEventListener("error", onError, { once: true });
  };
  return { ok: !!src && failed !== src, onError, ref };
}

function Cover({ slide, p }: { slide: Extract<SlideData, { type: "cover" }>; p: SlidePalette }) {
  const img = useImageOk(slide.image);
  const size = sizeByLength(slide.heading, [[20, 132], [40, 108], [70, 88], [110, 72]], 60);
  return (
    <div style={{ ...fill, justifyContent: "flex-end", paddingBottom: u(40) }}>
      {img.ok ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={slide.image} alt="" loading="lazy" decoding="async" onError={img.onError} ref={img.ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 15%, color-mix(in srgb, ${p.bg} 70%, transparent) 50%, ${p.bg} 88%)` }} />
        </>
      ) : (
        <CoverArt p={p} />
      )}
      <div style={{ position: "relative" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 400, fontSize: u(size), lineHeight: 0.98, letterSpacing: "-0.02em", textWrap: "balance", ...clamp(5) }}>{slide.heading}</h2>
        {slide.body && <p style={{ margin: `${u(32)} 0 0`, fontSize: u(32), lineHeight: 1.42, color: p.ink2, maxWidth: u(880), ...clamp(4) }}>{slide.body}</p>}
      </div>
    </div>
  );
}

/** Quiet generative backdrop for covers without an image. */
function CoverArt({ p }: { p: SlidePalette }) {
  return (
    <svg viewBox="0 0 1080 1350" preserveAspectRatio="xMidYMid slice" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <defs>
        <radialGradient id="cg" cx="78%" cy="18%" r="60%">
          <stop offset="0" stopColor={p.accent} stopOpacity="0.35" />
          <stop offset="1" stopColor={p.accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1080" height="1350" fill="url(#cg)" />
      {Array.from({ length: 9 }, (_, i) => (
        <circle key={i} cx={840} cy={260} r={70 + i * 62} fill="none" stroke={p.accent} strokeOpacity={0.22 - i * 0.02} strokeWidth={2} />
      ))}
    </svg>
  );
}

function Table({ slide, p }: { slide: Extract<SlideData, { type: "table" }>; p: SlidePalette }) {
  const rows = slide.rows.slice(0, 8);
  const cols = slide.columns.length || rows[0]?.length || 1;
  const numeric = Array.from({ length: cols }, (_, c) => rows.length > 0 && rows.every((r) => /^[\s$€£+\-−]*[\d.,]+\s*[%a-zA-Z×x]{0,4}$/.test(r[c] ?? "")));
  const dense = rows.length > 6 || cols > 4;
  const fs = dense ? 25 : 28;
  return (
    <div style={fill}>
      <Header slide={slide} p={p} />
      <div style={{ borderRadius: u(24), border: `${u(2)} solid ${p.line}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: u(fs) }}>
          <thead>
            <tr style={{ background: p.panel }}>
              {slide.columns.map((c, i) => (
                <th key={i} style={{ textAlign: numeric[i] ? "right" : "left", padding: `${u(20)} ${u(22)}`, fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: u(20), letterSpacing: "0.1em", textTransform: "uppercase", color: p.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: i === 0 ? "34%" : undefined }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const hl = slide.highlight === ri;
              return (
                <tr key={ri} style={{ background: hl ? p.accentSoft : ri % 2 ? p.panel : "transparent", boxShadow: hl ? `inset ${u(6)} 0 0 ${p.accent}` : undefined }}>
                  {Array.from({ length: cols }, (_, ci) => (
                    <td key={ci} title={r[ci]} style={{ textAlign: numeric[ci] ? "right" : "left", padding: `${u(dense ? 18 : 24)} ${u(22)}`, borderTop: `${u(1.5)} solid ${p.line}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums", fontWeight: hl || ci === 0 ? 600 : 400, color: hl ? p.ink : ci === 0 ? p.ink : p.ink2, fontFamily: numeric[ci] ? "var(--font-mono)" : undefined }}>
                      {r[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {slide.rows.length > rows.length && <div style={{ marginTop: u(16), fontFamily: "var(--font-mono)", fontSize: u(22), color: p.muted }}>+{slide.rows.length - rows.length} more rows</div>}
    </div>
  );
}

function Timeline({ slide, p }: { slide: Extract<SlideData, { type: "timeline" }>; p: SlidePalette }) {
  const events = slide.events.slice(0, 8);
  const compact = events.length > 5;
  return (
    <div style={fill}>
      <Header slide={slide} p={p} />
      <ol style={{ margin: 0, padding: 0, listStyle: "none", position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: events.length > 3 ? "space-between" : "flex-start", gap: u(28) }}>
        <span aria-hidden style={{ position: "absolute", left: u(11), top: u(16), bottom: u(16), width: u(3), background: `linear-gradient(${p.accent}, ${p.line})` }} />
        {events.map((e, i) => (
          <li key={i} style={{ position: "relative", paddingLeft: u(64), minHeight: 0 }}>
            <span aria-hidden style={{ position: "absolute", left: 0, top: u(8), width: u(25), height: u(25), borderRadius: "50%", background: i === events.length - 1 ? p.accent : p.bg, border: `${u(4)} solid ${p.accent}` }} />
            <div style={{ fontFamily: "var(--font-mono)", fontSize: u(22), letterSpacing: "0.06em", color: p.accent, marginBottom: u(4) }}>{e.date}</div>
            <div style={{ fontSize: u(compact ? 29 : 34), fontWeight: 600, lineHeight: 1.25, ...clamp(1) }}>{e.label}</div>
            {e.detail && <div style={{ fontSize: u(compact ? 23 : 26), color: p.muted, lineHeight: 1.35, marginTop: u(4), ...clamp(compact ? 1 : 2) }}>{e.detail}</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Code({ slide, p }: { slide: Extract<SlideData, { type: "code" }>; p: SlidePalette }) {
  const all = slide.code.replace(/\t/g, "  ").replace(/\s+$/, "").split("\n");
  const max = slide.caption ? 18 : 21;
  const lines = all.slice(0, max);
  const colors = { kw: p.accent, str: p.series[2], com: p.muted, num: p.series[1], fn: p.ink, txt: p.ink2, punct: p.muted };
  return (
    <div style={fill}>
      <Header slide={slide} p={p} label={`Code`} />
      <div style={{ flex: 1, minHeight: 0, borderRadius: u(24), background: "rgb(0 0 0 / 0.35)", border: `${u(2)} solid ${p.line}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: u(10), padding: `${u(18)} ${u(24)}`, borderBottom: `${u(2)} solid ${p.line}` }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: u(14), height: u(14), borderRadius: "50%", background: p.line }} />)}
          <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: u(20), letterSpacing: "0.08em", padding: `${u(4)} ${u(14)}`, borderRadius: u(999), background: p.accentSoft, color: p.accent }}>{slide.lang || "text"}</span>
        </div>
        <pre style={{ margin: 0, padding: `${u(22)} ${u(24)}`, fontFamily: "var(--font-mono)", fontSize: u(24), lineHeight: 1.55, overflow: "hidden", flex: 1, minHeight: 0 }}>
          {lines.map((line, i) => (
            <div key={i} style={{ display: "flex", whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span style={{ width: u(52), flexShrink: 0, textAlign: "right", paddingRight: u(22), color: p.muted, opacity: 0.6, userSelect: "none" }}>{i + 1}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {tokenize(line, slide.lang).map((t, ti) => (
                  <span key={ti} style={{ color: colors[t.kind], fontStyle: t.kind === "com" ? "italic" : undefined }}>{t.text}</span>
                ))}
              </span>
            </div>
          ))}
          {all.length > lines.length && <div style={{ color: p.muted, paddingLeft: u(52) }}>{`  … ${all.length - lines.length} more lines`}</div>}
        </pre>
      </div>
      {slide.caption && <div style={{ marginTop: u(22), fontSize: u(27), color: p.ink2, ...clamp(2) }}>{slide.caption}</div>}
    </div>
  );
}

function ImageSlide({ slide, p }: { slide: Extract<SlideData, { type: "image" }>; p: SlidePalette }) {
  const img = useImageOk(slide.image);
  const contain = slide.fit === "contain";
  return (
    <div style={{ ...fill, justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: contain ? `${u(72)} ${u(72)} ${u(slide.caption ? 300 : 150)}` : 0, display: "grid", placeItems: "center" }}>
        {img.ok ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slide.image} alt={slide.caption ?? ""} loading="lazy" decoding="async" onError={img.onError} ref={img.ref} style={{ width: "100%", height: "100%", objectFit: contain ? "contain" : "cover", borderRadius: contain ? u(18) : 0 }} />
        ) : (
          <div style={{ display: "grid", placeItems: "center", gap: u(12), color: p.muted, fontFamily: "var(--font-mono)", fontSize: u(24), textAlign: "center" }}>
            <svg viewBox="0 0 24 24" width={u(96)} height={u(96)} fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden style={{ width: u(96), height: u(96) }}>
              <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m4 18 5-5 4 4 3-3 4 4" />
            </svg>
            Image unavailable
          </div>
        )}
      </div>
      {!contain && img.ok && <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 55%, ${p.bg} 100%)` }} />}
      {slide.caption && (
        <p style={{ position: "relative", margin: `0 0 ${u(40)}`, fontSize: u(32), lineHeight: 1.4, color: p.ink, ...clamp(3) }}>{slide.caption}</p>
      )}
    </div>
  );
}

function Flow({ slide, p }: { slide: Extract<SlideData, { type: "flow" }>; p: SlidePalette }) {
  const steps = slide.steps.slice(0, 6);
  const tight = steps.length > 4;
  return (
    <div style={fill}>
      <Header slide={slide} p={p} />
      <ol style={{ margin: 0, padding: 0, listStyle: "none", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: "flex", gap: u(28), flex: steps.length >= 4 ? 1 : undefined, minHeight: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <span style={{ width: u(64), height: u(64), borderRadius: u(20), display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: u(28), fontWeight: 600, background: i === 0 ? p.accent : p.panel, color: i === 0 ? p.onAccent : p.accent, border: `${u(2)} solid ${p.accent}` }}>
                {i + 1}
              </span>
              {i < steps.length - 1 && <span aria-hidden style={{ flex: 1, width: u(3), minHeight: u(24), background: p.line, margin: `${u(8)} 0` }} />}
            </div>
            <div style={{ paddingTop: u(10), paddingBottom: u(tight ? 8 : 34), minWidth: 0 }}>
              <div style={{ fontSize: u(tight ? 31 : 35), fontWeight: 600, lineHeight: 1.25, ...clamp(1) }}>{s.label}</div>
              {s.detail && <div style={{ fontSize: u(tight ? 24 : 27), color: p.muted, lineHeight: 1.35, marginTop: u(6), ...clamp(2) }}>{s.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Footer({ p, title, index, total, source, srcId, overlay, type }: { p: SlidePalette; title?: string; index?: number; total?: number; source?: Source; srcId?: string; overlay: boolean; type: string }) {
  const label = source ? `${source.path}${source.lines ? `:${source.lines}` : ""}` : srcId === "git" ? "git history" : undefined;
  return (
    <div style={{ position: "relative", flexShrink: 0, marginTop: overlay ? 0 : u(36), paddingTop: u(24), borderTop: `${u(2)} solid ${p.line}`, display: "flex", alignItems: "center", gap: u(20), fontSize: u(22), color: p.muted, minWidth: 0 }}>
      <span style={{ fontWeight: 600, color: p.ink2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0, flexShrink: 1 }}>{title ?? SLIDE_LABELS[type]}</span>
      {label && (
        <span title={source?.note ?? label} style={{ marginLeft: "auto", minWidth: 0, maxWidth: "62%", flexShrink: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "var(--font-mono)", fontSize: u(19), padding: `${u(6)} ${u(14)}`, borderRadius: u(999), background: p.panel, border: `${u(2)} solid ${p.line}`, color: p.ink2 }}>
          Source: {label}
        </span>
      )}
      {index != null && total != null && (
        <span style={{ marginLeft: label ? 0 : "auto", flexShrink: 0, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
        </span>
      )}
    </div>
  );
}
