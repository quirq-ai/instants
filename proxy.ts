// Unknown post slugs and topics must answer 404. The root loading.tsx streams
// the shell (and a 200 status) before a page can call notFound(), so the
// existence check runs here, before rendering starts, and rewrites misses to
// an unmatched path that Next serves with a real 404.
import { NextResponse, type NextRequest } from "next/server";
import { topicSlug } from "@/lib/research/format";
import { findPost } from "@/lib/research/store";
import { hubMode, hubRecord } from "@/lib/research/hub";
import { TOPICS } from "@/lib/research/types";

const TOPIC_SLUGS = new Set(TOPICS.map(topicSlug));
const MISSING = "/_instants-not-found";

async function postExists(slug: string) {
  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  if (hubMode()) return Boolean(await hubRecord(slug).catch(() => null));
  return Boolean(findPost(slug));
}

export async function proxy(request: NextRequest) {
  const [, section, value, extra] = request.nextUrl.pathname.split("/");
  let segment = "";
  try {
    segment = decodeURIComponent(value ?? "");
  } catch {}
  const ok =
    extra === undefined &&
    (section === "p" ? await postExists(segment) : section === "topics" ? TOPIC_SLUGS.has(segment) : true);
  return ok ? NextResponse.next() : NextResponse.rewrite(new URL(MISSING, request.url));
}

export const config = { matcher: ["/p/:slug*", "/topics/:topic+"] };
