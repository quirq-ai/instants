// Node-only persistence. The two journals are the complete application store.
import { createHash } from "node:crypto";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import {
  MAX_LINE_BYTES,
  parseActivityEntry,
  parseLogEntries,
  parseTimelineEntry,
} from "./log-schema.mjs";

export const MAX_LOG_BYTES = 32 * 1024 * 1024;
export const MAX_LOG_LINE_BYTES = MAX_LINE_BYTES;
export const MAX_APPEND_ENTRIES = 500;

export class LogStoreError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = "LogStoreError";
    this.code = code;
    this.status = status;
  }
}

// Symbol.for preserves ownership and queues across Next.js development reloads.
const registryKey = Symbol.for("instants.jsonl-store.v1");
const registry = (globalThis[registryKey] ??= {
  locks: new Map(),
  queues: new Map(),
});

function assertKind(kind) {
  if (kind !== "timeline" && kind !== "activity") {
    throw new LogStoreError(
      "invalid_log",
      "Choose a timeline or activity log.",
      400,
    );
  }
}

function canonicalPayload(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalPayload).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalPayload(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function canonicalDirectory(directory) {
  let candidate = path.resolve(/* turbopackIgnore: true */ directory);
  const missing = [];
  // Resolve existing ancestors as well, so aliases cannot acquire separate locks.
  while (true) {
    try {
      const resolved = await realpath(/* turbopackIgnore: true */ candidate);
      const full = path.join(resolved, ...missing.reverse());
      return process.platform === "win32" ? full.toLowerCase() : full;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) throw error;
      missing.push(path.basename(candidate));
      candidate = parent;
    }
  }
}

async function acquireLock(key) {
  let lease = registry.locks.get(key);
  if (!lease) {
    const hash = createHash("sha256").update(key).digest();
    // Stay below Windows' dynamic/excluded port ranges used by Hyper-V/WSL.
    const port = 20000 + (hash.readUInt32BE(0) % 20000);
    const server = net.createServer((socket) => socket.destroy());
    lease = { server, users: 0, ready: null };
    registry.locks.set(key, lease);
    lease.ready = new Promise((resolve, reject) => {
      const failed = () => {
        if (registry.locks.get(key) === lease) registry.locks.delete(key);
        reject(
          new LogStoreError(
            "store_in_use",
            "Another local engine owns this data folder, or its local lock address is unavailable. Close the other engine before retrying.",
            409,
          ),
        );
      };
      server.once("error", failed);
      server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
        server.removeListener("error", failed);
        // The lock does not keep a stopped application alive and accepts no data.
        server.unref();
        resolve();
      });
    });
  }
  // Count pending acquisitions too, preventing a release between their awaits.
  lease.users += 1;
  try {
    await lease.ready;
  } catch (error) {
    lease.users -= 1;
    throw error;
  }
  return async () => {
    lease.users -= 1;
    if (lease.users !== 0) return;
    if (registry.locks.get(key) === lease) registry.locks.delete(key);
    await new Promise((resolve) => lease.server.close(resolve));
  };
}

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

async function ensureLog(file) {
  try {
    const handle = await open(/* turbopackIgnore: true */ file, "ax", 0o600);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const info = await lstat(/* turbopackIgnore: true */ file);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new LogStoreError(
      "invalid_log_file",
      "A journal must be a regular file.",
    );
  }
}

async function readLog(file) {
  const info = await lstat(/* turbopackIgnore: true */ file);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new LogStoreError(
      "invalid_log_file",
      "A journal must be a regular file.",
    );
  }
  if (info.size > MAX_LOG_BYTES) {
    throw new LogStoreError(
      "log_full",
      "A journal exceeds the 32 MiB storage limit. Export it before continuing.",
      413,
    );
  }
  const handle = await open(/* turbopackIgnore: true */ file, "r");
  try {
    const bytes = await handle.readFile();
    if (bytes.length > MAX_LOG_BYTES) {
      throw new LogStoreError(
        "log_full",
        "A journal exceeds the 32 MiB storage limit.",
        413,
      );
    }
    try {
      // Preserve a BOM as text too: recovery exports must not silently alter it.
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
        bytes,
      );
    } catch {
      throw new LogStoreError(
        "invalid_encoding",
        "A journal is not valid UTF-8. Its bytes have been preserved.",
        409,
      );
    }
  } finally {
    await handle.close();
  }
}

export function createJsonlStore({ directory, lockDirectory = directory }) {
  const root = path.resolve(/* turbopackIgnore: true */ directory);
  const files = {
    timeline: path.join(root, "timeline.jsonl"),
    activity: path.join(root, "activity.jsonl"),
  };
  let initialized;
  let release;
  let closed = false;
  let closing;
  const inFlight = new Set();

  async function initialize() {
    if (!initialized) {
      initialized = (async () => {
        const key = await canonicalDirectory(root);
        const lockKeys = [
          ...new Set([key, await canonicalDirectory(lockDirectory)]),
        ].sort();
        const acquired = [];
        release = async () => {
          for (const unlock of acquired.reverse()) await unlock();
        };
        try {
          // Always protect the concrete folder, even when another caller omits
          // the optional application-wide lock scope.
          for (const lockKey of lockKeys)
            acquired.push(await acquireLock(lockKey));
          await serialize(key, async () => {
            await mkdir(/* turbopackIgnore: true */ root, {
              recursive: true,
              mode: 0o700,
            });
            await ensureLog(files.timeline);
            await ensureLog(files.activity);
          });
          return key;
        } catch (error) {
          await release();
          release = undefined;
          throw error;
        }
      })();
      initialized.catch(() => {
        initialized = undefined;
      });
    }
    return initialized;
  }

  async function snapshot() {
    const [timelineText, activityText] = await Promise.all([
      readLog(files.timeline),
      readLog(files.activity),
    ]);
    const timeline = parseLogEntries(timelineText, "timeline");
    const activity = parseLogEntries(activityText, "activity");
    return {
      result: {
        timeline: timeline.entries,
        activity: activity.entries,
        diagnostics: [...timeline.diagnostics, ...activity.diagnostics],
        revision: createHash("sha256")
          .update(timelineText)
          .update("\0")
          .update(activityText)
          .digest("hex"),
      },
      text: { timeline: timelineText, activity: activityText },
    };
  }

  function run(operation) {
    if (closed)
      return Promise.reject(
        new LogStoreError("store_closed", "This data store has closed.", 409),
      );
    const pending = (async () => serialize(await initialize(), operation))();
    inFlight.add(pending);
    pending.then(
      () => inFlight.delete(pending),
      () => inFlight.delete(pending),
    );
    return pending;
  }

  async function read() {
    return run(async () => (await snapshot()).result);
  }

  async function append(kind, entries) {
    assertKind(kind);
    if (!Array.isArray(entries) || entries.length > MAX_APPEND_ENTRIES) {
      throw new LogStoreError(
        "invalid_batch",
        "Append at most 500 journal entries at a time.",
        400,
      );
    }
    const parse = kind === "timeline" ? parseTimelineEntry : parseActivityEntry;
    // Validate the entire batch before opening or modifying any journal.
    const validated = entries.map((entry) => parse(entry));
    const encoded = validated.map((entry) => `${JSON.stringify(entry)}\n`);
    if (
      encoded.some((line) => Buffer.byteLength(line) - 1 > MAX_LOG_LINE_BYTES)
    ) {
      throw new LogStoreError(
        "line_too_large",
        "A journal record exceeds the 4 MiB line limit.",
        413,
      );
    }
    return run(async () => {
      const before = await snapshot();
      if (before.result.diagnostics.some((diagnostic) => diagnostic.blocking)) {
        throw new LogStoreError(
          "log_needs_repair",
          "A journal contains an incomplete or invalid record. Export and repair it before saving more activity.",
          409,
        );
      }
      const known = new Map(
        before.result[kind].map((entry) => [entry.id, canonicalPayload(entry)]),
      );
      const additions = [];
      for (let index = 0; index < validated.length; index += 1) {
        const entry = validated[index];
        const payload = canonicalPayload(entry);
        if (known.has(entry.id)) {
          if (known.get(entry.id) !== payload) {
            throw new LogStoreError(
              "event_conflict",
              "An existing event ID has different contents.",
              409,
            );
          }
          continue;
        }
        known.set(entry.id, payload);
        additions.push(encoded[index]);
      }
      if (!additions.length) return before.result;
      const content = additions.join("");
      if (
        Buffer.byteLength(before.text[kind]) + Buffer.byteLength(content) >
        MAX_LOG_BYTES
      ) {
        throw new LogStoreError(
          "log_full",
          "A journal would exceed the 32 MiB storage limit. Export it before continuing.",
          413,
        );
      }
      const handle = await open(/* turbopackIgnore: true */ files[kind], "a");
      try {
        await handle.writeFile(content, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return (await snapshot()).result;
    });
  }

  async function exportLog(kind) {
    assertKind(kind);
    return run(() => readLog(files[kind]));
  }

  async function close() {
    if (!closing) {
      closed = true;
      closing = (async () => {
        await Promise.allSettled([...inFlight]);
        if (release) await release();
      })();
    }
    return closing;
  }

  return { read, append, exportLog, close };
}
