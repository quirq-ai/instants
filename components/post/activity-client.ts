"use client";

// Client helpers for per-post activity (save, pin, hide, notes) and local actions.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Activity } from "@/lib/research/types";

export type ActivityAction =
  | "save"
  | "unsave"
  | "pin"
  | "unpin"
  | "hide"
  | "unhide"
  | "read"
  | "note"
  | "deleteNote";

export async function sendActivity(body: {
  action: ActivityAction;
  slug: string;
  text?: string;
  index?: number;
  at?: string;
}): Promise<Activity> {
  const res = await fetch("/api/activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  return res.json();
}

/** Optimistic boolean toggle backed by /api/activity, refreshes server data after. */
export function useActivityFlag(
  slug: string,
  initial: boolean,
  on: ActivityAction,
  off: ActivityAction,
  labels: { on: string; off: string },
) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);

  async function toggle() {
    const next = !value;
    setValue(next);
    try {
      await sendActivity({ action: next ? on : off, slug });
      toast.success(next ? labels.on : labels.off);
      router.refresh();
    } catch (error) {
      setValue(!next);
      toast.error(error instanceof Error ? error.message : "Could not update");
    }
  }
  return [value, toggle] as const;
}

export async function openFolder(slug: string) {
  try {
    const res = await fetch("/api/open", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not open folder");
    toast.success("Opened in your file browser");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not open folder");
  }
}

export async function copyPostLink(slug: string) {
  const url = `${window.location.origin}/p/${slug}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("Clipboard is unavailable");
  }
}
