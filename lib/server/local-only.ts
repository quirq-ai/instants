// One guard for every local-only route handler: loopback Host, loopback Origin,
// and on writes an Origin or same-origin/none Sec-Fetch-Site (blocks cross-site
// form posts and headerless scripted requests). Host is client-controlled, so a
// production server (next start, the Docker image) never trusts it: there every
// action needs the unlock cookie matching INSTANTS_ADMIN_TOKEN.
import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "instants_admin";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostname(value: string) {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const digest = (value: string) => createHash("sha256").update(value).digest();

/** True when INSTANTS_ADMIN_TOKEN is set and `value` matches it. */
export function isAdminToken(value: string | null | undefined) {
  const token = process.env.INSTANTS_ADMIN_TOKEN;
  return Boolean(token && value && timingSafeEqual(digest(token), digest(value)));
}

function cookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** Null when the request is allowed, otherwise a reason to reject it. */
export function rejectNonLocal(request: Request): string | null {
  const host = hostname(request.headers.get("host") ?? "");
  // Loopback Host is only trusted by `next dev` (or INSTANTS_TRUST_LOCALHOST=1).
  const trustHost = process.env.NODE_ENV !== "production" || process.env.INSTANTS_TRUST_LOCALHOST === "1";
  const local = trustHost && LOOPBACK.has(host);
  if (!local && !isAdminToken(cookie(request, ADMIN_COOKIE))) {
    return process.env.INSTANTS_ADMIN_TOKEN ? "Unlock this deploy at /unlock first." : "Actions are off: set INSTANTS_ADMIN_TOKEN and unlock at /unlock.";
  }
  const origin = request.headers.get("origin");
  if (origin && (local ? !LOOPBACK.has(hostname(origin)) : hostname(origin) !== host)) return "Cross-site requests are not allowed.";
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return "Cross-site requests are not allowed.";
  if (request.method !== "GET" && request.method !== "HEAD" && !origin && site !== "same-origin" && site !== "none") {
    return "State-changing requests need an Origin or Sec-Fetch-Site header.";
  }
  return null;
}

/** Same check as rejectNonLocal, returned as a 403 Response or null. */
export function localOnly(request: Request): Response | null {
  const reason = rejectNonLocal(request);
  return reason ? Response.json({ error: reason }, { status: 403 }) : null;
}
