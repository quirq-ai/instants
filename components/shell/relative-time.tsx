"use client";

import { useEffect, useState } from "react";
import { relativeDate } from "@/lib/research/format";

// Renders an absolute date on the server and swaps in a relative label after
// mount, so SSR and hydration always agree regardless of time zone or clock.
export function RelativeTime({ iso, withTime = false }: { iso: string; withTime?: boolean }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const rel = relativeDate(iso);
    const time = withTime
      ? ` at ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
      : "";
    setLabel(rel + time);
  }, [iso, withTime]);
  const fallback = iso.slice(0, 10);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label ?? fallback}
    </time>
  );
}
