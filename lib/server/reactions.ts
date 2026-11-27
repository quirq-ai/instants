// Thumbs up and down on posts. Each post's reactions live in the space project
// as reactions/<slug>.json, one vote per visitor (a hashed browser id), so the
// hub site commits them to Spacehub and local mode sees them after a sync.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { hubMode, rawUrl } from "@/lib/research/hub";
import { storeDir } from "@/lib/research/store";
import { hubWritable, updateHubFile } from "@/lib/hub/commit";

export type Vote = "up" | "down";
export type ReactionFile = { slug: string; up: number; down: number; votes: Record<string, Vote> };
export type ReactionSummary = { up: number; down: number; mine: Vote | null; canReact: boolean };

export const VOTER_COOKIE = "instants_voter";
const file = (slug: string) => `reactions/${slug}.json`;

/** Stored key for a browser id: hashed, so the space never holds the cookie itself. */
export const voterKey = (id: string) => createHash("sha256").update(`instants-voter:${id}`).digest("hex").slice(0, 24);

function parse(slug: string, text: string | null): ReactionFile {
  let votes: Record<string, Vote> = {};
  try {
    const raw = text ? (JSON.parse(text) as Partial<ReactionFile>).votes : null;
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) if (v === "up" || v === "down") votes[k] = v;
    }
  } catch {
    votes = {};
  }
  const values = Object.values(votes);
  return { slug, up: values.filter((v) => v === "up").length, down: values.filter((v) => v === "down").length, votes };
}

async function read(slug: string): Promise<ReactionFile> {
  if (hubMode()) {
    const res = await fetch(rawUrl(file(slug)), { cache: "no-store" }).catch(() => null);
    return parse(slug, res?.ok ? await res.text() : null);
  }
  const text = await fs.readFile(path.join(storeDir(), file(slug)), "utf8").catch(() => null);
  return parse(slug, text);
}

export const canReact = () => hubMode() && hubWritable();

export async function getReactions(slug: string, voter: string | null): Promise<ReactionSummary> {
  const data = await read(slug);
  return { up: data.up, down: data.down, mine: voter ? (data.votes[voterKey(voter)] ?? null) : null, canReact: canReact() };
}

/** Set (or clear, with null) this voter's reaction, committed to the space project. */
export async function setReaction(slug: string, voter: string, vote: Vote | null): Promise<ReactionSummary> {
  const key = voterKey(voter);
  const text = await updateHubFile(
    file(slug),
    (current) => {
      const data = parse(slug, current);
      if (vote) data.votes[key] = vote;
      else delete data.votes[key];
      const next = parse(slug, JSON.stringify(data));
      return `${JSON.stringify(next, null, 2)}\n`;
    },
    `${vote ? (vote === "up" ? "Like" : "Dislike") : "Clear reaction on"} ${slug}`,
  );
  const data = parse(slug, text);
  return { up: data.up, down: data.down, mine: data.votes[key] ?? null, canReact: true };
}
