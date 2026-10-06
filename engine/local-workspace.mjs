// Node-only orchestration: one serialized transaction lane for each profile.
import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  createJsonlStore,
  LogStoreError,
  MAX_APPEND_ENTRIES,
} from "./jsonl-store.mjs";
import {
  LogError,
  parseActivityEntry,
  parseTimelineEntry,
} from "./log-schema.mjs";
import { replayTimeline, seedTimeline } from "./timeline.mjs";

const registryKey = Symbol.for("instants.local-workspace.v1");
const registry = (globalThis[registryKey] ??= {
  queues: new Map(),
  handles: new Map(),
});
const keyFor = (directory) => {
  const resolved = path.resolve(/* turbopackIgnore: true */ directory);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};

async function serialize(key, operation) {
  const previous = registry.queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  registry.queues.set(key, current);
  try {
    return await current;
  } finally {
    if (registry.queues.get(key) === current) registry.queues.delete(key);
  }
}

function activeRecords(entries) {
  const records = new Map();
  for (const entry of entries) {
    if (entry.type === "record.upsert") records.set(entry.targetId, entry);
    if (entry.type === "record.remove") records.delete(entry.targetId);
  }
  return records;
}

function sourceReadOnly(snapshot, sourceId) {
  return Boolean(
    sourceId &&
    snapshot.sources.find((source) => source.id === sourceId)?.readOnly,
  );
}

function rejectReadOnly(snapshot, entry) {
  let readOnly = false;
  if (entry.type === "post.comment" || entry.type === "post.respond") {
    const post = snapshot.posts.find((item) => item.id === entry.data.postId);
    readOnly = Boolean(
      post?.source?.readOnly || sourceReadOnly(snapshot, post?.source?.id),
    );
  }
  if (entry.type === "queue.reply") {
    const item = snapshot.attention.find(
      (item) => item.id === entry.data.itemId,
    );
    const post = snapshot.posts.find((post) => post.id === item?.postId);
    readOnly = Boolean(
      item?.readOnly ||
      sourceReadOnly(snapshot, item?.sourceId) ||
      post?.source?.readOnly ||
      sourceReadOnly(snapshot, post?.source?.id),
    );
  }
  if (entry.type === "message.send") {
    const candidates = snapshot.messages.filter((thread) =>
      entry.data.threadId
        ? (thread.id ?? thread.userId) === entry.data.threadId
        : thread.userId === entry.data.userId,
    );
    const mutable = candidates.find(
      (thread) =>
        !thread.readOnly && !sourceReadOnly(snapshot, thread.sourceId),
    );
    readOnly = candidates.length > 0 && !mutable;
    if (!candidates.length) {
      // A new local thread must not imply a reply channel to an imported agent.
      readOnly = snapshot.posts.some(
        (post) =>
          post.userId === entry.data.userId &&
          (post.source?.readOnly || sourceReadOnly(snapshot, post.source?.id)),
      );
    }
    if (candidates.some((thread) => thread.userId !== entry.data.userId))
      throw new LogError(
        "target_mismatch",
        "The message recipient does not match this conversation.",
        409,
      );
  }
  if (readOnly)
    throw new LogError(
      "source_read_only",
      "This source is available for viewing. Save a private note or use the original app to reply.",
      409,
    );
}

function validateBatch(entries, parse) {
  if (!Array.isArray(entries) || entries.length > MAX_APPEND_ENTRIES)
    throw new LogError(
      "invalid_batch",
      "Send at most 500 journal entries at a time.",
    );
  return entries.map((entry) => parse(entry));
}

export function createLocalWorkspace({
  directory,
  lockDirectory,
  profileId,
  seed,
}) {
  const store = createJsonlStore({ directory, lockDirectory });
  const key = keyFor(directory);

  async function reconcile(snapshot) {
    if (snapshot.diagnostics.length) return snapshot;
    const mirrored = new Set(snapshot.timeline.map((entry) => entry.id));
    const missing = snapshot.activity.filter(
      (entry) => entry.type === "post.create" && !mirrored.has(entry.id),
    );
    for (
      let offset = 0;
      offset < missing.length;
      offset += MAX_APPEND_ENTRIES
    ) {
      const entries = missing
        .slice(offset, offset + MAX_APPEND_ENTRIES)
        .map((entry) => {
          const post = entry.data.post;
          return parseTimelineEntry({
            v: 1,
            id: entry.id,
            at: entry.at,
            type: "record.upsert",
            targetId: post.id,
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
          });
        });
      snapshot = await store.append("timeline", entries);
    }
    return snapshot;
  }

  async function load() {
    let snapshot = await store.read();
    if (snapshot.diagnostics.length) return snapshot;
    if (!snapshot.timeline.length && !snapshot.activity.length && seed)
      snapshot = await store.append("timeline", seedTimeline(seed));
    if (!snapshot.activity.some((entry) => entry.type === "profile.created")) {
      snapshot = await store.append("activity", [
        {
          v: 1,
          id: randomUUID(),
          at: snapshot.timeline[0]?.at ?? new Date().toISOString(),
          type: "profile.created",
          targetId: profileId,
          data: { profileId },
        },
      ]);
    }
    return reconcile(snapshot);
  }

  function read() {
    return serialize(key, load);
  }

  function append(kind, entries) {
    return serialize(key, async () => {
      if (kind !== "timeline" && kind !== "activity")
        throw new LogError(
          "invalid_log",
          "Choose the timeline or activity log.",
        );
      const parsed = validateBatch(
        entries,
        kind === "timeline" ? parseTimelineEntry : parseActivityEntry,
      );
      const before = await load();
      if (kind === "activity") {
        const snapshot = replayTimeline(before.timeline);
        const known = new Set(before.activity.map((entry) => entry.id));
        for (const entry of parsed) {
          if (known.has(entry.id)) continue; // The store still checks exact equality.
          if (entry.type === "profile.created")
            throw new LogError(
              "reserved_activity",
              "Profile identity is managed by the local engine.",
              400,
            );
          rejectReadOnly(snapshot, entry);
        }
      }
      const saved = await store.append(kind, parsed);
      return reconcile(saved);
    });
  }

  function importTimeline(entries, { replace = false } = {}) {
    return serialize(key, async () => {
      const parsed = validateBatch(entries, parseTimelineEntry);
      const before = await load();
      if (before.diagnostics.length)
        throw new LogStoreError(
          "log_needs_repair",
          "Export and repair the journals before importing more data.",
          409,
        );
      const existing = new Map(
        before.timeline.map((entry) => [entry.id, JSON.stringify(entry)]),
      );
      for (const entry of parsed) {
        if (
          existing.has(entry.id) &&
          existing.get(entry.id) !== JSON.stringify(entry)
        )
          throw new LogError(
            "event_conflict",
            "An imported event ID already has different contents.",
            409,
          );
      }
      const incoming = activeRecords(parsed);
      const current = activeRecords(before.timeline);
      const changes = [];
      if (replace) {
        for (const [targetId, entry] of current) {
          if (entry.data.kind !== "viewer" && !incoming.has(targetId)) {
            changes.push({
              v: 1,
              id: randomUUID(),
              at: new Date().toISOString(),
              type: "record.remove",
              targetId,
              data: {},
            });
          }
        }
      }
      changes.push(...parsed);
      // Imports can contain events delivered before a later replacement removed
      // their records. Reassert the requested final state with a fresh event ID.
      const delivered = new Set(existing.keys());
      const effective = changes.filter((entry) => {
        if (delivered.has(entry.id)) return false;
        delivered.add(entry.id);
        return true;
      });
      const after = activeRecords([...before.timeline, ...effective]);
      const desired = new Map(
        parsed
          .filter(
            (entry) =>
              entry.type === "record.upsert" || entry.type === "record.remove",
          )
          .map((entry) => [entry.targetId, entry]),
      );
      for (const [targetId, entry] of desired) {
        const actual = after.get(targetId);
        if (
          (entry.type === "record.remove" && actual) ||
          (entry.type === "record.upsert" &&
            JSON.stringify(actual?.data) !== JSON.stringify(entry.data))
        ) {
          changes.push({
            ...entry,
            id: randomUUID(),
            at: new Date().toISOString(),
          });
        }
      }
      if (changes.length > MAX_APPEND_ENTRIES)
        throw new LogError(
          "invalid_batch",
          "This import and its replacement records exceed the 500-entry limit. Import a smaller feed.",
          413,
        );
      return store.append("timeline", changes);
    });
  }

  function exportLog(kind) {
    // Raw exports never bootstrap or reconcile, especially during recovery.
    return serialize(key, () => store.exportLog(kind));
  }

  function close() {
    return serialize(key, () => store.close());
  }
  return { read, append, importTimeline, exportLog, close };
}

export function getLocalWorkspace(options) {
  const key = `${keyFor(options.directory)}:${options.profileId}`;
  if (!registry.handles.has(key))
    registry.handles.set(key, createLocalWorkspace(options));
  return registry.handles.get(key);
}
