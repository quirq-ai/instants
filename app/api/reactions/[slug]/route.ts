// Thumbs up / down on a post. Anyone may react on the hub site; each browser
// gets one vote per post (an anonymous id cookie), committed to Spacehub.
import { randomUUID } from "node:crypto";
import { getRecord } from "@/lib/research/library";
import { canReact, getReactions, setReaction, VOTER_COOKIE, type Vote } from "@/lib/server/reactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9-]+$/;
const ID = /^[0-9a-f-]{36}$/;

function voter(request: Request) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === VOTER_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return ID.test(value) ? value : null;
    }
  }
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return Response.json({ error: "Unknown post" }, { status: 404 });
  return Response.json(await getReactions(slug, voter(request)));
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Same-site requests only: blocks other sites posting votes from a visitor's browser.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return Response.json({ error: "Cross-site request" }, { status: 403 });
  if (!canReact()) return Response.json({ error: "Reactions are saved from the hub site only." }, { status: 403 });
  if (!SLUG.test(slug) || !(await getRecord(slug))) return Response.json({ error: "Unknown post" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { vote?: unknown } | null;
  const vote = body?.vote === "up" || body?.vote === "down" ? (body.vote as Vote) : body?.vote === null ? null : undefined;
  if (vote === undefined) return Response.json({ error: "vote must be up, down or null" }, { status: 400 });

  const existing = voter(request);
  const id = existing ?? randomUUID();
  try {
    const summary = await setReaction(slug, id, vote);
    const res = Response.json(summary);
    if (!existing) {
      const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
      res.headers.append("set-cookie", `${VOTER_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
    }
    return res;
  } catch (error) {
    console.error("[instants] reaction failed:", error);
    return Response.json({ error: "Could not save your reaction. Try again." }, { status: 502 });
  }
}
