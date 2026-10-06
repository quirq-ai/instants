import test from "node:test";
import assert from "node:assert/strict";
import { replayTimeline, seedTimeline } from "../engine/timeline.mjs";

const post = (id, readOnly = false) => ({
  id,
  userId: "agent",
  location: "Agent",
  time: "now",
  images: [],
  alt: "Imported work",
  caption: "Ready to inspect",
  tags: "",
  likes: 0,
  commentCount: 0,
  comments: [],
  source: { id: "source-1", label: "Agent source", readOnly },
});
const request = (id, extra) => ({
  id,
  userId: "agent",
  companyId: "",
  kind: "review",
  title: "Review work",
  preview: "Please review",
  time: "now",
  priority: "normal",
  messages: [],
  readOnly: false,
  ...extra,
});

test("source restrictions reach cards, conversations and direct or linked requests", () => {
  const entries = seedTimeline({
    sources: [
      {
        id: "source-1",
        label: "Agent source",
        provider: "codex",
        readOnly: true,
      },
    ],
    posts: [post("post-1")],
    messages: [
      {
        id: "thread-1",
        userId: "agent",
        sourceId: "source-1",
        readOnly: false,
        preview: "History",
        time: "now",
        unread: true,
        messages: [],
      },
    ],
    attention: [
      request("request-1", { sourceId: "source-1" }),
      request("request-2", { postId: "post-1" }),
    ],
  });
  const before = JSON.stringify(entries);
  const state = replayTimeline(entries);
  assert.equal(state.posts[0].source.readOnly, true);
  assert.equal(state.messages[0].readOnly, true);
  assert.deepEqual(
    state.attention.map((item) => item.readOnly),
    [true, true],
  );
  assert.equal(
    JSON.stringify(entries),
    before,
    "projection must not rewrite the input log",
  );
});

test("record restrictions survive permissive sources while local work remains writable", () => {
  const state = replayTimeline(
    seedTimeline({
      sources: [
        {
          id: "source-1",
          label: "Local source",
          provider: "local",
          readOnly: false,
        },
      ],
      posts: [post("read-only-post", true), post("local-post")],
      attention: [
        request("linked-read-only", { postId: "read-only-post" }),
        request("local-request", { postId: "local-post" }),
      ],
    }),
  );
  assert.deepEqual(
    state.posts.map((item) => item.source.readOnly),
    [true, false],
  );
  assert.deepEqual(
    state.attention.map((item) => item.readOnly),
    [true, false],
  );
});
