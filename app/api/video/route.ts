import { deleteVideo } from "@/research/video.mjs";
import { getRecord, getVideoStatus } from "@/lib/research/library";
import type { VideoStatus } from "@/lib/research/types";
import { localOnly } from "@/lib/server/local-only";
import { videoJob } from "@/lib/server/video-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASPECTS = ["9:16", "1:1", "16:9"] as const;
type Aspect = NonNullable<VideoStatus["aspect"]>;
const validSlug = (slug: unknown): slug is string => typeof slug === "string" && /^[a-z0-9-]+$/.test(slug);

export async function GET(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const slug = new URL(request.url).searchParams.get("slug");
  if (!validSlug(slug)) return Response.json({ error: "Pass ?slug=" }, { status: 400 });
  return Response.json({ status: await getVideoStatus(slug), running: videoJob.running(), limit: videoJob.limit }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { slug?: unknown; aspect?: unknown; length?: unknown };
  if (!validSlug(body.slug)) return Response.json({ error: "slug is required" }, { status: 400 });
  const aspect = (body.aspect ?? "9:16") as Aspect;
  if (!ASPECTS.includes(aspect)) return Response.json({ error: "aspect must be 9:16, 1:1 or 16:9" }, { status: 400 });
  const length = body.length === undefined ? 45 : Number(body.length);
  if (!Number.isFinite(length) || length < 10 || length > 120) return Response.json({ error: "length must be 10 to 120 seconds" }, { status: 400 });
  if (!(await getRecord(body.slug))) return Response.json({ error: `No post named "${body.slug}".` }, { status: 404 });
  const queued = videoJob.full();
  const first = videoJob.start({ slug: body.slug, aspect, length: Math.round(length) });
  if (!first) {
    return Response.json({ error: "A video for this post is already being made.", running: videoJob.running() }, { status: 409 });
  }
  return Response.json({ status: await first, queued, limit: videoJob.limit }, { status: 202 });
}

export async function DELETE(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const slug = new URL(request.url).searchParams.get("slug");
  if (!validSlug(slug)) return Response.json({ error: "Pass ?slug=" }, { status: 400 });
  if (videoJob.isRunning(slug)) {
    videoJob.cancel(slug, "deleted");
    await new Promise((r) => setTimeout(r, 300));
  }
  await deleteVideo(slug);
  return Response.json({ ok: true });
}
