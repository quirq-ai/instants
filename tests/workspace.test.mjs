import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { seedTimeline, replayTimeline } from "../engine/timeline.mjs";

function transpile(relative) {
  return ts.transpileModule(
    readFileSync(new URL(relative, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
}
const asModule = (text) =>
  `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const source = transpile("../engine/workspace.ts")
  .replaceAll(
    '"./projection"',
    JSON.stringify(asModule(transpile("../engine/projection.ts"))),
  )
  .replaceAll(
    '"./log-schema.mjs"',
    JSON.stringify(new URL("../engine/log-schema.mjs", import.meta.url).href),
  )
  .replaceAll(
    '"./timeline.mjs"',
    JSON.stringify(new URL("../engine/timeline.mjs", import.meta.url).href),
  );
const {
  activityEntry,
  mirrorCreatedPosts,
  prepareImport,
  projectWorkspace,
  assertActivityAllowed,
} = await import(asModule(source));
const seed = JSON.parse(
  readFileSync(new URL("../data/mock.json", import.meta.url), "utf8"),
);
const at = "2026-10-07T10:00:00.000Z";
const event = (type, targetId, data) => ({
  v: 1,
  id: randomUUID(),
  at,
  type,
  targetId,
  data,
});
const snapshot = (timeline, activity = []) => ({
  profileId: randomUUID(),
  timeline,
  activity,
  diagnostics: [],
  revision: "test",
});

test("activity targets distinguish queue, post and conversation IDs", () => {
  assert.equal(
    activityEntry({
      type: "queue.reply",
      data: {
        itemId: "a4",
        postId: "p1",
        userId: "ella",
        kind: "comment",
        text: "Ready",
      },
    }).targetId,
    "a4",
  );
  assert.equal(
    activityEntry({
      type: "message.read",
      data: { userId: "ella", threadId: "thread-a" },
    }).targetId,
    "thread-a",
  );
});

test("private notes and read state replay independently of source content", () => {
  const timeline = seedTimeline(seed, at);
  const postId = seed.posts[0].id;
  const notes = [
    event("note.added", postId, { text: "Follow up tomorrow." }),
    event("item.read", postId, { read: true }),
  ];
  const result = projectWorkspace(snapshot(timeline, notes));
  assert.equal(result.state.comments[postId][0].text, "Follow up tomorrow.");
  assert.equal(result.read[postId], true);
  assert.deepEqual(
    result.data.posts.find((post) => post.id === postId).comments,
    seed.posts[0].comments,
  );
});

test("local creation is mirrored once and a timeline removal stays removed", () => {
  const created = activityEntry({
    type: "post.create",
    data: { post: { ...seed.posts[0], id: "local-card", userId: "you" } },
  });
  const timeline = mirrorCreatedPosts([], [created]);
  assert.equal(timeline.length, 1);
  assert.equal(mirrorCreatedPosts(timeline, [created]).length, 1);
  const removed = [...timeline, event("record.remove", "local-card", {})];
  assert.equal(
    projectWorkspace(snapshot(removed, [created])).state.allPosts.length,
    0,
  );
});

test("replace imports are idempotent and can restore a removed or older snapshot", () => {
  const timeline = seedTimeline(seed, at);
  const post = timeline.find(
    (entry) => entry.type === "record.upsert" && entry.data.kind === "post",
  );
  const replaced = prepareImport(timeline, [post], true);
  assert.equal(replayTimeline(replaced).posts.length, 1);
  assert.equal(prepareImport(replaced, [post], true).length, replaced.length);
  const removed = [...replaced, event("record.remove", post.targetId, {})];
  assert.equal(
    replayTimeline(prepareImport(removed, [post], false)).posts.length,
    1,
  );
  const update = {
    ...post,
    id: randomUUID(),
    data: { kind: "post", value: { ...post.data.value, caption: "Changed" } },
  };
  const changed = [...replaced, update];
  const restored = prepareImport(changed, [post], false);
  assert.equal(
    replayTimeline(restored).posts[0].caption,
    post.data.value.caption,
  );
  assert.throws(
    () =>
      prepareImport(
        timeline,
        [{ ...post, at: "2026-10-08T10:00:00.000Z" }],
        false,
      ),
    /Conflicting/,
  );
});

test("empty timeline stays empty even when old cards remain in activity", () => {
  const created = activityEntry({
    type: "post.create",
    data: { post: { ...seed.posts[0], id: "local-card", userId: "you" } },
  });
  const timeline = mirrorCreatedPosts([], [created]);
  const emptied = prepareImport(timeline, [], true);
  assert.deepEqual(
    projectWorkspace(snapshot(emptied, [created])).state.allPosts,
    [],
  );
});

test("source-level readonly prevents simulated replies but permits private notes", () => {
  const post = {
    ...seed.posts[0],
    source: { id: "agent-source", label: "Agent", readOnly: false },
  };
  const timeline = seedTimeline(
    {
      ...seed,
      posts: [post],
      sources: [
        {
          id: "agent-source",
          label: "Agent",
          provider: "test",
          readOnly: true,
        },
      ],
    },
    at,
  );
  assert.throws(
    () =>
      assertActivityAllowed(timeline, [
        activityEntry({
          type: "post.comment",
          data: { postId: post.id, text: "Send" },
        }),
      ]),
    /read-only/,
  );
  assert.doesNotThrow(() =>
    assertActivityAllowed(timeline, [
      event("note.added", post.id, { text: "Private" }),
    ]),
  );
});
