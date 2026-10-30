// Per-user activity (save, pin, hide, read, notes). Local only.
import { getActivity, getRecord, updateActivity } from "@/lib/research/library";
import { localOnly } from "@/lib/server/local-only";

const ACTIONS = ["save", "unsave", "pin", "unpin", "hide", "unhide", "read", "note", "deleteNote"] as const;
type Action = (typeof ACTIONS)[number];

/** A timestamp id no other note on this post already uses. */
function uniqueAt(notes: { at: string }[]) {
  const used = new Set(notes.map((n) => n.at));
  let t = Date.now();
  while (used.has(new Date(t).toISOString())) t++;
  return new Date(t).toISOString();
}

const add = (list: string[], slug: string) => (list.includes(slug) ? list : [...list, slug]);
const remove = (list: string[], slug: string) => list.filter((item) => item !== slug);

export async function GET(request: Request) {
  const rejected = localOnly(request);
  if (rejected) return rejected;
  return Response.json(await getActivity());
}

export async function POST(request: Request) {
  const rejected = localOnly(request);
  if (rejected) return rejected;

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    slug?: unknown;
    text?: unknown;
    index?: unknown;
    at?: unknown;
  } | null;
  const action = body?.action as Action;
  const slug = body?.slug;
  if (!ACTIONS.includes(action)) return Response.json({ error: "Unknown action" }, { status: 400 });
  if (typeof slug !== "string" || !(await getRecord(slug))) {
    return Response.json({ error: "Unknown post" }, { status: 404 });
  }
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (action === "note" && !text) return Response.json({ error: "Note text is required" }, { status: 400 });
  // Notes are deleted by their stable `at` timestamp; a bare index is accepted only
  // from old clients and is ignored when `at` is present.
  const at = typeof body?.at === "string" ? body.at : null;
  const index = body?.index;
  if (action === "deleteNote" && !at && !(typeof index === "number" && Number.isInteger(index) && index >= 0)) {
    return Response.json({ error: "Note id (at) is required" }, { status: 400 });
  }

  const activity = await updateActivity((a) => {
    switch (action) {
      case "save": a.saved = add(a.saved, slug); break;
      case "unsave": a.saved = remove(a.saved, slug); break;
      case "pin": a.pinned = add(a.pinned, slug); break;
      case "unpin": a.pinned = remove(a.pinned, slug); break;
      case "hide": a.hidden = add(a.hidden, slug); break;
      case "unhide": a.hidden = remove(a.hidden, slug); break;
      case "read": if (!a.read[slug]) a.read = { ...a.read, [slug]: new Date().toISOString() }; break;
      case "note":
        a.notes = { ...a.notes, [slug]: [...(a.notes[slug] ?? []), { text, at: uniqueAt(a.notes[slug] ?? []) }] };
        break;
      case "deleteNote":
        a.notes = {
          ...a.notes,
          [slug]: (a.notes[slug] ?? []).filter((note, i) => (at ? note.at !== at : i !== index)),
        };
        break;
    }
  });
  return Response.json(activity);
}
