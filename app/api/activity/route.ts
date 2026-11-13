// Activity on posts. Like and hide move the post between the store's shelves
// (posts/, liked/, hidden/) and sync with it; save, pin, read and notes are per-user.
import { getActivity, getRecord, updateActivity } from "@/lib/research/library";
import { findPost, movePost } from "@/lib/research/store";
import { localOnly } from "@/lib/server/local-only";

const ACTIONS = ["save", "unsave", "pin", "unpin", "like", "unlike", "hide", "unhide", "read", "note", "deleteNote"] as const;
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

  // A post sits on one shelf, so liking a hidden post unhides it and hiding a liked one unlikes it.
  if (action === "like") await movePost(slug, "liked");
  else if (action === "hide") await movePost(slug, "hidden");
  else if (action === "unlike" && findPost(slug)?.shelf === "liked") await movePost(slug, "posts");
  else if (action === "unhide" && findPost(slug)?.shelf === "hidden") await movePost(slug, "posts");
  if (["like", "unlike", "hide", "unhide"].includes(action)) return Response.json(await getActivity());

  await updateActivity((a) => {
    switch (action) {
      case "save": a.saved = add(a.saved, slug); break;
      case "unsave": a.saved = remove(a.saved, slug); break;
      case "pin": a.pinned = add(a.pinned, slug); break;
      case "unpin": a.pinned = remove(a.pinned, slug); break;
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
  return Response.json(await getActivity());
}
