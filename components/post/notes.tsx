"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RelativeTime } from "@/components/shell/relative-time";
import { sendActivity } from "./activity-client";

type Note = { text: string; at: string };

export function Notes({ slug, initial }: { slug: string; initial: Note[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initial);
  const [draft, setDraft] = useState("");
  useEffect(() => setNotes(initial), [initial]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const prev = notes;
    setNotes([...notes, { text, at: new Date().toISOString() }]);
    setDraft("");
    try {
      await sendActivity({ action: "note", slug, text });
      router.refresh();
    } catch (error) {
      setNotes(prev);
      setDraft(text);
      toast.error(error instanceof Error ? error.message : "Could not save note");
    }
  }

  async function remove(at: string) {
    const prev = notes;
    setNotes(notes.filter((note) => note.at !== at));
    try {
      await sendActivity({ action: "deleteNote", slug, at });
      router.refresh();
    } catch (error) {
      setNotes(prev);
      toast.error(error instanceof Error ? error.message : "Could not delete note");
    }
  }

  return (
    <div>
      {notes.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Only you see these. Jot what you would do next, or why it mattered.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note, i) => (
            <li key={`${note.at}-${i}`} className="group flex gap-2 rounded-[10px] bg-surface-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap break-words text-[14px] text-ink-2">{note.text}</p>
                <p className="mt-0.5 text-[11px] text-faint"><RelativeTime iso={note.at} /></p>
              </div>
              <button
                type="button"
                onClick={() => remove(note.at)}
                aria-label="Delete note"
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface-3 hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-3 flex gap-2">
        <label htmlFor={`note-${slug}`} className="sr-only">
          Add a private note
        </label>
        <input
          id={`note-${slug}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a private note"
          maxLength={4000}
          className="h-9 min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 text-sm outline-none placeholder:text-faint focus:border-line-strong"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="h-9 rounded-[10px] bg-ink px-3 text-sm font-medium text-bg disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </div>
  );
}
