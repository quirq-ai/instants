import path from "node:path";
import { ingestUpload, resolveWatchedTarget, runGeneration, scanRoots } from "@/research/engine.mjs";
import { getRecord } from "@/lib/research/library";
import { recordSourcePath } from "@/lib/research/store";
import type { GenerateEvent } from "@/lib/research/types";
import { rejectNonLocal } from "@/lib/server/local-only";
import { job } from "@/lib/server/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAX_UPLOAD = 50 * 1024 * 1024;
const FORM_SLACK = 1024 * 1024;

type JsonBody = { targets?: string[]; slugs?: string[]; all?: boolean; force?: boolean };

class BadRequest extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function resolveJson(body: JsonBody): Promise<{ targets: string[]; force: boolean }> {
  const force = Boolean(body.force);
  const targets = new Set<string>();
  for (const slug of body.slugs ?? []) {
    const record = await getRecord(String(slug));
    if (!record) throw new BadRequest(`No post named "${slug}".`);
    if (record.origin === "upload") {
      const source = recordSourcePath(record);
      const real = source ? await resolveWatchedTarget(source) : null;
      if (!real) throw new BadRequest(`The source folder of "${slug}" is missing.`);
      targets.add(real);
      continue;
    }
    const real = await resolveWatchedTarget(record.path);
    if (!real) throw new BadRequest(`"${slug}" points outside the watched folders.`);
    targets.add(real);
  }
  for (const target of body.targets ?? []) {
    const real = typeof target === "string" ? await resolveWatchedTarget(target) : null;
    if (!real) throw new BadRequest("Targets must be folders listed under a watched root.");
    targets.add(real);
  }
  if (body.all) {
    const status = await scanRoots();
    for (const root of status) {
      for (const folder of root.folders) {
        if (folder.state === "skipped") continue;
        if (force || folder.state === "new" || folder.state === "changed") targets.add(folder.path);
      }
    }
  }
  return { targets: [...targets], force };
}

async function resolveForm(request: Request): Promise<{ targets: string[]; force: boolean }> {
  // Reject oversized bodies before formData() buffers them.
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) throw new BadRequest("Uploads need a Content-Length header.", 411);
  if (declared > MAX_UPLOAD + FORM_SLACK) throw new BadRequest("Uploads are limited to 50 MB in total.", 413);
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const text = String(form.get("text") ?? "");
  const entries = form.getAll("files").filter((v): v is File => typeof v !== "string");
  const total = entries.reduce((sum, file) => sum + file.size, 0) + Buffer.byteLength(text);
  if (total > MAX_UPLOAD) throw new BadRequest("Uploads are limited to 50 MB in total.", 413);
  if (!text.trim() && entries.length === 0) throw new BadRequest("Add at least one file or some text.");
  const files = await Promise.all(
    entries.map(async (file) => ({ name: path.basename(file.name), buffer: Buffer.from(await file.arrayBuffer()) })),
  );
  const folder = await ingestUpload({ title, text, files });
  return { targets: [folder], force: true };
}

export async function POST(request: Request) {
  const denied = rejectNonLocal(request);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  const lock = job.acquire();
  if (!lock) {
    return Response.json(
      { error: "A post is already being generated. Wait for it to finish, then try again." },
      { status: 409 },
    );
  }
  // A client that disconnects (during upload parsing or the stream) cancels the run.
  const onClientAbort = () => lock.abort("client disconnected");
  request.signal.addEventListener("abort", onClientAbort, { once: true });

  let plan: { targets: string[]; force: boolean };
  try {
    const type = request.headers.get("content-type") ?? "";
    plan = type.includes("multipart/form-data")
      ? await resolveForm(request)
      : await resolveJson((await request.json().catch(() => ({}))) as JsonBody);
  } catch (error) {
    request.signal.removeEventListener("abort", onClientAbort);
    lock.release();
    const message = error instanceof Error ? error.message : "Invalid request";
    return Response.json({ error: message }, { status: error instanceof BadRequest ? error.status : 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: GenerateEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
          lock.abort("stream closed");
        }
      };
      try {
        if (plan.targets.length === 0) {
          send({ type: "start", total: 0 });
          send({ type: "end", posts: 0, failed: 0 });
        } else {
          await runGeneration({ targets: plan.targets, force: plan.force, onEvent: send, signal: lock.signal });
        }
      } catch (error) {
        send({ type: "error", name: "job", message: error instanceof Error ? error.message : String(error) });
        send({ type: "end", posts: 0, failed: 1 });
      } finally {
        request.signal.removeEventListener("abort", onClientAbort);
        lock.release();
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      }
    },
    cancel() {
      lock.abort("client cancelled");
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
