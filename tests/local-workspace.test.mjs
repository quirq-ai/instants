import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createLocalWorkspace } from "../engine/local-workspace.mjs";
import { createJsonlStore } from "../engine/jsonl-store.mjs";
import { replayTimeline } from "../engine/timeline.mjs";

const now = "2026-10-07T12:00:00.000Z";
const post = (id = "local-post") => ({
  id,
  userId: "you",
  location: "",
  time: "Now",
    images: ["/work/preview.svg"],
  alt: "",
  caption: "Work to review",
  tags: "",
  likes: 0,
  commentCount: 0,
  comments: [],
  instant: {
    kind: "review",
    title: "Ready?",
    expiresInMinutes: 60,
    options: [
      { id: "yes", label: "Yes", count: 0 },
      { id: "no", label: "No", count: 0 },
    ],
  },
});
const seed = () => ({
  currentUser: {
    id: "you",
    username: "you",
    name: "You",
    avatar: "",
    companyId: "",
    role: "",
    bio: "",
    followers: "0",
    following: 0,
    companyIds: [],
  },
  companies: [],
  users: [],
  posts: [],
  attention: [],
  messages: [],
  explore: [],
});
const event = (type, targetId, data) => ({
  v: 1,
  id: randomUUID(),
  at: now,
  type,
  targetId,
  data,
});
const upsert = (kind, value) =>
  event("record.upsert", value.id, { kind, value });

async function fixture(t, initialSeed = seed()) {
  const parent = path.resolve(".sites-runtime", "local-workspace-tests");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "instants-workspace-"));
  const profileId = randomUUID();
  const handles = [];
  const options = { directory, profileId, seed: initialSeed };
  const workspace = () => {
    const result = createLocalWorkspace(options);
    handles.push(result);
    return result;
  };
  const raw = createJsonlStore({ directory });
  handles.push(raw);
  t.after(async () => {
    await Promise.all(handles.map((handle) => handle.close()));
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith("instants-workspace-"));
    await rm(resolved, { recursive: true, force: true });
  });
  return { directory, profileId, workspace, raw };
}

test("concurrent bootstrap creates one seed and one private profile marker", async (t) => {
  const { workspace, profileId } = await fixture(t);
  const first = workspace();
  const second = workspace();
  const snapshots = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      (index % 2 ? first : second).read(),
    ),
  );
  const latest = snapshots.at(-1);
  assert.equal(latest.timeline.length, 1);
  assert.equal(latest.activity.length, 1);
  assert.equal(latest.activity[0].type, "profile.created");
  assert.equal(latest.activity[0].targetId, profileId);
  assert.ok(
    snapshots.every((snapshot) => snapshot.revision === latest.revision),
  );
});

test("existing observed data is never replaced with demo fixtures on first read", async (t) => {
  const { workspace, raw } = await fixture(t);
  const source = upsert("source", {
    id: "claude-local",
    label: "Local Claude",
    provider: "claude",
    readOnly: true,
  });
  await raw.append("timeline", [source]);
  const result = await workspace().read();
  assert.deepEqual(result.timeline, [source]);
  assert.equal(result.activity.length, 1);
});

test("corrupt reads return a valid prefix without bootstrapping or repairing either journal", async (t) => {
  const { directory, workspace, raw } = await fixture(t);
  await raw.read();
  const damaged = '{"v":1';
  await writeFile(path.join(directory, "timeline.jsonl"), damaged);
  const result = await workspace().read();
  assert.equal(result.diagnostics[0].code, "incomplete_tail");
  assert.deepEqual(result.activity, []);
  assert.equal(await raw.exportLog("timeline"), damaged);
  assert.equal(await raw.exportLog("activity"), "");
});

test("post creation is durable in activity before mirroring, and a later read repairs a missing mirror once", async (t) => {
  const { workspace, raw } = await fixture(t);
  const app = workspace();
  await app.read();
  const creation = event("post.create", "local-post", { post: post() });
  await raw.append("activity", [creation]); // Simulate a stop after activity flush.
  const recovered = await app.read();
  const mirror = recovered.timeline.find((entry) => entry.id === creation.id);
  assert.ok(mirror);
  assert.equal(mirror.targetId, "local-post");
  assert.equal(mirror.data.value.occurredAt, now);
  assert.equal(mirror.data.value.expiresAt, "2026-10-07T13:00:00.000Z");
  assert.equal((await app.read()).revision, recovered.revision);
  await app.importTimeline([], { replace: true });
  assert.equal(
    replayTimeline((await app.read()).timeline).posts.length,
    0,
    "later reads do not resurrect tombstoned posts from old activity",
  );
});

test("read-only sources reject external-looking actions while keeping private annotations writable", async (t) => {
  const data = seed();
  data.sources = [
    { id: "claude", label: "Claude", provider: "claude", readOnly: true },
  ];
  data.posts = [
    {
      ...post("claude-post"),
      source: { id: "claude", label: "Claude", readOnly: false },
    },
  ];
  data.messages = [
    {
      id: "claude-thread",
      userId: "agent",
      preview: "Ready",
      time: "Now",
      unread: true,
      messages: [],
      sourceId: "claude",
    },
  ];
  data.attention = [
    {
      id: "claude-request",
      userId: "agent",
      companyId: "",
      kind: "review",
      postId: "claude-post",
      title: "Review",
      preview: "Ready",
      time: "Now",
      priority: "normal",
      messages: [],
      sourceId: "claude",
    },
  ];
  const { workspace } = await fixture(t, data);
  const app = workspace();
  const before = await app.read();
  const refused = [
    event("post.comment", "claude-post", {
      postId: "claude-post",
      text: "Reply",
    }),
    event("post.respond", "claude-post", {
      postId: "claude-post",
      optionId: "yes",
    }),
    event("message.send", "claude-thread", {
      userId: "agent",
      threadId: "claude-thread",
      text: "Reply",
    }),
    event("queue.reply", "claude-request", {
      itemId: "claude-request",
      userId: "agent",
      kind: "review",
      postId: "claude-post",
      text: "Reply",
    }),
  ];
  for (const entry of refused)
    await assert.rejects(app.append("activity", [entry]), {
      code: "source_read_only",
      status: 409,
    });
  assert.equal((await app.read()).revision, before.revision);
  const annotations = [
    event("post.save", "claude-post", { postId: "claude-post", saved: true }),
    event("note.added", "claude-post", { text: "Private feedback" }),
    event("queue.resolve", "claude-request", {
      itemId: "claude-request",
      resolved: true,
    }),
  ];
  assert.equal(
    (await app.append("activity", annotations)).activity.length,
    before.activity.length + 3,
  );
});

test("a replacement retry preserves retained records and keeps user activity", async (t) => {
  const initial = seed();
  initial.posts = [post("demo")];
  const { workspace } = await fixture(t, initial);
  const app = workspace();
  await app.read();
  await app.append("activity", [
    event("post.save", "demo", { postId: "demo", saved: true }),
  ]);
  const incoming = [upsert("post", post("imported"))];
  const imported = await app.importTimeline(incoming, { replace: true });
  const repeated = await app.importTimeline(incoming, { replace: true });
  assert.equal(repeated.revision, imported.revision);
  const visible = replayTimeline(repeated.timeline);
  assert.deepEqual(
    visible.posts.map((item) => item.id),
    ["imported"],
  );
  assert.equal(visible.currentUser.id, "you");
  assert.ok(repeated.activity.some((entry) => entry.type === "post.save"));
});

test("reimporting previously removed records restores them without replaying old event IDs", async (t) => {
  const { workspace } = await fixture(t);
  const app = workspace();
  const incoming = [upsert("post", post("imported"))];
  await app.importTimeline(incoming, { replace: true });
  await app.importTimeline([], { replace: true });
  const restored = await app.importTimeline(incoming, { replace: true });
  assert.deepEqual(
    replayTimeline(restored.timeline).posts.map((item) => item.id),
    ["imported"],
  );
  assert.equal(
    restored.timeline.filter((entry) => entry.id === incoming[0].id).length,
    1,
  );
  assert.equal(
    (await app.importTimeline(incoming, { replace: true })).revision,
    restored.revision,
  );
});

test("conflicting imports are rejected before any replacement tombstones are appended", async (t) => {
  const { directory, workspace } = await fixture(t);
  const app = workspace();
  const imported = upsert("post", post("imported"));
  await app.importTimeline([imported]);
  const before = await readFile(path.join(directory, "timeline.jsonl"), "utf8");
  const changed = structuredClone(imported);
  changed.data.value.caption = "Different payload";
  await assert.rejects(app.importTimeline([changed], { replace: true }), {
    code: "event_conflict",
  });
  assert.equal(await app.exportLog("timeline"), before);
});
