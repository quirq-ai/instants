// Small formatting helpers shared by server and client components.

const DAY = 86_400_000;

/** "today", "3 days ago", "5 weeks ago", "Mar 2026". */
export function relativeDate(iso: string, now = Date.now()) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((now - then) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** "Jul 12 to Jul 28, 2026" style range. */
export function dateRange(start: string, end: string) {
  const a = new Date(start);
  const b = new Date(end);
  const sameYear = a.getFullYear() === b.getFullYear();
  const fmt = (d: Date, year: boolean) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  if (a.toDateString() === b.toDateString()) return fmt(a, true);
  return `${fmt(a, !sameYear)} to ${fmt(b, true)}`;
}

export function compactNumber(n: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Topic name <-> URL segment. */
export const topicSlug = (topic: string) =>
  topic.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Readable text color (ink or white) on top of a hex accent. */
export function onAccent(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const v = parseInt(m[1], 16);
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#14140f" : "#ffffff";
}
