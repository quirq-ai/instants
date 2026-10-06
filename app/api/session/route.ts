import { randomUUID } from "node:crypto";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getLocalWorkspace } from "@/engine/local-workspace.mjs";
import { LogStoreError } from "@/engine/jsonl-store.mjs";
import { LogError } from "@/engine/log-schema.mjs";
import { hasSameOrigin } from "@/engine/http.mjs";
import { isSessionId } from "@/engine/schema.mjs";
import type { SeedData } from "@/lib/data";
import mock from "@/data/mock.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "instants-session";
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function failure(error: unknown) {
  if (error instanceof LogError || error instanceof LogStoreError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.status, headers },
    );
  }
  return NextResponse.json(
    {
      error: "storage_unavailable",
      message: "The private journals could not be accessed. Please try again.",
    },
    { status: 503, headers },
  );
}

function requireLocalRequest(request: NextRequest) {
  const host = request.headers.get("host");
  if (!host || /[\s\\/@?#]/.test(host))
    throw new LogError(
      "invalid_host",
      "Local journal access requires a loopback address.",
      403,
    );
  let hostname: string;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    throw new LogError(
      "invalid_host",
      "Local journal access requires a loopback address.",
      403,
    );
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname))
    throw new LogError(
      "invalid_host",
      "Local journal access requires a loopback address.",
      403,
    );
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin !== null && !hasSameOrigin(request.url, origin, host))
  )
    throw new LogError(
      "invalid_origin",
      "Private journals can only be opened from this app.",
      403,
    );
}

function workspace(profileId: string) {
  const root = path.resolve(
    /* turbopackIgnore: true */ process.env.INSTANTS_DATA_DIR ||
      path.join(process.cwd(), ".instants"),
  );
  return getLocalWorkspace({
    directory: path.join(root, profileId),
    lockDirectory: root,
    profileId,
    seed: mock as SeedData,
  });
}

async function readBody(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > MAX_REQUEST_BYTES)
    throw new LogError(
      "request_too_large",
      "Journal requests must be smaller than 8 MiB.",
      413,
    );
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new LogError(
      "invalid_content_type",
      "Send journal entries as application/json.",
      415,
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new LogError("invalid_request", "Journal entries are required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new LogError(
        "request_too_large",
        "Journal requests must be smaller than 8 MiB.",
        413,
      );
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new LogError(
      "invalid_json",
      "The journal request is not valid UTF-8 JSON.",
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new LogError("invalid_request", "Send a journal request object.");
  return body as Record<string, unknown>;
}

function setProfileCookie(response: NextResponse, profileId: string) {
  response.cookies.set(COOKIE, profileId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function GET(request: NextRequest) {
  if (process.env.VERCEL)
    return NextResponse.json({ mode: "browser" }, { headers });
  try {
    requireLocalRequest(request);
    const cookie = request.cookies.get(COOKIE)?.value;
    const profileId = cookie && isSessionId(cookie) ? cookie : randomUUID();
    const store = workspace(profileId);
    const requestedExport = request.nextUrl.searchParams.get("export");
    let response: NextResponse;
    if (requestedExport !== null) {
      if (requestedExport !== "timeline" && requestedExport !== "activity")
        throw new LogError(
          "invalid_log",
          "Choose the timeline or activity log.",
        );
      response = new NextResponse(await store.exportLog(requestedExport), {
        headers: {
          ...headers,
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Content-Disposition": `attachment; filename="${requestedExport}.jsonl"`,
        },
      });
    } else {
      const snapshot = await store.read();
      response = NextResponse.json(
        request.nextUrl.searchParams.get("since") === snapshot.revision
          ? {
              mode: "file",
              profileId,
              revision: snapshot.revision,
              unchanged: true,
            }
          : { mode: "file", profileId, ...snapshot },
        { headers },
      );
    }
    if (cookie !== profileId) setProfileCookie(response, profileId);
    return response;
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  if (
    !hasSameOrigin(
      request.url,
      request.headers.get("origin"),
      request.headers.get("host"),
    )
  )
    return failure(
      new LogError(
        "invalid_origin",
        "Journal changes can only be saved from this app.",
        403,
      ),
    );
  if (process.env.VERCEL)
    return failure(
      new LogError(
        "browser_storage",
        "This deployment stores private journals in your browser.",
        501,
      ),
    );
  try {
    requireLocalRequest(request);
    const profileId = request.cookies.get(COOKIE)?.value;
    if (!profileId || !isSessionId(profileId))
      throw new LogError(
        "session_missing",
        "Open your private workspace before saving activity.",
        401,
      );
    if (request.headers.get("x-instants-profile") !== profileId)
      throw new LogError(
        "profile_changed",
        "The active profile changed. Reload the workspace before saving these changes.",
        409,
      );
    const body = await readBody(request);
    if (!Array.isArray(body.entries))
      throw new LogError("invalid_batch", "Send an array of journal entries.");
    const store = workspace(profileId);
    let snapshot;
    if (body.action === "import") {
      if (
        Object.keys(body).some(
          (key) => !["action", "entries", "replace"].includes(key),
        ) ||
        (body.replace !== undefined && typeof body.replace !== "boolean")
      )
        throw new LogError(
          "invalid_request",
          "Choose whether the imported feed replaces the current feed.",
        );
      snapshot = await store.importTimeline(body.entries, {
        replace: body.replace === true,
      });
    } else {
      if (
        Object.keys(body).some((key) => !["log", "entries"].includes(key)) ||
        (body.log !== "timeline" && body.log !== "activity")
      )
        throw new LogError(
          "invalid_request",
          "Choose the timeline or activity log.",
        );
      snapshot = await store.append(body.log, body.entries);
    }
    return NextResponse.json(
      { mode: "file", profileId, ...snapshot },
      { headers },
    );
  } catch (error) {
    return failure(error);
  }
}
