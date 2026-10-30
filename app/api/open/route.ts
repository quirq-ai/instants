// Reveal a post's source folder in the OS file browser. Local only; the path
// always comes from the stored record, never from the client.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { getRecord } from "@/lib/research/library";
import { localOnly } from "@/lib/server/local-only";

export async function POST(request: Request) {
  const rejected = localOnly(request);
  if (rejected) return rejected;
  const body = (await request.json().catch(() => null)) as { slug?: unknown } | null;
  const record = typeof body?.slug === "string" ? await getRecord(body.slug) : null;
  if (!record) return Response.json({ error: "Unknown post" }, { status: 404 });
  const stat = await fs.stat(record.path).catch(() => null);
  if (!stat) return Response.json({ error: "The source folder no longer exists" }, { status: 410 });

  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", stat.isDirectory() ? [record.path] : ["-R", record.path]]
      : process.platform === "win32"
        ? ["explorer", [record.path]]
        : ["xdg-open", [record.path]];
  try {
    await new Promise<void>((resolve, reject) =>
      execFile(/*turbopackIgnore: true*/ cmd, args, (error) => (error ? reject(error) : resolve())),
    );
  } catch {
    return Response.json({ error: "Could not open the folder" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
