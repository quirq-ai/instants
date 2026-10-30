// One guard for every local-only route handler: loopback Host, loopback Origin,
// and on writes an Origin or same-origin/none Sec-Fetch-Site (blocks cross-site
// form posts and headerless scripted requests).
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostname(value: string) {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Null when the request is allowed, otherwise a reason to reject it. */
export function rejectNonLocal(request: Request): string | null {
  if (!LOOPBACK.has(hostname(request.headers.get("host") ?? ""))) return "Instants only accepts requests on localhost.";
  const origin = request.headers.get("origin");
  if (origin && !LOOPBACK.has(hostname(origin))) return "Cross-site requests are not allowed.";
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
