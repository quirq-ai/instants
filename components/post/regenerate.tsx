"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { GenerateEvent } from "@/lib/research/types";

const STAGE_LABEL: Record<string, string> = {
  collecting: "Collecting files",
  writing: "Writing the post",
  rendering: "Rendering slides",
  cached: "Up to date",
  skipped: "Skipped",
};

/** Calls POST /api/generate for this slug and shows the NDJSON progress live. */
export function RegenerateButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const busy = status !== null;

  async function run() {
    setStatus("Starting");
    let failed: string | null = null;
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slugs: [slug], force: true }),
      });
      if (!res.ok || !res.body) throw new Error(`Generator unavailable (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as GenerateEvent;
          if (event.type === "stage") setStatus(`${STAGE_LABEL[event.stage] ?? event.stage}${event.detail ? `: ${event.detail}` : ""}`);
          else if (event.type === "error") failed = event.message;
          else if (event.type === "done") setStatus("Done");
        }
        if (done) break;
      }
      if (failed) throw new Error(failed);
      toast.success("Post regenerated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Regeneration failed");
    } finally {
      setStatus(null);
    }
  }

  return (
    <div className="contents">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-medium text-ink-2 transition hover:bg-surface-2 disabled:opacity-70"
      >
        <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Regenerating" : "Regenerate"}
      </button>
      {busy && (
        <p role="status" aria-live="polite" className="basis-full font-mono text-[12px] text-muted-foreground">
          {status}
        </p>
      )}
    </div>
  );
}
