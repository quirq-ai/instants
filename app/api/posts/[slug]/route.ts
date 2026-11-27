// Delete a post for good (local only). Its watched folder is marked so it is not posted again.
import { deletePost } from "@/research/engine.mjs";
import { getRecord, updateActivity } from "@/lib/research/library";
import { job } from "@/lib/server/job";
import { localOnly } from "@/lib/server/local-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const rejected = localOnly(request);
  if (rejected) return rejected;
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug) || !(await getRecord(slug))) {
    return Response.json({ error: "Unknown post" }, { status: 404 });
  }
  // A running batch could write the record straight back.
  if (job.running()) {
    return Response.json({ error: "Posts are being generated. Try again when that finishes." }, { status: 409 });
  }
  const record = await deletePost(slug);
  if (!record) return Response.json({ error: "Unknown post" }, { status: 404 });
  await updateActivity((a) => {
    a.saved = a.saved.filter((s) => s !== slug);
    a.pinned = a.pinned.filter((s) => s !== slug);
    a.hidden = a.hidden.filter((s) => s !== slug);
    delete a.read[slug];
    delete a.notes[slug];
  });
  return Response.json({ deleted: slug, folder: record.origin === "upload" ? null : record.path });
}
