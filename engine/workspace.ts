import { parseActivityEntry, parseTimelineEntry } from "./log-schema.mjs";
import { replayTimeline } from "./timeline.mjs";
import { projectSession } from "./projection";
import type { Activity, ActivityInput, SessionDocument } from "./types";
import type { ActivityEntry, LogDiagnostic, TimelineEntry } from "./log-types";

export type WorkspaceLogs = {
  profileId: string;
  timeline: TimelineEntry[];
  activity: ActivityEntry[];
  diagnostics: LogDiagnostic[];
  revision: string;
};

export function jsonl(entries: readonly unknown[]) {
  return entries.map((entry) => JSON.stringify(entry) + "\n").join("");
}

/** Exact event retries are harmless; conflicting reuse never silently wins. */
export function mergeEntries<T extends { id: string }>(
  base: T[],
  incoming: T[],
): T[] {
  const known = new Map(base.map((entry) => [entry.id, JSON.stringify(entry)]));
  const next = [...base];
  for (const entry of incoming) {
    const serialized = JSON.stringify(entry);
    if (known.has(entry.id)) {
      if (known.get(entry.id) !== serialized)
        throw new Error(
          "Conflicting event ID. Export your logs before continuing.",
        );
    } else {
      known.set(entry.id, serialized);
      next.push(entry);
    }
  }
  return next;
}

export function activityEntry(input: ActivityInput): ActivityEntry {
  const data = input.data;
  const targetId =
    "itemId" in data
      ? data.itemId
      : "postId" in data && data.postId
        ? data.postId
        : "post" in data
          ? data.post.id
          : "threadId" in data && data.threadId
            ? data.threadId
            : "userId" in data
              ? data.userId
              : "you";
  return parseActivityEntry({
    v: 1,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    targetId,
    ...input,
  });
}

/** Creating a local card has one durable activity intent and a recoverable feed record. */
export function mirrorCreatedPosts(
  timeline: TimelineEntry[],
  activity: ActivityEntry[],
) {
  const known = new Set(timeline.map((entry) => entry.id));
  const mirrors: TimelineEntry[] = [];
  for (const entry of activity) {
    if (entry.type !== "post.create" || known.has(entry.id)) continue;
    const post = entry.data.post;
    mirrors.push(
      parseTimelineEntry({
        v: 1,
        id: entry.id,
        at: entry.at,
        targetId: post.id,
        type: "record.upsert",
        data: {
          kind: "post",
          value: {
            ...post,
            occurredAt: entry.at,
            ...(post.instant
              ? {
                  expiresAt: new Date(
                    Date.parse(entry.at) +
                      post.instant.expiresInMinutes * 60_000,
                  ).toISOString(),
                }
              : {}),
          },
        },
      }),
    );
  }
  return mergeEntries(timeline, mirrors);
}

const legacyTypes = new Set([
  "post.like",
  "post.save",
  "person.follow",
  "post.respond",
  "post.comment",
  "message.send",
  "message.read",
  "queue.reply",
  "queue.resolve",
  "post.create",
]);

/** The SessionDocument is a compatibility projection in memory, never a third file. */
export function projectWorkspace(logs: WorkspaceLogs) {
  const data = replayTimeline(logs.timeline);
  data.posts.sort(
    (a, b) =>
      (Date.parse(b.occurredAt || "") || 0) -
      (Date.parse(a.occurredAt || "") || 0),
  );
  const created = logs.activity.find(
    (entry) => entry.type === "profile.created",
  );
  const timelineTargets = new Set(logs.timeline.map((entry) => entry.targetId));
  const activity = logs.activity.filter(
    (entry) =>
      legacyTypes.has(entry.type) &&
      // A removed local card must not be resurrected by its historical creation intent.
      !(
        entry.type === "post.create" && timelineTargets.has(entry.data.post.id)
      ),
  ) as Activity[];
  const session: SessionDocument = {
    schemaVersion: 1,
    id: logs.profileId,
    userId: "you",
    createdAt:
      created?.at || logs.timeline[0]?.at || "1970-01-01T00:00:00.000Z",
    updatedAt:
      logs.activity.at(-1)?.at || created?.at || "1970-01-01T00:00:00.000Z",
    activity,
  };
  const state = projectSession(data, session);
  const read: Record<string, boolean> = Object.create(null);
  const drafts: Record<string, string> = Object.create(null);
  const snoozed: Record<string, string | null> = Object.create(null);
  for (const entry of logs.activity) {
    if (entry.type === "item.read")
      read[entry.targetId] = entry.data.read ?? true;
    if (entry.type === "draft.updated")
      drafts[entry.targetId] = entry.data.text;
    if (entry.type === "item.snoozed")
      snoozed[entry.targetId] = entry.data.until;
    if (
      entry.type === "note.added" &&
      data.posts.some((post) => post.id === entry.targetId)
    )
      (state.comments[entry.targetId] ??= []).push({
        userId: "you",
        text: entry.data.text,
      });
  }
  return { data, state, read, drafts, snoozed };
}

/** Native history is read-only. Local activity never implies provider delivery. */
export function assertActivityAllowed(
  timeline: TimelineEntry[],
  entries: ActivityEntry[],
) {
  const data = replayTimeline(timeline);
  const sourceReadOnly = (id?: string) =>
    Boolean(id && data.sources.find((source) => source.id === id)?.readOnly);
  for (const entry of entries) {
    let blocked = false;
    if (entry.type === "post.comment" || entry.type === "post.respond") {
      const post = data.posts.find((post) => post.id === entry.targetId);
      blocked = Boolean(
        post?.source?.readOnly || sourceReadOnly(post?.source?.id),
      );
    }
    if (entry.type === "queue.reply") {
      const item = data.attention.find((item) => item.id === entry.targetId);
      const post = data.posts.find((post) => post.id === item?.postId);
      blocked = Boolean(
        item?.readOnly ||
        sourceReadOnly(item?.sourceId) ||
        post?.source?.readOnly ||
        sourceReadOnly(post?.source?.id),
      );
    }
    if (entry.type === "message.send") {
      const threads = data.messages.filter((thread) =>
        entry.data.threadId
          ? (thread.id || thread.userId) === entry.data.threadId
          : thread.userId === entry.data.userId,
      );
      if (threads.some((thread) => thread.userId !== entry.data.userId))
        throw new Error("The recipient does not match this conversation.");
      blocked = threads.length
        ? threads.every(
            (thread) => thread.readOnly || sourceReadOnly(thread.sourceId),
          )
        : data.posts.some(
            (post) =>
              post.userId === entry.data.userId &&
              (post.source?.readOnly || sourceReadOnly(post.source?.id)),
          );
    }
    if (blocked)
      throw new Error("This source is read-only. Save a private note instead.");
  }
}

export function prepareImport(
  timeline: TimelineEntry[],
  incoming: TimelineEntry[],
  replace: boolean,
) {
  // Check conflicts before any reassertion can give an old event a fresh ID.
  mergeEntries(timeline, incoming);
  const desired = new Map<string, TimelineEntry>();
  for (const entry of incoming)
    if (entry.type === "record.upsert" || entry.type === "record.remove")
      desired.set(entry.targetId, entry);
  const latest = new Map<string, TimelineEntry>();
  for (const entry of timeline)
    if (entry.type === "record.upsert" || entry.type === "record.remove")
      latest.set(entry.targetId, entry);
  const removals: TimelineEntry[] = [];
  if (replace)
    for (const [targetId, entry] of latest) {
      if (
        entry.type === "record.upsert" &&
        entry.data.kind !== "viewer" &&
        desired.get(targetId)?.type !== "record.upsert"
      )
        removals.push({
          v: 1,
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          type: "record.remove",
          targetId,
          data: {},
        });
    }
  const next = mergeEntries(timeline, [...removals, ...incoming]);
  const actual = new Map<string, TimelineEntry>();
  for (const entry of next)
    if (entry.type === "record.upsert" || entry.type === "record.remove")
      actual.set(entry.targetId, entry);
  for (const [targetId, entry] of desired) {
    const current = actual.get(targetId);
    if (
      entry.type !== current?.type ||
      JSON.stringify(entry.data) !== JSON.stringify(current.data)
    )
      next.push({
        ...entry,
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
      });
  }
  if (next.length - timeline.length > 500)
    throw new Error(
      "This replacement exceeds 500 new entries. Import a smaller feed.",
    );
  return next;
}
