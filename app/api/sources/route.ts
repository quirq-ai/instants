import { cachedScan, restoreFolder } from "@/research/engine.mjs";
import { rejectNonLocal } from "@/lib/server/local-only";
import { job } from "@/lib/server/job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Folder states. Served from a short-lived cache; ?rescan=1 forces a fresh walk. */
export async function GET(request: Request) {
  const denied = rejectNonLocal(request);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  const rescan = new URL(request.url).searchParams.get("rescan") === "1";
  try {
    const sources = await cachedScan({ maxAgeMs: rescan ? 0 : 30_000 });
    return Response.json({ sources, running: job.running() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Scan failed", running: job.running() },
      { status: 500 },
    );
  }
}

/** { action: "restore", path }: clear a deleted folder's mark so it can be posted again. */
export async function POST(request: Request) {
  const denied = rejectNonLocal(request);
  if (denied) return Response.json({ error: denied }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { action?: unknown; path?: unknown } | null;
  if (body?.action !== "restore" || typeof body.path !== "string") {
    return Response.json({ error: "Expected { action: \"restore\", path }" }, { status: 400 });
  }
  if (!(await restoreFolder(body.path))) return Response.json({ error: "That folder is not marked deleted." }, { status: 404 });
  return Response.json({ restored: body.path });
}
