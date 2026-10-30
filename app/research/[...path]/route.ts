// Serve generated media and videos from the content store at the URLs records
// already use: /research/media/<slug>/<file> and /research/videos/<slug>.mp4|.jpg.
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { ensureStore, resolveInStore, storeDir } from "@/lib/research/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const notFound = () => new Response("Not found", { status: 404 });

async function serve(request: Request, parts: string[], head: boolean) {
  if (parts.length < 2 || (parts[0] !== "media" && parts[0] !== "videos")) return notFound();
  if (!parts.every((p) => SEGMENT.test(p) && p !== "." && p !== "..")) return notFound();
  const type = TYPES[path.extname(parts[parts.length - 1]).toLowerCase()];
  if (!type) return notFound();
  await ensureStore().catch(() => {});
  const root = storeDir();
  const file = resolveInStore(parts.join("/"), root);
  if (!file) return notFound();
  // Refuse symlinks that leave the store.
  const real = await fs.realpath(file).catch(() => null);
  const rootReal = await fs.realpath(root).catch(() => root);
  if (!real || !real.startsWith(rootReal + path.sep)) return notFound();
  const stat = await fs.stat(real).catch(() => null);
  if (!stat?.isFile()) return notFound();

  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = new Headers({
    "content-type": type,
    "accept-ranges": "bytes",
    etag,
    "last-modified": stat.mtime.toUTCString(),
    "cache-control": "public, max-age=0, must-revalidate",
    "x-content-type-options": "nosniff",
  });
  if (type === "image/svg+xml") headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");

  const inm = request.headers.get("if-none-match");
  if (inm && inm.split(",").some((t) => t.trim() === etag)) return new Response(null, { status: 304, headers });

  const size = stat.size;
  const range = request.headers.get("range");
  const ifRange = request.headers.get("if-range");
  if (range && (!ifRange || ifRange === etag)) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    let start = m && m[1] ? Number(m[1]) : NaN;
    let end = m && m[2] ? Number(m[2]) : NaN;
    if (m && !m[1] && m[2]) {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else if (m && m[1] && !m[2]) end = size - 1;
    if (!m || !Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
      headers.set("content-range", `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    end = Math.min(end, size - 1);
    headers.set("content-range", `bytes ${start}-${end}/${size}`);
    headers.set("content-length", String(end - start + 1));
    const body = head ? null : (Readable.toWeb(createReadStream(real, { start, end })) as ReadableStream);
    return new Response(body, { status: 206, headers });
  }
  headers.set("content-length", String(size));
  const body = head ? null : (Readable.toWeb(createReadStream(real)) as ReadableStream);
  return new Response(body, { status: 200, headers });
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return serve(request, (await ctx.params).path, false);
}

export async function HEAD(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return serve(request, (await ctx.params).path, true);
}
