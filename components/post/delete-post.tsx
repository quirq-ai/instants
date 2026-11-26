"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** DELETE /api/posts/<slug>. Resolves true when the post is gone. */
export async function deletePost(slug: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
    toast.success("Post deleted. Its folder will not be posted again unless you restore it on Sources.");
    return true;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Could not delete the post");
    return false;
  }
}

/**
 * Confirm, then delete a post for good. `trigger` is the button that opens the dialog;
 * `onDeleted` runs after a successful delete (default: go to the feed).
 */
export function DeletePostDialog({
  slug,
  title,
  upload = false,
  trigger,
  onDeleted,
}: {
  slug: string;
  title: string;
  upload?: boolean;
  trigger: React.ReactNode;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const ok = await deletePost(slug);
    setBusy(false);
    if (!ok) return;
    if (onDeleted) onDeleted();
    else router.push("/");
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{title}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            {upload
              ? "The post, its slides, video and the uploaded files are removed. This cannot be undone."
              : "The post, its slides and video are removed, and its folder is marked so it is never posted again. You can restore the folder on Sources. Your research files are not touched."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={busy} variant="destructive">
            Delete post
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Pill-shaped Delete button with confirmation, for the post page. */
export function DeletePostButton({ slug, title, upload }: { slug: string; title: string; upload?: boolean }) {
  return (
    <DeletePostDialog
      slug={slug}
      title={title}
      upload={upload}
      trigger={
        <button
          type="button"
          className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-[var(--danger)] transition hover:bg-surface-2"
        >
          <Trash2 className="size-3.5" />
          Delete
        </button>
      }
    />
  );
}
