// Space (Spacehub) connection: status, pending sources and actions. Local only.
import { localOnly } from "@/lib/server/local-only";
import * as space from "@/lib/server/space";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function snapshot() {
  const status = space.status();
  if (status.state === "conflict" && !status.gitStatus) status.gitStatus = await space.refreshGitStatus();
  return {
    config: space.config(),
    status,
    hubUrl: status.project ? space.hubUrl(status.project) : null,
    generating: space.generatingSlug(),
    pending: await space.pending(),
  };
}

export async function GET(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  return Response.json(await snapshot(), { headers: { "cache-control": "no-store" } });
}

type Body =
  | { action: "connect"; project?: unknown }
  | { action: "disconnect" }
  | { action: "setAutoGenerate"; value?: unknown }
  | { action: "syncNow" }
  | { action: "openFolder" }
  | { action: "generatePending"; slugs?: unknown };

export async function POST(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as Body | null;
  try {
    switch (body?.action) {
      case "connect": {
        const project = typeof body.project === "string" ? body.project.trim() : body.project;
        if (!space.validProject(project)) return Response.json({ error: "Project must look like space/name, for example quirq/curie." }, { status: 400 });
        await space.connect(project);
        break;
      }
      case "disconnect":
        await space.disconnect();
        break;
      case "setAutoGenerate":
        if (typeof body.value !== "boolean") return Response.json({ error: "value must be true or false" }, { status: 400 });
        await space.setAutoGenerate(body.value);
        break;
      case "syncNow":
        await space.syncNow();
        break;
      case "openFolder":
        await space.openFolder();
        break;
      case "generatePending": {
        const slugs = body.slugs === undefined ? undefined : Array.isArray(body.slugs) ? body.slugs.filter((s): s is string => typeof s === "string" && /^[a-z0-9][a-z0-9._-]*$/i.test(s)) : null;
        if (slugs === null) return Response.json({ error: "slugs must be a list" }, { status: 400 });
        const results = await space.generatePending(slugs, true);
        return Response.json({ ...(await snapshot()), results });
      }
      default:
        return Response.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error), ...(await snapshot()) }, { status: 502 });
  }
  return Response.json(await snapshot());
}
