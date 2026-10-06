import type {
  ActivityEntry,
  LogDiagnostic,
  LogKind,
  TimelineEntry,
} from "./log-types";

export const MAX_LOG_BYTES: number;
export const MAX_LOG_LINE_BYTES: number;
export const MAX_APPEND_ENTRIES: number;

export class LogStoreError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status?: number);
}

export type LogSnapshot = {
  timeline: TimelineEntry[];
  activity: ActivityEntry[];
  diagnostics: LogDiagnostic[];
  revision: string;
};

export type JsonlStore = {
  read(): Promise<LogSnapshot>;
  append(kind: "timeline", entries: TimelineEntry[]): Promise<LogSnapshot>;
  append(kind: "activity", entries: ActivityEntry[]): Promise<LogSnapshot>;
  exportLog(kind: LogKind): Promise<string>;
  close(): Promise<void>;
};

export function createJsonlStore(options: {
  directory: string;
  lockDirectory?: string;
}): JsonlStore;
