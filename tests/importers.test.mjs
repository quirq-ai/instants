import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { importTimeline, MAX_IMPORT_BYTES } from "../engine/importers.mjs";
import { replayTimeline } from "../engine/timeline.mjs";
import { parseActivityEntry } from "../engine/log-schema.mjs";

const at = "2026-10-07T10:00:00.000Z";
const later = "2026-10-07T10:01:00.000Z";
const jsonl = (records) =>
  records.map((record) => JSON.stringify(record)).join("\n") + "\n";
const codexMeta = (id = "session-123", cwd = "C:\\private\\project") => ({
  type: "session_meta",
  timestamp: at,
  payload: { id, cwd, api_key: "SHOULD_NOT_COPY_SECRET" },
});
const codexMessage = (role, text, extra = {}) => ({
  type: "response_item",
  timestamp: later,
  payload: {
    type: "message",
    role,
    content: [{ type: role === "user" ? "input_text" : "output_text", text }],
    ...extra,
  },
});
const claudeMessage = (type, text, extra = {}) => ({
  type,
  sessionId: "claude-session-123",
  uuid: randomUUID(),
  timestamp: later,
  cwd: "/private/work/project",
  message: { role: type, content: [{ type: "text", text }] },
  ...extra,
});

test("Codex imports preserve visible conversation text and provenance without prompts, reasoning, tools or secrets", async () => {
  const input = jsonl([
    codexMeta(),
    codexMessage("system", "HIDDEN_SYSTEM"),
    codexMessage("developer", "HIDDEN_DEVELOPER"),
    codexMessage("user", "Please implement the small feature."),
    codexMessage("assistant", "HIDDEN_REASONING", { channel: "analysis" }),
    {
      type: "response_item",
      timestamp: later,
      payload: {
        type: "function_call",
        name: "shell",
        arguments: "HIDDEN_TOOL",
      },
    },
    codexMessage("assistant", "Implemented the feature.\nAll checks passed.", {
      id: "message-123",
      content: [
        {
          type: "output_text",
          text: "Implemented the feature.\nAll checks passed.",
        },
        { type: "reasoning", text: "HIDDEN_THOUGHT" },
      ],
    }),
    {
      type: "event_msg",
      timestamp: later,
      payload: { type: "agent_message", message: "DUPLICATE_LEGACY_TEXT" },
    },
  ]);
  const entries = await importTimeline(input, "codex");
  const state = replayTimeline(entries);
  assert.equal(state.posts.length, 1);
  assert.equal(
    state.posts[0].caption,
    "Implemented the feature.\nAll checks passed.",
  );
  assert.deepEqual(state.posts[0].images, []);
  assert.equal(state.posts[0].source.readOnly, true);
  assert.equal(state.posts[0].source.nativeId, "message-123");
  assert.equal(state.posts[0].occurredAt, later);
  assert.equal(state.messages[0].messages.length, 2);
  assert.equal(state.messages[0].readOnly, true);
  assert.equal(state.messages[0].messages[0].mine, true);
  assert.equal(state.attention.length, 0);
  assert.equal(state.currentUser.name, "You");
  assert.equal(
    entries.some((entry) => entry.data.kind === "viewer"),
    false,
  );
  const output = JSON.stringify(entries);
  for (const excluded of [
    "SHOULD_NOT_COPY_SECRET",
    "HIDDEN_",
    "DUPLICATE_LEGACY_TEXT",
    "C:\\\\private",
    "api_key",
  ])
    assert.equal(output.includes(excluded), false, excluded);
});

test("legacy Codex user_message/agent_message records are supported when response messages are absent", async () => {
  const input = jsonl([
    {
      ...codexMeta(),
      payload: { session_id: "older-session", cwd: "/example" },
    },
    {
      type: "event_msg",
      timestamp: at,
      payload: { type: "user_message", message: "Review this." },
    },
    {
      type: "event_msg",
      timestamp: later,
      payload: { type: "agent_message", message: "Review complete." },
    },
  ]);
  const state = replayTimeline(await importTimeline(input, "codex"));
  assert.equal(state.posts[0].caption, "Review complete.");
  assert.deepEqual(state.messages[0].messages, [
    { mine: true, text: "Review this." },
    { mine: false, text: "Review complete." },
  ]);
});

test("Claude imports text blocks and strings while excluding tool, thinking and unrelated metadata", async () => {
  const input = jsonl([
    claudeMessage("user", "Please check the build.", {
      message: { role: "user", content: "Please check the build." },
      apiKey: "HIDDEN_TOKEN",
    }),
    {
      type: "system",
      sessionId: "claude-session-123",
      timestamp: at,
      message: { role: "system", content: "HIDDEN_SYSTEM" },
    },
    claudeMessage("assistant", "", {
      uuid: "claude-assistant-1",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "HIDDEN_THOUGHT" },
          { type: "tool_use", id: "tool1", input: "HIDDEN_TOOL" },
          { type: "text", text: "Build passed." },
        ],
      },
    }),
    claudeMessage("user", "", {
      message: {
        role: "user",
        content: [{ type: "tool_result", content: "HIDDEN_RESULT" }],
      },
    }),
  ]);
  const state = replayTimeline(await importTimeline(input, "claude"));
  assert.equal(state.posts[0].body, "Build passed.");
  assert.equal(state.posts[0].source.label, "Claude");
  assert.equal(state.messages[0].messages.length, 2);
  assert.equal(JSON.stringify(state).includes("HIDDEN_"), false);
  assert.equal(JSON.stringify(state).includes("/private/work/project"), false);
});

test("re-importing the same file is byte-stable and repeated upstream UUIDs create one message", async () => {
  const one = claudeMessage("assistant", "Original answer", {
    uuid: "same-upstream-message",
  });
  const updated = {
    ...one,
    message: { role: "assistant", content: "Updated answer" },
  };
  const input = jsonl([
    claudeMessage("user", "Question?", { uuid: "user-1" }),
    one,
    one,
    updated,
  ]);
  const first = await importTimeline(input, "claude");
  const second = await importTimeline(input, "claude");
  assert.deepEqual(second, first);
  const replay = replayTimeline([...first, ...second]);
  assert.equal(replay.posts.length, 1);
  assert.equal(replay.posts[0].body, "Updated answer");
  assert.equal(replay.messages[0].messages.length, 2);
});

test("growing transcripts retain existing post identities and update their conversation", async () => {
  const prefix = [
    codexMeta(),
    codexMessage("user", "Question"),
    codexMessage("assistant", "First answer", { id: "first-answer" }),
  ];
  const before = await importTimeline(jsonl(prefix), "codex");
  const after = await importTimeline(
    jsonl([
      ...prefix,
      codexMessage("assistant", "Second answer", { id: "second-answer" }),
    ]),
    "codex",
  );
  const state = replayTimeline([...before, ...after]);
  assert.equal(state.posts.length, 2);
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].messages.length, 3);
  assert.equal(replayTimeline(before).posts[0].id, state.posts[0].id);
});

test("multiple conversations keep separate thread identities while actors remain provider-global", async () => {
  const input = jsonl([
    codexMeta("session-one", "/work/first"),
    codexMessage("assistant", "First", { id: "same-native-id" }),
    codexMeta("session-two", "/work/second"),
    codexMessage("assistant", "Second", { id: "same-native-id" }),
  ]);
  const state = replayTimeline(await importTimeline(input, "codex"));
  assert.equal(state.users.length, 1);
  assert.equal(state.companies.length, 2);
  assert.equal(state.messages.length, 2);
  assert.notEqual(state.messages[0].id, state.messages[1].id);
  assert.notEqual(state.posts[0].id, state.posts[1].id);
  assert.equal(state.posts[0].userId, state.posts[1].userId);
});

test("complete incoming text up to128KiB is preserved and unknown source times stay unknown", async () => {
  const content = "Full source text. ".repeat(3_000);
  const message = codexMessage("assistant", content);
  delete message.timestamp;
  const state = replayTimeline(
    await importTimeline(jsonl([codexMeta(), message]), "codex"),
  );
  assert.equal(state.posts[0].body, content);
  assert.equal(state.messages[0].messages[0].text, content);
  assert.equal(state.posts[0].caption.length, 4_000);
  assert.equal(state.posts[0].occurredAt, undefined);
  assert.equal(state.posts[0].time, "Time unknown");
});

test("normalized timeline imports validate completely before returning any entries", async () => {
  const entry = {
    v: 1,
    id: randomUUID(),
    at,
    type: "record.upsert",
    targetId: "test-source",
    data: {
      kind: "source",
      value: {
        id: "test-source",
        label: "Test",
        provider: "test",
        readOnly: true,
      },
    },
  };
  assert.deepEqual(await importTimeline(jsonl([entry, entry]), "timeline"), [
    entry,
  ]);
  await assert.rejects(
    importTimeline(jsonl([entry]) + "broken\n", "timeline"),
    (error) => error.code === "invalid_json",
  );
  await assert.rejects(
    importTimeline(JSON.stringify(entry), "timeline"),
    (error) => error.code === "incomplete_tail",
  );
  await assert.rejects(
    importTimeline(jsonl([{ ...entry, v: 99 }]), "timeline"),
    (error) => error.code === "unsupported_version",
  );
});

test("invalid, unsupported and oversized exports fail clearly without dropping source text", async () => {
  const examples = [
    ["", "codex", "empty_import"],
    ["{}\n", "other", "unsupported_import"],
    ["broken\n", "codex", "invalid_import"],
    ["[]\n", "claude", "invalid_import"],
    ["{}\n", "claude", "unsupported_import"],
    [
      jsonl([codexMessage("assistant", "No session")]),
      "codex",
      "missing_identity",
    ],
    [
      jsonl([
        { ...codexMeta(), timestamp: undefined },
        { ...codexMessage("assistant", "No timestamps"), timestamp: undefined },
      ]),
      "codex",
      "missing_timestamp",
    ],
    [
      jsonl([
        codexMeta(),
        { ...codexMessage("assistant", "Bad time"), timestamp: "tomorrow" },
      ]),
      "codex",
      "invalid_timestamp",
    ],
    [
      jsonl([
        codexMeta(),
        codexMessage("assistant", "x".repeat(128 * 1024 + 1)),
      ]),
      "codex",
      "import_too_large",
    ],
    ["x".repeat(MAX_IMPORT_BYTES + 1), "codex", "import_too_large"],
    [
      jsonl([
        codexMeta(),
        ...Array.from({ length: 498 }, (_, index) =>
          codexMessage("assistant", `Answer ${index}`, {
            id: `message-${index}`,
          }),
        ),
      ]),
      "codex",
      "import_too_large",
    ],
  ];
  for (const [input, format, code] of examples)
    await assert.rejects(
      importTimeline(input, format),
      (error) => error.code === code,
      code,
    );
});

test("private notes retain the 4000-character outgoing limit even though imported messages may be larger", () => {
  const entry = {
    v: 1,
    id: randomUUID(),
    at,
    type: "note.added",
    targetId: "source-post",
    data: { text: "My private review note." },
  };
  assert.deepEqual(parseActivityEntry(entry), entry);
  for (const text of [" ", "x".repeat(4_001)])
    assert.throws(() => parseActivityEntry({ ...entry, data: { text } }));
});
