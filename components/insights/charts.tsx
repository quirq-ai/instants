// Hand-built, accessible SVG and HTML charts for the insights dashboard. Server-renderable.
import Link from "next/link";

const PALETTE = ["var(--brand)", "#c9853a", "#4f7fb8", "#a0569c", "#3f9b8c", "#b8544a", "var(--faint)"];
export const seriesColor = (i: number) => PALETTE[i % PALETTE.length];

export function Section({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = `s-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={`rounded-[var(--radius)] border border-line bg-surface p-4 md:p-5 ${className}`}>
      <h2 id={id} className="font-display text-2xl leading-tight">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-4xl leading-none tabular-nums text-ink">{value}</dd>
      {sub && <dd className="mt-1.5 text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

/** Vertical bars over time. */
export function ColumnChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 640;
  const h = 200;
  const pad = { t: 16, b: 28, l: 28, r: 4 };
  const band = (w - pad.l - pad.r) / Math.max(data.length, 1);
  const bar = Math.min(36, band * 0.7);
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const every = Math.ceil(data.length / 8);
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label={label}>
        <title>{label}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + band * i + (band - bar) / 2;
          return (
            <g key={d.label}>
              <rect x={x} y={y(d.value)} width={bar} height={Math.max(0, h - pad.b - y(d.value))} rx={3} fill="var(--brand)">
                <title>{`${d.label}: ${d.value}`}</title>
              </rect>
              {i % every === 0 && (
                <text x={x + bar / 2} y={h - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Horizontal labelled bars; optional links. */
export function BarList({
  items,
  format = (n) => String(n),
  color = "var(--brand)",
}: {
  items: { label: string; value: number; href?: string; sub?: string }[];
  format?: (n: number) => string;
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const name = item.href ? (
          <Link href={item.href} className="truncate text-ink hover:underline">
            {item.label}
          </Link>
        ) : (
          <span className="truncate text-ink">{item.label}</span>
        );
        return (
          <li key={item.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-baseline gap-2">
                {name}
                {item.sub && <span className="shrink-0 text-xs text-muted-foreground">{item.sub}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{format(item.value)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One 100% bar split into shares, with a legend. */
export function StackedBar({ parts, label }: { parts: { label: string; value: number }[]; label: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <figure>
      <figcaption className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</figcaption>
      <div
        role="img"
        aria-label={`${label}: ${parts.map((p) => `${p.label} ${pct(p.value)}%`).join(", ")}`}
        className="flex h-4 overflow-hidden rounded-full bg-surface-2"
      >
        {parts.map((p, i) => (
          <div key={p.label} title={`${p.label} ${pct(p.value)}%`} style={{ width: `${(p.value / total) * 100}%`, background: seriesColor(i) }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-hidden>
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-1.5 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: seriesColor(i) }} />
            <span className="text-ink">{p.label}</span>
            <span className="tabular-nums text-muted-foreground">{pct(p.value)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Donut-free ring meter for a single ratio. */
export function Ring({ value, total, label }: { value: number; total: number; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const share = total ? value / total : 0;
  return (
    <svg viewBox="0 0 88 88" className="size-24 shrink-0" role="img" aria-label={`${label}: ${value} of ${total}`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${c * share} ${c}`}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="49" textAnchor="middle" fontSize="16" fontWeight="600" fill="var(--ink)">
        {Math.round(share * 100)}%
      </text>
    </svg>
  );
}
