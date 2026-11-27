// Write one small file to the space project (INSTANTS_SPACE) as a commit on its
// branch, straight over the hub's SpacetimeDB connection: read the head commit
// and only the trees on the file's path, build the new blob, trees and commit,
// upload them and move the branch with a compare-and-swap. A stale head (someone
// pushed meanwhile) retries from the new head. Server only: SPACEHUB_TOKEN must
// belong to a builder or agent that may write to the project.
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RowTypedQuery } from "spacetimedb";
import { DbConnection, tables } from "./module_bindings";

const OID = /^[0-9a-f]{40}$/;
const TREE = "40000";
const FILE = "100644";
const CONNECT_TIMEOUT_MS = 15_000;
const ATTEMPTS = 4;

type Kind = "blob" | "tree" | "commit";
type Entry = { mode: string; name: string; oid: string };
type Obj = { oid: string; kind: Kind; data: Uint8Array };

export class HubWriteError extends Error {}

function settings() {
  const project = (process.env.INSTANTS_SPACE || "quirq/curie").trim();
  const server = (process.env.SPACEHUB_SERVER || "wss://hub.quirq.dev").trim().replace(/^http/, "ws").replace(/\/+$/, "");
  const database = process.env.SPACEHUB_DB?.trim() || "spacehub";
  const branch = process.env.INSTANTS_BRANCH?.trim() || "main";
  return { project, server, database, branch, token: process.env.SPACEHUB_TOKEN?.trim() || savedToken(server) };
}

/** The token `spacehub auth login` saved on this machine, for local runs without SPACEHUB_TOKEN. */
function savedToken(server: string): string | undefined {
  if (process.env.VERCEL) return undefined;
  try {
    const file = path.join(process.env.SPACEHUB_HOME || path.join(os.homedir(), ".spacehub"), "config.json");
    const token = (JSON.parse(fs.readFileSync(file, "utf8")) as { tokens?: Record<string, unknown> }).tokens?.[server];
    return typeof token === "string" && token ? token : undefined;
  } catch {
    return undefined;
  }
}

export function hubWritable(): boolean {
  return Boolean(settings().token);
}

// ---------------------------------------------------------------- git objects

function hash(kind: Kind, data: Uint8Array) {
  return createHash("sha1").update(`${kind} ${data.length}\0`).update(data).digest("hex");
}

function make(kind: Kind, data: Uint8Array): Obj {
  return { oid: hash(kind, data), kind, data };
}

function parseTree(data: Uint8Array): Entry[] {
  const out: Entry[] = [];
  let i = 0;
  while (i < data.length) {
    const space = data.indexOf(0x20, i);
    const nul = data.indexOf(0, space + 1);
    if (space < 0 || nul < 0 || nul + 21 > data.length) throw new Error("Malformed git tree");
    out.push({
      mode: Buffer.from(data.subarray(i, space)).toString("latin1"),
      name: Buffer.from(data.subarray(space + 1, nul)).toString("utf8"),
      oid: Buffer.from(data.subarray(nul + 1, nul + 21)).toString("hex"),
    });
    i = nul + 21;
  }
  return out;
}

const isDir = (mode: string) => mode === TREE || mode === "040000";

function serializeTree(entries: Entry[]): Uint8Array {
  const key = (e: Entry) => Buffer.from(e.name + (isDir(e.mode) ? "/" : ""), "utf8");
  const sorted = [...entries].sort((a, b) => Buffer.compare(key(a), key(b)));
  return Buffer.concat(
    sorted.map((e) => Buffer.concat([Buffer.from(`${isDir(e.mode) ? TREE : e.mode} ${e.name}\0`, "utf8"), Buffer.from(e.oid, "hex")])),
  );
}

function commitTree(data: Uint8Array): string {
  const tree = /^tree ([0-9a-f]{40})$/m.exec(Buffer.from(data).toString("utf8"))?.[1];
  if (!tree) throw new Error("Malformed git commit");
  return tree;
}

function serializeCommit(tree: string, parent: string, author: string, message: string): Uint8Array {
  const who = `${author.replace(/[<>\n]/g, "") || "instants"} <${author.replace(/[<>\n@\s]/g, "") || "instants"}@users.noreply.hub> ${Math.floor(Date.now() / 1000)} +0000`;
  const lines = [`tree ${tree}`, ...(parent ? [`parent ${parent}`] : []), `author ${who}`, `committer ${who}`];
  return Buffer.from(`${lines.join("\n")}\n\n${message.trim()}\n`, "utf8");
}

// ---------------------------------------------------------------- connection

type Session = { conn: DbConnection; author: string };
const SESSION = Symbol.for("instants.hub-write");
type Holder = { session?: Promise<Session>; key?: string };

/** Subscribe, read the rows once they arrive, then drop the subscription. */
function snapshot<T>(conn: DbConnection, query: RowTypedQuery<any, any>, read: () => T): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return new Promise((resolve, reject) => {
    const handle = conn
      .subscriptionBuilder()
      .onApplied(() => {
        let value: T;
        try {
          value = read();
        } catch (error) {
          reject(error);
          return;
        }
        handle.unsubscribeThen(() => resolve(value));
      })
      .onError((ctx) => reject(new Error(`Hub query failed: ${String((ctx as { event?: unknown }).event ?? "unknown error")}`)))
      .subscribe(query);
  });
}

function open(): Promise<Session> {
  const s = settings();
  if (!s.token) return Promise.reject(new HubWriteError("This site cannot save to Spacehub: SPACEHUB_TOKEN is not set."));
  const holder = ((globalThis as Record<symbol, Holder | undefined>)[SESSION] ??= {});
  const key = `${s.server}|${s.database}|${s.token}`;
  if (holder.session && holder.key === key) return holder.session;
  holder.key = key;
  const session = new Promise<Session>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new HubWriteError(`Timed out connecting to ${s.server}`));
      attempt.disconnect();
    }, CONNECT_TIMEOUT_MS);
    const attempt = DbConnection.builder()
      .withUri(s.server)
      .withDatabaseName(s.database)
      .withToken(s.token)
      .onConnect(async (conn, identity) => {
        clearTimeout(timer);
        try {
          const author = await snapshot(
            conn,
            tables.user.where((r) => r.identity.eq(identity)),
            () => [...conn.db.user.iter()].find((r) => r.identity.isEqual(identity))?.username,
          ) ?? await snapshot(
            conn,
            tables.agent.where((r) => r.identity.eq(identity)),
            () => [...conn.db.agent.iter()].find((r) => r.identity.isEqual(identity))?.name,
          );
          if (!author) throw new HubWriteError("SPACEHUB_TOKEN has no builder or agent name on the hub.");
          resolve({ conn, author });
        } catch (error) {
          reject(error);
          conn.disconnect();
        }
      })
      .onDisconnect(() => {
        if (holder.session === session) holder.session = undefined;
      })
      .onConnectError((_ctx, error) => {
        clearTimeout(timer);
        reject(new HubWriteError(`Cannot connect to ${s.server}: ${error?.message ?? error}`));
      })
      .build();
  });
  holder.session = session;
  session.catch(() => {
    if (holder.session === session) holder.session = undefined;
  });
  return session;
}

const projectIds = new Map<string, bigint>();

async function projectId(conn: DbConnection, fullName: string): Promise<bigint> {
  const known = projectIds.get(fullName);
  if (known !== undefined) return known;
  const id = await snapshot(conn, tables.project.where((r) => r.fullName.eq(fullName)), () =>
    [...conn.db.project.iter()].find((r) => r.fullName === fullName)?.id,
  );
  if (id === undefined) throw new HubWriteError(`Spacehub has no project ${fullName}`);
  projectIds.set(fullName, id);
  return id;
}

async function head(conn: DbConnection, id: bigint, ref: string): Promise<string> {
  const key = `${id}:${ref}`;
  return (await snapshot(conn, tables.gitRef.where((r) => r.key.eq(key)), () => [...conn.db.gitRef.iter()].find((r) => r.key === key)?.oid)) ?? "";
}

async function object(conn: DbConnection, id: bigint, oid: string): Promise<Uint8Array> {
  const key = `${id}:${oid}`;
  const row = await snapshot(conn, tables.gitObject.where((r) => r.key.eq(key)), () => [...conn.db.gitObject.iter()].find((r) => r.key === key));
  if (!row) throw new Error(`The hub has no object ${oid}`);
  if (row.chunks !== 0) throw new Error(`Object ${oid} is too large to edit here`);
  return row.data;
}

// ---------------------------------------------------------------- write

/**
 * Replace `file` (posix path, e.g. reactions/x.json) with what `update` returns
 * for its current text (null when absent), in one commit. Returns the text written.
 * `update` may run more than once when the branch moves under it.
 */
export async function updateHubFile(file: string, update: (current: string | null) => string, message: string): Promise<string> {
  const parts = file.split("/");
  if (parts.some((p) => !p || p === "." || p === "..")) throw new HubWriteError(`Bad path ${file}`);
  const { project, branch } = settings();
  const ref = `refs/heads/${branch}`;
  const { conn, author } = await open();
  const id = await projectId(conn, project);

  for (let attempt = 1; ; attempt++) {
    const parent = await head(conn, id, ref);
    if (!OID.test(parent)) throw new HubWriteError(`${project} has no ${branch} branch`);

    // Walk down: the trees on the path (missing folders are empty).
    const trees: Entry[][] = [];
    let treeOid: string | null = commitTree(await object(conn, id, parent));
    for (let i = 0; i < parts.length; i++) {
      const entries: Entry[] = treeOid ? parseTree(await object(conn, id, treeOid)) : [];
      trees.push(entries);
      const hit = entries.find((e) => e.name === parts[i]);
      if (i < parts.length - 1) treeOid = hit && isDir(hit.mode) ? hit.oid : null;
      else treeOid = hit && !isDir(hit.mode) ? hit.oid : null;
    }
    const current = treeOid ? Buffer.from(await object(conn, id, treeOid)).toString("utf8") : null;
    const text = update(current);

    // Build up: new blob, then each tree with the child swapped in.
    const fresh: Obj[] = [make("blob", Buffer.from(text, "utf8"))];
    let child = fresh[0].oid;
    for (let i = parts.length - 1; i >= 0; i--) {
      const mode = i === parts.length - 1 ? FILE : TREE;
      const entries = trees[i].filter((e) => e.name !== parts[i]).concat({ mode, name: parts[i], oid: child });
      const tree = make("tree", serializeTree(entries));
      fresh.push(tree);
      child = tree.oid;
    }
    const commit = make("commit", serializeCommit(child, parent, author, message));
    fresh.push(commit);

    await conn.reducers.putObjects({ project, objects: fresh.map(({ oid, kind, data }) => ({ oid, kind, data })) });
    try {
      await conn.reducers.updateRef({ project, name: ref, oldOid: parent, newOid: commit.oid, force: false });
      return text;
    } catch (error) {
      const stale = /stale info/i.test(error instanceof Error ? error.message : String(error));
      if (!stale || attempt >= ATTEMPTS) throw error;
    }
  }
}
