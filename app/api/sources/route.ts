import { cachedScan } from "@/research/engine.mjs";
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
