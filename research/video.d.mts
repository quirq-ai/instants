import type { VideoStatus } from "../lib/research/types";

export type VideoAspect = NonNullable<VideoStatus["aspect"]>;
export declare const VIDEOS_CACHE: string;
export declare const VIDEO_TIMEOUT: number;
export declare const ASPECTS: Record<VideoAspect, [number, number]>;
export declare function statusFile(slug: string): string;
export declare function readVideoStatus(slug: string): Promise<VideoStatus | null>;
export declare function deleteVideo(slug: string): Promise<void>;
export declare function buildVideoPrompt(
  record: unknown,
  options: { aspect: VideoAspect; length: number; assets: { file: string; what: string }[] },
): string;
/** Resolves with the final status (ready or failed). Throws only on a bad slug or aspect. */
export declare function runVideo(options: {
  slug: string;
  aspect?: VideoAspect;
  length?: number;
  onStatus?: (status: VideoStatus) => void;
  signal?: AbortSignal;
}): Promise<VideoStatus>;
