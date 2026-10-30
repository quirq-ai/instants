// Accent-derived colors and sizing helpers for slides. Slides are designed at a
// fixed 1080x1350 logical size; `u(n)` converts logical px to container units.

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

/** Logical px (of 1080) to cqw so a slide scales with its card. */
export const u = (n: number) => `${+(n / 10.8).toFixed(4)}cqw`;

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  let v = m ? m[1] : "0095f6";
  if (v.length === 3) v = v.split("").map((c) => c + c).join("");
  const n = parseInt(v, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

const hsl = (h: number, s: number, l: number, a = 1) =>
  `hsl(${((h % 360) + 360) % 360} ${Math.round(s)}% ${Math.round(l)}%${a < 1 ? ` / ${a}` : ""})`;

export type SlidePalette = {
  bg: string;
  bg2: string;
  panel: string;
  line: string;
  ink: string;
  ink2: string;
  muted: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  series: string[];
};

/** A deep, accent-tinted dark card with a readable highlight color. */
export function slidePalette(accent: string): SlidePalette {
  const { h, s, l } = hexToHsl(accent);
  const sat = Math.max(s, 8);
  const tint = Math.min(sat, 40);
  const bright = { s: Math.max(Math.min(sat, 85), 45), l: Math.min(Math.max(l, 60), 72) };
  const hueSteps = [0, 150, 275, 45, 210, 330, 100, 20];
  const lightSteps = [0, 4, -2, 6, 2, 8, -4, 10];
  return {
    bg: hsl(h, tint, 8),
    bg2: hsl(h, tint * 0.9, 13),
    panel: hsl(h, tint * 0.6, 100, 0.045),
    line: hsl(h, tint * 0.5, 100, 0.1),
    ink: hsl(h, 12, 96),
    ink2: hsl(h, 10, 80),
    muted: hsl(h, 10, 62),
    accent: hsl(h, bright.s, bright.l),
    accentSoft: hsl(h, bright.s, bright.l, 0.14),
    onAccent: hsl(h, tint, 8),
    series: hueSteps.map((d, i) => hsl(h + d, i === 0 ? bright.s : Math.max(bright.s - 10, 45), bright.l + lightSteps[i] - (i ? 2 : 0))),
  };
}

/** Pick a display size from text length buckets so headings never overflow. */
export function sizeByLength(text: string, buckets: [number, number][], min: number) {
  for (const [max, size] of buckets) if (text.length <= max) return size;
  return min;
}

/** Inline style for multi-line clamping. */
export const clamp = (lines: number): React.CSSProperties => ({
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: lines,
  overflow: "hidden",
});

export const SLIDE_LABELS: Record<string, string> = {
  cover: "Cover",
  bigNumbers: "Numbers",
  chart: "Chart",
  table: "Table",
  timeline: "Timeline",
  code: "Code",
  image: "Image",
  quote: "Quote",
  flow: "Flow",
  compare: "Compare",
  checklist: "Checklist",
  takeaway: "Takeaway",
};
