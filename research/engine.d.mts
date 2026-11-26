import type { GenerateEvent, ResearchRecord, SourceStatus } from "../lib/research/types";

export declare const CACHE_DIR: string;
export declare const DEFAULT_ROOTS: string[];

export declare function slugify(value: string): string;

export declare function scanRoots(roots?: string[]): Promise<SourceStatus[]>;

/** scanRoots, reusing the last saved scan when it is younger than maxAgeMs. */
export declare function cachedScan(options?: { maxAgeMs?: number }): Promise<SourceStatus[]>;

/** Real path of a target within the scan depth of a watched root (where scanRoots looks), else null. */
export declare function resolveWatchedTarget(target: string): Promise<string | null>;

export declare function runGeneration(options: {
  targets: string[];
  force?: boolean;
  concurrency?: number;
  onEvent?: (event: GenerateEvent) => void;
  signal?: AbortSignal;
}): Promise<void>;

export declare function ingestUpload(input: {
  title?: string;
  text?: string;
  files?: { name: string; buffer: Buffer | Uint8Array }[];
}): Promise<string>;

export declare function deleteRecord(slug: string): Promise<void>;

/** Delete a post and mark the watched folder it came from so it is not posted again. */
export declare function deletePost(slug: string): Promise<ResearchRecord | null>;

/** Deleted folder marks, keyed by absolute path. */
export declare function readDeleted(): Promise<Record<string, { slug: string; title: string; at: string }>>;

/** Clear a folder's deleted mark; false when it had none. */
export declare function restoreFolder(target: string): Promise<boolean>;
