"use client";

// Share a post to X, to Instagram (through the system share sheet, the only way
// a web page can hand Instagram a photo or video) or to any other app.
import { toast } from "sonner";
import type { ResearchRecord, VideoStatus } from "@/lib/research/types";

/** The post's media for Instagram: its video when ready, else a slide image. */
export type MediaSource = () => Promise<File | undefined>;

const postUrl = (slug: string) => `${window.location.origin}/p/${slug}`;
const shareText = (record: ResearchRecord) => `${record.post.title}: ${record.post.hook}`;

export function videoMedia(slug: string, video: VideoStatus | null | undefined): MediaSource | undefined {
  if (video?.state !== "ready" || !video.url) return undefined;
  const url = video.url;
  return async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load the video (${res.status})`);
    return new File([await res.blob()], `${slug}.mp4`, { type: "video/mp4" });
  };
}

function canShareFiles(files: File[]) {
  return typeof navigator.canShare === "function" && navigator.canShare({ files });
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function save(file: File) {
  const href = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = href;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export function shareToX(record: ResearchRecord) {
  const params = new URLSearchParams({ text: shareText(record), url: postUrl(record.slug) });
  window.open(`https://x.com/intent/post?${params}`, "_blank", "noopener,noreferrer");
}

export async function shareToInstagram(record: ResearchRecord, media: MediaSource) {
  const pending = toast.loading("Preparing media...");
  try {
    const file = await media();
    toast.dismiss(pending);
    if (!file) throw new Error("Nothing to share");
    if (canShareFiles([file])) {
      // Instagram reads the file, not text; the caption goes to the clipboard.
      await navigator.clipboard?.writeText(`${shareText(record)}\n${postUrl(record.slug)}`).catch(() => {});
      try {
        await navigator.share({ files: [file] });
      } catch (error) {
        // Safari drops the tap once preparing the file takes a while; ask for a second tap.
        if (!(error instanceof DOMException && error.name === "NotAllowedError")) throw error;
        toast("Ready to share", {
          duration: 15_000,
          action: { label: "Share", onClick: () => void navigator.share({ files: [file] }).catch(() => {}) },
        });
      }
      return;
    }
    save(file);
    toast.success(`Saved ${file.name}. Post it from the Instagram app.`);
  } catch (error) {
    toast.dismiss(pending);
    if (!isAbort(error)) toast.error(error instanceof Error ? error.message : "Could not share");
  }
}

export async function shareElsewhere(record: ResearchRecord) {
  const data = { title: record.post.title, text: shareText(record), url: postUrl(record.slug) };
  if (typeof navigator.share === "function") {
    try {
      await navigator.share(data);
    } catch (error) {
      if (!isAbort(error)) toast.error("Could not open the share sheet");
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(data.url);
    toast.success("Sharing is not available here, link copied");
  } catch {
    toast.error("Clipboard is unavailable");
  }
}

export function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z" />
    </svg>
  );
}

export function InstagramIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.9}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
