// Unlock a deploy: a form post with INSTANTS_ADMIN_TOKEN sets an httpOnly cookie
// that local-only routes accept on non-loopback hosts.
import { ADMIN_COOKIE, isAdminToken } from "@/lib/server/local-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  const back = (to: string) => new Response(null, { status: 303, headers: { location: to } });
  if (typeof token !== "string" || !isAdminToken(token)) return back("/unlock?error=1");
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const res = back("/sources");
  res.headers.append(
    "set-cookie",
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure ? "; Secure" : ""}`,
  );
  return res;
}

export async function DELETE() {
  return new Response(null, { status: 204, headers: { "set-cookie": `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` } });
}
