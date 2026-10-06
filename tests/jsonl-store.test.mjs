import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  createJsonlStore,
  MAX_APPEND_ENTRIES,
  MAX_LOG_BYTES,
  MAX_LOG_LINE_BYTES,
} from "../engine/jsonl-store.mjs";

const execute = promisify(execFile);
const storeUrl = new URL("../engine/jsonl-store.mjs", import.meta.url).href;
const now = "2026-10-07T10:00:00.000Z";
const sourceEntry = (id = "test-source") => ({
  v: 1,
  id: randomUUID(),
  at: now,
  type: "record.upsert",
  targetId: id,
  data: {
    kind: "source",
    value: { id, label: "Test source", provider: "test", readOnly: true },
  },
});
const activityEntry = (targetId = "test:post") => ({
  v: 1,
  id: randomUUID(),
  at: now,
  type: "item.read",
  targetId,
  data: { read: true },
});

async function fixture(t) {
  const parent = path.resolve(".sites-runtime", "jsonl-store-tests");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "instants-jsonl-"));
  const stores = [];
  t.after(async () => {
    await Promise.all(stores.map((store) => store.close()));
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith("instants-jsonl-"));
    await rm(resolved, { recursive: true, force: true });
  });
  function store(options = {}) {
    const value = createJsonlStore({ directory, ...options });
    stores.push(value);
    return value;
  }
  return { directory, store, stores };
}

async function childRead(directory, lockDirectory = directory) {
  const program = `
    import { createJsonlStore } from ${JSON.stringify(storeUrl)};
    const store = createJsonlStore({ directory: process.argv[1], lockDirectory: process.argv[2] });
    try {
      const result = await store.read();
      console.log(JSON.stringify({ ok: true, count: result.timeline.length }));
    } catch (error) {
      console.log(JSON.stringify({ ok: false, code: error.code, status: error.status }));
    } finally { await store.close(); }
  `;
  const { stdout } = await execute(
    process.execPath,
    ["--input-type=module", "--eval", program, directory, lockDirectory],
    { timeout: 15_000, windowsHide: true },
  );
  return JSON.parse(stdout.trim());
}

test("an empty store creates exactly two empty journals", async (t) => {
  const { directory, store } = await fixture(t);
  const snapshot = await store().read();
  assert.deepEqual(snapshot.timeline, []);
  assert.deepEqual(snapshot.activity, []);
  assert.deepEqual(snapshot.diagnostics, []);
  assert.match(snapshot.revision, /^[a-f0-9]{64}$/);
  assert.deepEqual((await readdir(directory)).sort(), [
    "activity.jsonl",
    "timeline.jsonl",
  ]);
  assert.equal(
    await readFile(path.join(directory, "timeline.jsonl"), "utf8"),
    "",
  );
  assert.equal(
    await readFile(path.join(directory, "activity.jsonl"), "utf8"),
    "",
  );
});

test("both logs replay after closing and reopening, with stable revisions and raw exports", async (t) => {
  const { store } = await fixture(t);
  const first = store();
  const empty = await first.read();
  const source = sourceEntry();
  const activity = activityEntry();
  const intermediate = await first.append("timeline", [source]);
  const saved = await first.append("activity", [activity]);
  assert.notEqual(empty.revision, intermediate.revision);
  assert.notEqual(intermediate.revision, saved.revision);
  const timelineText = await first.exportLog("timeline");
  assert.ok(timelineText.endsWith("\n"));
  assert.deepEqual(JSON.parse(timelineText.trim()), source);
  await first.close();
  const reopened = store();
  assert.deepEqual(await reopened.read(), saved);
  assert.deepEqual(
    JSON.parse((await reopened.exportLog("activity")).trim()),
    activity,
  );
});

test("invalid batches and conflicting IDs never append a valid prefix", async (t) => {
  const { directory, store } = await fixture(t);
  const journal = store();
  const original = sourceEntry();
  await journal.append("timeline", [original]);
  const before = await journal.exportLog("timeline");
  await assert.rejects(
    journal.append("timeline", [
      sourceEntry("new"),
      { ...sourceEntry(), v: 9 },
    ]),
    { code: "unsupported_version" },
  );
  await assert.rejects(
    journal.append("timeline", [
      sourceEntry("new"),
      {
        ...original,
        data: {
          ...original.data,
          value: { ...original.data.value, label: "Changed" },
        },
      },
    ]),
    { code: "event_conflict", status: 409 },
  );
  await assert.rejects(
    journal.append("timeline", Array(MAX_APPEND_ENTRIES + 1).fill(original)),
    { code: "invalid_batch" },
  );
  await assert.rejects(journal.append("other", []), { code: "invalid_log" });
  assert.equal(await journal.exportLog("timeline"), before);
  assert.deepEqual((await readdir(directory)).sort(), [
    "activity.jsonl",
    "timeline.jsonl",
  ]);
});

test("identical IDs are idempotent within a batch and across retries", async (t) => {
  const { store } = await fixture(t);
  const journal = store();
  const entry = activityEntry();
  const once = await journal.append("activity", [entry, entry]);
  const twice = await journal.append("activity", [structuredClone(entry)]);
  assert.equal(once.activity.length, 1);
  assert.deepEqual(twice, once);
  assert.equal(
    (await journal.exportLog("activity")).split("\n").filter(Boolean).length,
    1,
  );
});

test("concurrent store instances serialize appends without losing or interleaving records", async (t) => {
  const { store } = await fixture(t);
  const first = store();
  const second = store();
  const entries = Array.from({ length: 40 }, (_, index) =>
    activityEntry(`post-${index}`),
  );
  await Promise.all(
    entries.map((entry, index) =>
      (index % 2 ? first : second).append("activity", [entry]),
    ),
  );
  const snapshot = await first.read();
  assert.equal(snapshot.activity.length, entries.length);
  assert.deepEqual(
    new Set(snapshot.activity.map((entry) => entry.id)),
    new Set(entries.map((entry) => entry.id)),
  );
  assert.deepEqual(snapshot.diagnostics, []);
});

test("a partial tail exposes the valid prefix, preserves raw bytes, and blocks both logs", async (t) => {
  const { directory, store } = await fixture(t);
  const journal = store();
  const source = sourceEntry();
  await journal.append("timeline", [source]);
  const valid = await journal.exportLog("timeline");
  const broken = `${valid}{"v":1,"id":`;
  await writeFile(path.join(directory, "timeline.jsonl"), broken);
  const snapshot = await journal.read();
  assert.deepEqual(snapshot.timeline, [source]);
  assert.deepEqual(
    snapshot.diagnostics.map(({ code, log, line, blocking }) => ({
      code,
      log,
      line,
      blocking,
    })),
    [{ code: "incomplete_tail", log: "timeline", line: 2, blocking: true }],
  );
  await assert.rejects(journal.append("timeline", [sourceEntry("another")]), {
    code: "log_needs_repair",
  });
  await assert.rejects(journal.append("activity", [activityEntry()]), {
    code: "log_needs_repair",
  });
  assert.equal(await journal.exportLog("timeline"), broken);
  assert.equal(await journal.exportLog("activity"), "");
});

test("a complete JSON object without its newline is not treated as committed", async (t) => {
  const { directory, store } = await fixture(t);
  const journal = store();
  await journal.read();
  const raw = JSON.stringify(activityEntry());
  await writeFile(path.join(directory, "activity.jsonl"), raw);
  const snapshot = await journal.read();
  assert.equal(snapshot.activity.length, 0);
  assert.equal(snapshot.diagnostics[0].code, "incomplete_tail");
  assert.equal(await journal.exportLog("activity"), raw);
});

test("middle corruption stops replay instead of silently accepting later entries", async (t) => {
  const { directory, store } = await fixture(t);
  const journal = store();
  await journal.read();
  const first = activityEntry("first");
  const raw = `${JSON.stringify(first)}\ninvalid-json\n${JSON.stringify(activityEntry("last"))}\n`;
  await writeFile(path.join(directory, "activity.jsonl"), raw);
  const snapshot = await journal.read();
  assert.deepEqual(snapshot.activity, [first]);
  assert.equal(snapshot.diagnostics[0].code, "invalid_json");
  assert.equal(snapshot.diagnostics[0].line, 2);
  assert.equal(await journal.exportLog("activity"), raw);
});

test("oversized records and files are rejected without changing their contents", async (t) => {
  const { directory, store } = await fixture(t);
  const journal = store();
  await journal.read();
  const file = path.join(directory, "timeline.jsonl");
  const line = `${"x".repeat(MAX_LOG_LINE_BYTES + 1)}\n`;
  await writeFile(file, line);
  assert.equal((await journal.read()).diagnostics[0].code, "record_too_large");
  await assert.rejects(journal.append("activity", [activityEntry()]), {
    code: "log_needs_repair",
  });
  assert.equal(await journal.exportLog("timeline"), line);
  await writeFile(file, Buffer.alloc(MAX_LOG_BYTES + 1, 120));
  await assert.rejects(journal.read(), { code: "log_full", status: 413 });
  assert.equal((await readFile(file)).length, MAX_LOG_BYTES + 1);
});

test("close drains accepted writes and then rejects future operations", async (t) => {
  const { store } = await fixture(t);
  const journal = store();
  const entry = activityEntry();
  const saving = journal.append("activity", [entry]);
  await journal.close();
  assert.deepEqual((await saving).activity, [entry]);
  await assert.rejects(journal.read(), { code: "store_closed" });
  assert.deepEqual((await store().read()).activity, [entry]);
});

test("one process owns a shared root until every local instance closes", async (t) => {
  const { directory, store } = await fixture(t);
  const oneDirectory = path.join(directory, "profile-one");
  const twoDirectory = path.join(directory, "profile-two");
  const one = store({ directory: oneDirectory, lockDirectory: directory });
  const two = store({ directory: twoDirectory, lockDirectory: directory });
  await one.read();
  await two.read();
  assert.deepEqual(await childRead(oneDirectory), {
    ok: false,
    code: "store_in_use",
    status: 409,
  });
  assert.deepEqual(await childRead(oneDirectory, directory), {
    ok: false,
    code: "store_in_use",
    status: 409,
  });
  await one.close();
  assert.deepEqual(await childRead(oneDirectory, directory), {
    ok: false,
    code: "store_in_use",
    status: 409,
  });
  await two.close();
  assert.deepEqual(await childRead(oneDirectory, directory), {
    ok: true,
    count: 0,
  });
});

test("module reloads share the existing process lock and write queue", async (t) => {
  const { directory, store, stores } = await fixture(t);
  const first = store();
  await first.read();
  const reloaded = await import(`${storeUrl}?reload=${randomUUID()}`);
  const second = reloaded.createJsonlStore({ directory });
  stores.push(second);
  await Promise.all([
    first.append("activity", [activityEntry("before-reload")]),
    second.append("activity", [activityEntry("after-reload")]),
  ]);
  assert.equal((await first.read()).activity.length, 2);
  await first.close();
  assert.deepEqual(await childRead(directory), {
    ok: false,
    code: "store_in_use",
    status: 409,
  });
  await second.close();
  assert.deepEqual(await childRead(directory), { ok: true, count: 0 });
});

test("directory aliases resolve to the same cross-process writer lock", async (t) => {
  const { directory, store } = await fixture(t);
  const actual = path.join(directory, "actual");
  const alias = path.join(directory, "alias");
  await mkdir(actual);
  await symlink(
    actual,
    alias,
    process.platform === "win32" ? "junction" : "dir",
  );
  const first = store({ directory: actual });
  const second = store({ directory: alias });
  await first.read();
  await second.append("activity", [activityEntry()]);
  assert.equal((await first.read()).activity.length, 1);
  assert.deepEqual(await childRead(alias), {
    ok: false,
    code: "store_in_use",
    status: 409,
  });
});

test("recovery export preserves a UTF-8 BOM instead of silently normalizing damaged text", async (t) => {
  const { directory, store } = await fixture(t);
  const journal = store();
  await journal.read();
  const raw = `\uFEFF${JSON.stringify(activityEntry())}\n`;
  await writeFile(path.join(directory, "activity.jsonl"), raw, "utf8");
  assert.equal((await journal.read()).diagnostics[0].code, "invalid_json");
  assert.equal(await journal.exportLog("activity"), raw);
});
