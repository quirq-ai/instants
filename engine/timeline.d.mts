import type { SeedData } from "@/lib/data";
import type {
  SourceRecord,
  TimelineEntry,
  TimelineSnapshot,
} from "./log-types";

export function replayTimeline(
  entries: readonly TimelineEntry[],
): TimelineSnapshot;
export function seedTimeline(
  seed: SeedData & { sources?: SourceRecord[] },
  at?: string,
  uuidFactory?: () => string,
): TimelineEntry[];
