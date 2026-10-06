import type {
  ActivityEntry,
  TimelineEntry,
  ParsedLog,
  LogKind,
} from "./log-types";

export const MAX_LINE_BYTES: number;
export class LogError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status?: number);
}
export function parseTimelineEntry(value: unknown): TimelineEntry;
export function parseActivityEntry(value: unknown): ActivityEntry;
export function parseLogEntries(
  text: string,
  kind: "timeline",
): ParsedLog<TimelineEntry>;
export function parseLogEntries(
  text: string,
  kind: "activity",
): ParsedLog<ActivityEntry>;
export function parseLogEntries(
  text: string,
  kind: LogKind,
): ParsedLog<TimelineEntry | ActivityEntry>;
