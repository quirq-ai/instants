// Small static visuals for the post page. Server and client safe.
import type { FolderMeta } from "@/lib/research/types";

export function Sparkline({
  activity,
  accent,
}: {
  activity: { week: string; commits: number }[];
  accent: string;
}) {
  if (activity.length < 2) return null;
  const w = 280;
  const h = 56;
  const max = Math.max(1, ...activity.map((a) => a.commits));
  const step = w / (activity.length - 1);
  const pts = activity.map((a, i) => [i * step, h - 4 - (a.commits / max) * (h - 10)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const total = activity.reduce((s, a) => s + a.commits, 0);
  return (
    <figure>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-14 w-full overflow-visible"
        role="img"
        aria-label={`${total} commits over ${activity.length} active weeks, peak ${max} in a week`}
        preserveAspectRatio="none"
      >
        <path d={`${line} L${w},${h} L0,${h} Z`} fill={accent} opacity={0.14} />
        <path d={line} fill="none" stroke={accent} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-1 flex justify-between font-mono text-[11px] text-faint">
        <span>{activity[0].week}</span>
        <span>peak {max}/wk</span>
        <span>{activity[activity.length - 1].week}</span>
      </figcaption>
    </figure>
  );
}

const LANG_COLORS = ["var(--ink)", "var(--brand)", "var(--warn)", "var(--muted)", "var(--ok)", "var(--faint)"];

export function LanguagesBar({ languages }: { languages: FolderMeta["languages"] }) {
  if (!languages.length) return null;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {languages.map((lang, i) => (
          <span key={`${lang.name}-${i}`} style={{ width: `${lang.share * 100}%`, background: LANG_COLORS[i % LANG_COLORS.length] }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        {languages.map((lang, i) => (
          <li key={`${lang.name}-${i}`} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: LANG_COLORS[i % LANG_COLORS.length] }} aria-hidden />
            {lang.name} <span className="text-faint">{Math.round(lang.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
