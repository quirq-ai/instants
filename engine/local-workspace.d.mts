import type { SeedData } from "@/lib/data";
import type { LogKind } from "./log-types";
import type { LogSnapshot } from "./jsonl-store.mjs";

export type LocalWorkspace = {
  read(): Promise<LogSnapshot>;
  append(kind: LogKind, entries: unknown[]): Promise<LogSnapshot>;
  importTimeline(
    entries: unknown[],
    options?: { replace?: boolean },
  ): Promise<LogSnapshot>;
  exportLog(kind: LogKind): Promise<string>;
  close(): Promise<void>;
};
export type LocalWorkspaceOptions = {
  directory: string;
  lockDirectory?: string;
  profileId: string;
  seed?: SeedData;
};
export function createLocalWorkspace(
  options: LocalWorkspaceOptions,
): LocalWorkspace;
export function getLocalWorkspace(
  options: LocalWorkspaceOptions,
): LocalWorkspace;
