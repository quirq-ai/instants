import type { TimelineEntry } from "./log-types";
export type ImportFormat = "timeline" | "codex" | "claude";
export const MAX_IMPORT_BYTES: number;
export const MAX_IMPORT_ENTRIES: 500;
export function importTimeline(
  text: string,
  format: ImportFormat,
): Promise<TimelineEntry[]>;
