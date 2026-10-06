import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  LogError,
  parseActivityEntry,
  parseTimelineEntry,
  parseLogEntries,
} from "../engine/log-schema.mjs";
import { replayTimeline, seedTimeline } from "../engine/timeline.mjs";

const at = "2026-10-07T10:00:00.000Z";
const envelope = (type, targetId, data, extra = {}) => ({
  v: 1,
  id: randomUUID(),
  at,
  type,
  targetId,
  data,
  ...extra,
});
const upsert = (kind, value, extra = {}) =>
  envelope("record.upsert", value.id ?? value.userId, { kind, value }, extra);
const source = {
  id: "codex-local",
  label: "Codex",
  provider: "codex",
  readOnly: true,
};
const post = {
  id: "codex-local-run-123",
  userId: "codex-local-agent",
  location: "",
  time: "Oct 7",
  images: [],
  alt: "",
  caption: "Implemented the requested changes.",
  body: "Full conversation transcript\nThe tests pass.",
  tags: "",
  likes: 0,
  commentCount: 0,
  comments: [],
  source: {
    id: source.id,
    label: source.label,
    nativeId: "run/123",
    readOnly: true,
  },
  occurredAt: at,
};
const jsonl = (entries) =>
  entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";

test("timeline upserts retain source context and permit complete text-only work", () => {
  const entry = upsert("post", post);
  assert.deepEqual(parseTimelineEntry(entry), entry);
  const replay = replayTimeline([upsert("source", source), entry]);
  assert.deepEqual(replay.posts, [post]);
  assert.equal(replay.sources[0].readOnly, true);
  replay.posts[0].comments.push({ userId: "you", text: "Private test" });
  assert.equal(entry.data.value.comments.length, 0);
  assert.equal(replayTimeline([entry]).posts[0].comments.length, 0);
});

test("physical order controls update/delete replay and exact duplicate events are idempotent", () => {
  const first = upsert("post", post);
  const earlierTimestamp = upsert(
    "post",
    { ...post, caption: "Revised result" },
    { at: "2026-10-06T00:00:00.000Z" },
  );
  assert.equal(
    replayTimeline([first, first, earlierTimestamp]).posts[0].caption,
    "Revised result",
  );
  const removed = envelope("record.remove", post.id, {});
  assert.equal(replayTimeline([first, removed]).posts.length, 0);
  assert.equal(
    replayTimeline([first, removed, earlierTimestamp]).posts.length,
    1,
  );
  assert.throws(
    () =>
      replayTimeline([
        first,
        {
          ...first,
          data: { kind: "post", value: { ...post, caption: "ID reuse" } },
        },
      ]),
    (error) => error.code === "event_conflict",
  );
});

test("source checkpoints and identity bindings replay without becoming feed cards", () => {
  const state = envelope("source.state", source.id, {
    status: "stale",
    checkpoint: "cursor-1",
    message: "Source offline",
  });
  const bound = envelope("identity.bound", "binding-123", {
    sourceId: source.id,
    nativeId: "native/123",
    recordId: post.id,
  });
  const replay = replayTimeline([upsert("source", source), state, bound]);
  assert.equal(replay.posts.length, 0);
  assert.equal(replay.sources[0].status, "stale");
  assert.equal(replay.sourceStates[source.id].checkpoint, "cursor-1");
  assert.equal(replay.identityBindings["binding-123"].recordId, post.id);
});

test("empty logs replay to a neutral workspace without importing demo people or content", () => {
  const result = replayTimeline([]);
  assert.equal(result.currentUser.id, "you");
  for (const key of [
    "companies",
    "users",
    "posts",
    "messages",
    "attention",
    "explore",
    "sources",
  ])
    assert.deepEqual(result[key], []);
  assert.deepEqual(parseLogEntries("", "timeline"), {
    entries: [],
    diagnostics: [],
  });
});

test("viewer identity remains the canonical private user", () => {
  const viewer = replayTimeline([]).currentUser;
  assert.equal(parseTimelineEntry(upsert("viewer", viewer)).targetId, "you");
  assert.throws(
    () =>
      parseTimelineEntry(upsert("viewer", { ...viewer, id: "someone-else" })),
    LogError,
  );
});

test("each demo entity is seeded explicitly and replay retains the data", async () => {
  const seed = JSON.parse(
    await readFile(new URL("../data/mock.json", import.meta.url), "utf8"),
  );
  const events = seedTimeline(seed, at, randomUUID);
  const result = replayTimeline(events);
  for (const key of [
    "companies",
    "users",
    "posts",
    "attention",
    "explore",
    "currentUser",
  ])
    assert.deepEqual(result[key], seed[key]);
  assert.deepEqual(
    result.messages,
    seed.messages.map((thread) => ({
      ...thread,
      id: `thread-${thread.userId}`,
    })),
  );
  assert.equal(
    new Set(events.map((entry) => entry.targetId)).size,
    events.length,
  );
  assert.equal(
    parseLogEntries(jsonl(events), "timeline").diagnostics.length,
    0,
  );
});

test("strict payloads reject unknown versions, unknown keys, target mismatches, unsafe images and nested prototype keys", () => {
  for (const entry of [
    upsert("post", post, { v: 2 }),
    upsert("post", post, { unexpected: true }),
    upsert("post", post, { targetId: "different" }),
    upsert("post", { ...post, images: ["javascript:alert(1)"] }),
    upsert("post", { ...post, source: { ...post.source, execute: "rm -rf" } }),
    envelope("record.remove", post.id, { arbitrary: true }),
    envelope("unrecognized", post.id, {}),
    JSON.parse(
      JSON.stringify(upsert("source", source)).replace(
        '"provider":"codex"',
        '"provider":"codex","__proto__":{"polluted":true}',
      ),
    ),
  ])
    assert.throws(() => parseTimelineEntry(entry), LogError);
  assert.equal({}.polluted, undefined);
  assert.equal(
    replayTimeline([upsert("post", { ...post, id: "constructor" })]).posts[0]
      .id,
    "constructor",
  );
});

test("JSONL parsing retains the valid prefix and blocks at an incomplete tail or corrupt middle", () => {
  const valid = upsert("post", post);
  const next = upsert("source", source);
  for (const [contents, code] of [
    [jsonl([valid]) + '{"v":1', "incomplete_tail"],
    [jsonl([valid]) + JSON.stringify(next), "incomplete_tail"],
    [jsonl([valid]) + "broken\n" + jsonl([next]), "invalid_json"],
    [jsonl([valid]) + "\n" + jsonl([next]), "invalid_json"],
  ]) {
    const parsed = parseLogEntries(contents, "timeline");
    assert.deepEqual(parsed.entries, [valid]);
    assert.equal(parsed.diagnostics.length, 1);
    assert.deepEqual(parsed.diagnostics[0], {
      ...parsed.diagnostics[0],
      code,
      line: 2,
      log: "timeline",
      blocking: true,
    });
  }
  assert.deepEqual(
    parseLogEntries(jsonl([valid]).replaceAll("\n", "\r\n"), "timeline")
      .entries,
    [valid],
  );
});

test("JSONL retries deduplicate exact event identities and reject conflicting reuse", () => {
  const entry = upsert("post", post);
  assert.deepEqual(parseLogEntries(jsonl([entry, entry]), "timeline").entries, [
    entry,
  ]);
  const changed = { ...entry, at: "2026-10-07T11:00:00.000Z" };
  const parsed = parseLogEntries(jsonl([entry, changed]), "timeline");
  assert.deepEqual(parsed.entries, [entry]);
  assert.equal(parsed.diagnostics[0].code, "event_conflict");
});

test("private activity validates target identities, drafts, read state and command receipts without executing commands", () => {
  const profileId = randomUUID();
  const events = [
    envelope("profile.created", profileId, { profileId }),
    envelope("post.save", post.id, { postId: post.id, saved: true }),
    envelope("queue.reply", "request-1", {
      itemId: "request-1",
      userId: "agent-1",
      postId: post.id,
      kind: "review",
      text: "Ready",
    }),
    envelope("item.read", post.id, { revision: "revision-1" }),
    envelope("item.snoozed", post.id, { until: null }),
    envelope("draft.updated", "draft-1", { text: "" }),
    envelope("command.requested", "command-1", {
      sourceId: source.id,
      action: "reply",
      input: { text: "Yes", flag: true },
    }),
    envelope("command.receipt", "command-1", {
      status: "uncertain",
      message: "No source acknowledgment",
    }),
  ];
  for (const entry of events)
    assert.deepEqual(parseActivityEntry(entry), entry);
  assert.equal(
    parseLogEntries(jsonl(events), "activity").diagnostics.length,
    0,
  );
  for (const entry of [
    { ...events[0], targetId: randomUUID() },
    { ...events[1], targetId: "different-post" },
    envelope("draft.updated", "draft-1", {
      text: "okay",
      hidden: "unexpected",
    }),
    envelope("item.snoozed", post.id, { until: "tomorrow" }),
    envelope("command.requested", "command-1", {
      sourceId: source.id,
      action: "reply",
      input: { nested: { executable: true } },
    }),
  ])
    assert.throws(() => parseActivityEntry(entry), LogError);
});

test("conversation identity keeps message activity separate for one actor with multiple threads", () => {
  for (const type of ["message.read", "message.send"]) {
    const entry = envelope(type, "thread-2", {
      userId: "agent-1",
      threadId: "thread-2",
      ...(type === "message.send" ? { text: "A private reply" } : {}),
    });
    assert.deepEqual(parseActivityEntry(entry), entry);
    assert.throws(
      () => parseActivityEntry({ ...entry, targetId: "agent-1" }),
      (error) => error.code === "target_mismatch",
    );
  }
});

test("source namespaces survive both timeline records and private actions", () => {
  const id = "codex:local:run-123";
  assert.equal(
    parseTimelineEntry(upsert("post", { ...post, id })).targetId,
    id,
  );
  const saved = envelope("post.save", id, { postId: id, saved: true });
  assert.deepEqual(parseActivityEntry(saved), saved);
});
