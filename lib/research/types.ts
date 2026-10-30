// The research post contract shared by the generator (research/*.mjs),
// the server data layer (lib/research/library.ts) and every UI surface.

/** A file the post's facts were taken from. `id` is referenced by `src` on slides. */
export type Source = {
  id: string; // "s1", "s2"... or "git" for git-derived facts
  path: string; // relative to the research folder
  lines?: string; // "40-62"
  note?: string; // what was taken from it
};

export type ChartSeries = { name: string; values: number[] };

export type Slide =
  | { type: "cover"; heading: string; body?: string; image?: string }
  | {
      type: "bigNumbers";
      heading: string;
      items: { value: string; label: string; src?: string }[];
    }
  | {
      type: "chart";
      chart: "bar" | "line" | "donut" | "stackedBar";
      heading: string;
      unit?: string;
      x: string[];
      series: ChartSeries[];
      takeaway?: string;
      src?: string;
    }
  | {
      type: "table";
      heading: string;
      columns: string[];
      rows: string[][];
      highlight?: number; // row index to emphasize
      src?: string;
    }
  | {
      type: "timeline";
      heading: string;
      events: { date: string; label: string; detail?: string }[];
      src?: string;
    }
  | {
      type: "code";
      heading: string;
      lang: string;
      code: string;
      caption?: string;
      src?: string;
    }
  | {
      type: "image";
      image: string; // media URL (see Media)
      caption?: string;
      fit?: "cover" | "contain";
      src?: string;
    }
  | {
      type: "quote";
      text: string;
      attribution?: string;
      verbatim: boolean;
      src?: string;
    }
  | {
      type: "flow";
      heading: string;
      steps: { label: string; detail?: string }[];
      src?: string;
    }
  | {
      type: "compare";
      heading: string;
      left: { title: string; points: string[] };
      right: { title: string; points: string[] };
      src?: string;
    }
  | {
      type: "checklist";
      heading: string;
      items: { text: string; done: boolean }[];
      src?: string;
    }
  | { type: "takeaway"; heading: string; body?: string };

export type SlideType = Slide["type"];

/** Topics are a small fixed vocabulary so browsing stays tidy. */
export const TOPICS = [
  "AI & Agents",
  "Developer Tools",
  "Simulation & Science",
  "Graphics & Visualization",
  "Media & Video",
  "Product & Design",
  "Infrastructure",
  "Data & Knowledge",
  "Business & Strategy",
  "Other",
] as const;
export type Topic = (typeof TOPICS)[number];

export type PostStatus = "idea" | "prototype" | "working" | "shipped" | "abandoned";

/** What Claude writes. */
export type GeneratedPost = {
  title: string; // project title for display, e.g. "Solar Claude"
  kind: string; // Experiment, Research, Prototype, Tool, Simulation, Study
  topic: Topic;
  status: PostStatus;
  hook: string; // one line
  summary: string; // 1 to 2 sentences, plain language
  writeup: string; // markdown, 150 to 400 words: what, why, how, findings, open questions
  tags: string[];
  accent: string; // hex
  sources: Source[];
  slides: Slide[];
};

/** Facts the collector computes without Claude. */
export type FolderMeta = {
  fileCount: number;
  bytes: number;
  languages: { name: string; share: number }[]; // share 0..1, top 6
  stack: string[]; // frameworks / runtimes
  git?: {
    commits: number;
    authors: number;
    first: string; // ISO date
    last: string;
    activity: { week: string; commits: number }[]; // up to last 26 active weeks
    milestones: { date: string; subject: string }[];
  };
  formats: { ext: string; count: number }[]; // what kinds of files are in there
};

/** One research item: a cache record on disk, one post in the app. */
export type ResearchRecord = {
  slug: string;
  hash: string; // content hash of collected material (+ prompt version)
  name: string; // folder or upload name
  path: string; // absolute path of the source folder/file
  origin: "folder" | "upload";
  sourceDir?: string; // store-relative source folder ("sources/<slug>") for uploaded and space sources
  files: string[]; // files the collector fed to Claude
  media: string[]; // media URLs available to slides ("/research/media/<slug>/x.jpg")
  occurredAt: string; // when the research last changed (ISO)
  generatedAt: string; // when the post was written (ISO)
  meta: FolderMeta;
  post: GeneratedPost;
};

/** Per-user state about posts, stored server-side. */
export type Activity = {
  saved: string[]; // slugs
  pinned: string[];
  hidden: string[];
  read: Record<string, string>; // slug -> ISO time first opened
  notes: Record<string, { text: string; at: string }[]>;
};

/** A watched root and what the last scan found. */
export type SourceStatus = {
  root: string;
  folders: {
    name: string;
    path: string;
    state: "posted" | "changed" | "new" | "skipped" | "failed";
    reason?: string;
    slug?: string;
  }[];
  scannedAt?: string;
};

/** Events streamed (NDJSON) by POST /api/generate. */
export type GenerateEvent =
  | { type: "start"; total: number }
  | { type: "stage"; name: string; stage: "collecting" | "writing" | "rendering" | "cached" | "skipped"; detail?: string }
  | { type: "done"; name: string; slug: string }
  | { type: "error"; name: string; message: string }
  | { type: "end"; posts: number; failed: number };

/** State of a post's video render (.research-cache/videos-work/<slug>/status.json; ready results also in store videos/<slug>.status.json). */
export type VideoStatus = {
  slug: string;
  state: "queued" | "running" | "ready" | "failed";
  startedAt: string;
  finishedAt?: string;
  url?: string; // "/research/videos/<slug>.mp4"
  poster?: string; // "/research/videos/<slug>.jpg"
  durationSec?: number;
  aspect?: "9:16" | "1:1" | "16:9";
  error?: string;
  log: { at: string; text: string }[]; // last 60
  stage?: string;
};
