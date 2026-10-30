// Hand-built SVG charts for chart slides. The viewBox is in slide logical px,
// so text and strokes scale with the card like everything else.

import type { ChartSeries } from "@/lib/research/types";
import type { SlidePalette } from "./palette";

type Kind = "bar" | "line" | "donut" | "stackedBar";

const W = 952;
const MONO = "var(--font-mono)";

/** Round a step to 1, 2, 2.5 or 5 times a power of ten. */
function niceStep(span: number, target: number) {
  const raw = span / Math.max(target, 1);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * pow;
}

export function niceScale(min: number, max: number, target = 4) {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (lo === hi) hi = lo + 1;
  const step = niceStep(hi - lo, target);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks };
}

export function fmt(n: number) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${+(n / 1e3).toFixed(1)}k`;
  if (a >= 100 || Number.isInteger(n)) return `${Math.round(n)}`;
  return `${+n.toFixed(a < 1 ? 2 : 1)}`;
}

const clean = (series: ChartSeries[], n: number) =>
  series
    .filter((s) => s && Array.isArray(s.values))
    .map((s) => ({ name: s.name, values: Array.from({ length: n }, (_, i) => (Number.isFinite(s.values[i]) ? s.values[i] : 0)) }));

function shortLabel(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function SlideChart({
  kind,
  x,
  series,
  unit,
  palette,
  height,
}: {
  kind: Kind;
  x: string[];
  series: ChartSeries[];
  unit?: string;
  palette: SlidePalette;
  height: number;
}) {
  const xs = x.length ? x : (series[0]?.values ?? []).map((_, i) => `${i + 1}`);
  const data = clean(series, xs.length);
  if (!xs.length || !data.length) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", color: palette.muted, fontFamily: MONO }}>
        No data points
      </div>
    );
  }
  if (kind === "donut") return <Donut x={xs} series={data[0]} palette={palette} unit={unit} height={height} />;

  const stacked = kind === "stackedBar" && data.length > 1;
  const totalsPos = xs.map((_, i) => data.reduce((t, s) => t + Math.max(0, s.values[i]), 0));
  const totalsNeg = xs.map((_, i) => data.reduce((t, s) => t + Math.min(0, s.values[i]), 0));
  const all = data.flatMap((s) => s.values);
  const { lo, hi, ticks } = stacked
    ? niceScale(Math.min(...totalsNeg), Math.max(...totalsPos))
    : niceScale(Math.min(...all), Math.max(...all));

  const H = height;
  const padL = 84;
  const padR = 16;
  const padT = 40;
  const padB = 64;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const y = (v: number) => padT + ih - ((v - lo) / (hi - lo)) * ih;
  const band = iw / xs.length;
  const labelEvery = Math.ceil(xs.length / 8);
  const maxChars = Math.max(4, Math.floor((band * labelEvery) / 15));
  const showValues = xs.length * (stacked || kind === "line" ? 1 : data.length) <= 16;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" style={{ display: "block", overflow: "visible" }}>
      {ticks.map((t, i) => (
        <g key={`${i}-${t}`}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? palette.ink2 : palette.line} strokeWidth={t === 0 ? 2 : 1.5} strokeDasharray={t === 0 ? undefined : "4 8"} />
          <text x={padL - 16} y={y(t)} dy="0.35em" textAnchor="end" fill={palette.muted} fontSize={24} fontFamily={MONO}>
            {fmt(t)}
          </text>
        </g>
      ))}
      {unit && (
        <text x={padL - 16} y={padT - 22} textAnchor="end" fill={palette.muted} fontSize={22} fontFamily={MONO}>
          {unit}
        </text>
      )}
      {xs.map((label, i) =>
        i % labelEvery === 0 ? (
          <text key={i} x={padL + band * i + band / 2} y={H - padB + 40} textAnchor="middle" fill={palette.ink2} fontSize={24} fontFamily={MONO}>
            {shortLabel(label, maxChars)}
          </text>
        ) : null,
      )}

      {kind === "line"
        ? data.map((s, si) => {
            const color = palette.series[si % palette.series.length];
            const pts = s.values.map((v, i) => [padL + band * i + band / 2, y(v)] as const);
            const d = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
            const area = `${d} L${pts[pts.length - 1][0].toFixed(1)},${y(Math.max(lo, 0))} L${pts[0][0].toFixed(1)},${y(Math.max(lo, 0))} Z`;
            return (
              <g key={si}>
                {data.length === 1 && pts.length > 1 && <path d={area} fill={color} opacity={0.12} />}
                {pts.length > 1 && <path d={d} fill="none" stroke={color} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />}
                {pts.map(([px, py], i) =>
                  pts.length <= 14 || i === pts.length - 1 ? <circle key={i} cx={px} cy={py} r={pts.length <= 14 ? 9 : 11} fill={palette.bg} stroke={color} strokeWidth={5} /> : null,
                )}
                {(showValues ? pts.map((_, i) => i) : [pts.length - 1]).map((i) => (
                  <text key={`v${i}`} x={pts[i][0]} y={pts[i][1] - 22} textAnchor="middle" fill={data.length === 1 ? palette.ink : color} fontSize={24} fontWeight={600} fontFamily={MONO}>
                    {fmt(s.values[i])}
                  </text>
                ))}
              </g>
            );
          })
        : xs.map((_, i) => {
            const gap = band * (xs.length > 12 ? 0.18 : 0.28);
            const x0 = padL + band * i + gap / 2;
            const bw = band - gap;
            if (stacked) {
              let pos = 0;
              let neg = 0;
              const total = data.reduce((t, s) => t + s.values[i], 0);
              return (
                <g key={i}>
                  {data.map((s, si) => {
                    const v = s.values[i];
                    const from = v >= 0 ? pos : neg;
                    const to = from + v;
                    if (v >= 0) pos = to;
                    else neg = to;
                    const top = Math.min(y(from), y(to));
                    return <rect key={si} x={x0} y={top} width={bw} height={Math.abs(y(from) - y(to))} fill={palette.series[si % palette.series.length]} stroke={palette.bg} strokeWidth={2} />;
                  })}
                  {showValues && (
                    <text x={x0 + bw / 2} y={y(pos) - 14} textAnchor="middle" fill={palette.ink} fontSize={24} fontWeight={600} fontFamily={MONO}>
                      {fmt(total)}
                    </text>
                  )}
                </g>
              );
            }
            const sw = bw / data.length;
            return (
              <g key={i}>
                {data.map((s, si) => {
                  const v = s.values[i];
                  const top = Math.min(y(0), y(v));
                  const h = Math.max(Math.abs(y(v) - y(0)), v === 0 ? 0 : 3);
                  return (
                    <g key={si}>
                      <rect x={x0 + sw * si + (data.length > 1 ? 2 : 0)} y={top} width={Math.max(sw - (data.length > 1 ? 4 : 0), 2)} height={h} rx={Math.min(6, sw / 4)} fill={palette.series[si % palette.series.length]} />
                      {showValues && (
                        <text x={x0 + sw * si + sw / 2} y={v >= 0 ? top - 14 : top + h + 30} textAnchor="middle" fill={palette.ink} fontSize={data.length > 2 ? 20 : 24} fontWeight={600} fontFamily={MONO}>
                          {fmt(v)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
    </svg>
  );
}

function Donut({ x, series, palette, unit, height }: { x: string[]; series: ChartSeries; palette: SlidePalette; unit?: string; height: number }) {
  const parts = x.map((label, i) => ({ label, v: Math.max(0, series.values[i]) })).filter((p) => p.v > 0);
  const total = parts.reduce((t, p) => t + p.v, 0);
  const R = Math.min(height / 2 - 10, 250);
  const r = R * 0.62;
  const cx = R + 10;
  const cy = height / 2;
  let a = -Math.PI / 2;
  const arc = (a0: number, a1: number) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (ang: number, rad: number) => `${(cx + rad * Math.cos(ang)).toFixed(2)},${(cy + rad * Math.sin(ang)).toFixed(2)}`;
    return `M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z`;
  };
  const shown = parts.slice(0, 7);
  const lx = cx + R + 56;
  const rowH = Math.min(64, (height - 20) / Math.max(shown.length, 1));
  const ly0 = cy - (rowH * shown.length) / 2 + rowH / 2;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height="100%" role="img" style={{ display: "block" }}>
      {total === 0 ? (
        <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke={palette.line} strokeWidth={R - r} />
      ) : parts.length === 1 ? (
        <circle cx={cx} cy={cy} r={(R + r) / 2} fill="none" stroke={palette.series[0]} strokeWidth={R - r} />
      ) : (
        parts.map((p, i) => {
          const a1 = a + (p.v / total) * Math.PI * 2;
          const d = arc(a, a1);
          a = a1;
          return <path key={i} d={d} fill={palette.series[i % palette.series.length]} stroke={palette.bg} strokeWidth={4} />;
        })
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" fill={palette.ink} fontSize={64} fontWeight={700}>
        {fmt(total)}
      </text>
      <text x={cx} y={cy + 38} textAnchor="middle" fill={palette.muted} fontSize={22} fontFamily={MONO}>
        {unit ? `total ${unit}` : "total"}
      </text>
      {shown.map((p, i) => (
        <g key={i} transform={`translate(${lx} ${ly0 + i * rowH})`}>
          <rect x={0} y={-12} width={24} height={24} rx={6} fill={palette.series[i % palette.series.length]} />
          <text x={40} y={0} dy="0.35em" fill={palette.ink2} fontSize={28}>
            {shortLabel(p.label, 16)}
          </text>
          <text x={W - lx - 4} y={0} dy="0.35em" textAnchor="end" fill={palette.ink} fontSize={28} fontWeight={600} fontFamily={MONO}>
            {total ? `${Math.round((p.v / total) * 100)}%` : "0%"}
          </text>
        </g>
      ))}
      {parts.length > shown.length && (
        <text x={lx + 40} y={ly0 + shown.length * rowH} dy="0.35em" fill={palette.muted} fontSize={22} fontFamily={MONO}>
          +{parts.length - shown.length} more
        </text>
      )}
    </svg>
  );
}
