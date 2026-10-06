import { z } from "zod";
import { parseActivityBatch } from "./schema.mjs";

export const MAX_LINE_BYTES = 4 * 1024 * 1024;
const uuid = z.string().uuid();
const timestamp = z.string().datetime();
const identifier = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_:-]+$/);
const shortText = z.string().max(512);
const text = z.string().max(32_768);
const count = z.number().int().min(0).max(1_000_000_000);
const sourceStatus = z.enum(["ready", "stale", "error", "disconnected"]);
const image = z
  .string()
  .max(2 * 1024 * 1024)
  .refine((value) => {
    if (!value) return true;
    if (value.startsWith("/") && !value.startsWith("//"))
      return !/[\u0000-\u001f\\]/.test(value);
    if (
      /^data:image\/(?:png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/]+=*$/.test(
        value,
      )
    )
      return true;
    try {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, "Use a local image path, web URL, or supported raster image.");
const message = z
  .object({ mine: z.boolean(), text: z.string().max(128 * 1024) })
  .strict();
const personFields = {
  id: identifier,
  username: shortText,
  name: shortText,
  avatar: image,
  companyId: z.union([identifier, z.literal("")]),
  role: shortText,
};
const sourceRef = z
  .object({
    id: identifier,
    label: shortText,
    nativeId: z.string().max(2_048).optional(),
    readOnly: z.boolean(),
  })
  .strict();
const schemas = {
  viewer: z
    .object({
      ...personFields,
      id: z.literal("you"),
      bio: text,
      followers: shortText,
      following: count,
      companyIds: z.array(identifier).max(100),
    })
    .strict(),
  person: z
    .object({
      ...personFields,
      verified: z.boolean(),
      following: z.boolean(),
    })
    .strict(),
  workspace: z
    .object({
      id: identifier,
      name: shortText,
      handle: shortText,
      description: text,
      color: z.string().max(80),
      initials: z.string().max(16),
    })
    .strict(),
  post: z
    .object({
      id: identifier,
      userId: identifier,
      companyId: identifier.optional(),
      requesterId: identifier.optional(),
      workType: z.string().max(120).optional(),
      location: shortText,
      time: shortText,
      images: z.array(image).max(10),
      alt: text,
      caption: text,
      body: z
        .string()
        .max(128 * 1024)
        .optional(),
      tags: z.string().max(2_048),
      likes: count,
      commentCount: count,
      comments: z
        .array(z.object({ userId: identifier, text }).strict())
        .max(1_000),
      source: sourceRef.optional(),
      occurredAt: timestamp.optional(),
      expiresAt: timestamp.optional(),
      instant: z
        .object({
          kind: z.string().min(1).max(40),
          title: z.string().min(1).max(240),
          expiresInMinutes: z.number().positive().max(10_080),
          options: z
            .array(
              z
                .object({
                  id: identifier,
                  label: z.string().min(1).max(120),
                  count,
                })
                .strict(),
            )
            .min(2)
            .max(6),
        })
        .strict()
        .optional(),
    })
    .strict(),
  thread: z
    .object({
      id: identifier.optional(),
      userId: identifier,
      title: shortText.optional(),
      preview: text,
      time: shortText,
      unread: z.boolean(),
      messages: z.array(message).max(2_000),
      readOnly: z.boolean().optional(),
      sourceId: identifier.optional(),
    })
    .strict(),
  attention: z
    .object({
      id: identifier,
      userId: identifier,
      companyId: z.union([identifier, z.literal("")]),
      kind: z.enum(["dm", "comment", "mention", "review"]),
      postId: identifier.optional(),
      title: shortText,
      preview: text,
      time: shortText,
      priority: z.enum(["urgent", "normal"]),
      messages: z.array(message).max(2_000),
      readOnly: z.boolean().optional(),
      resolved: z.boolean().optional(),
      sourceId: identifier.optional(),
      expiresAt: timestamp.optional(),
    })
    .strict(),
  explore: z
    .object({ image, alt: text, category: shortText, likes: shortText })
    .strict(),
  source: z
    .object({
      id: identifier,
      label: shortText,
      provider: shortText,
      readOnly: z.boolean(),
      description: text.optional(),
      status: sourceStatus.optional(),
      updatedAt: timestamp.optional(),
    })
    .strict(),
};
const sourceState = z
  .object({
    status: sourceStatus,
    checkpoint: z.string().max(8_192).optional(),
    message: z.string().max(4_000).optional(),
  })
  .strict();
const identityBinding = z
  .object({
    sourceId: identifier,
    nativeId: z.string().min(1).max(2_048),
    recordId: identifier,
  })
  .strict();
const envelope = z
  .object({
    v: z.literal(1),
    id: uuid,
    at: timestamp,
    type: z.string().min(1).max(64),
    targetId: identifier,
    data: z.unknown(),
  })
  .strict();
const privateActivity = {
  "profile.created": z.object({ profileId: uuid }).strict(),
  "item.read": z
    .object({ read: z.boolean().optional(), revision: shortText.optional() })
    .strict(),
  "item.snoozed": z.object({ until: timestamp.nullable() }).strict(),
  "draft.updated": z.object({ text }).strict(),
  "note.added": z
    .object({ text: z.string().trim().min(1).max(4_000) })
    .strict(),
  "command.requested": z
    .object({
      sourceId: identifier,
      action: identifier,
      expectedRevision: shortText.optional(),
      input: z
        .record(
          z.string().max(80),
          z.union([
            z.string().max(4_000),
            z.number().finite(),
            z.boolean(),
            z.null(),
          ]),
        )
        .refine((value) => Object.keys(value).length <= 32)
        .optional(),
    })
    .strict(),
  "command.receipt": z
    .object({
      status: z.enum([
        "queued",
        "sending",
        "accepted",
        "applied",
        "failed",
        "uncertain",
        "conflict",
      ]),
      message: z.string().max(4_000).optional(),
    })
    .strict(),
};

export class LogError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "LogError";
    this.code = code;
    this.status = status;
  }
}

function validate(schema, value, kind) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new LogError(
      `invalid_${kind}`,
      `This ${kind} record does not match the supported contract.`,
    );
  return result.data;
}

function rejectUnsafeKeys(value, depth = 0) {
  if (depth > 30)
    throw new LogError(
      "invalid_record",
      "Record nesting exceeds the supported limit.",
    );
  if (!value || typeof value !== "object") return;
  for (const key of Object.keys(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new LogError(
        "invalid_record",
        "Reserved object keys are not supported.",
      );
    rejectUnsafeKeys(value[key], depth + 1);
  }
}

function parseEnvelope(value, kind) {
  rejectUnsafeKeys(value);
  if (value && typeof value === "object" && "v" in value && value.v !== 1)
    throw new LogError(
      "unsupported_version",
      "This log uses an unsupported schema version.",
    );
  const parsed = validate(envelope, value, kind);
  if (
    new TextEncoder().encode(JSON.stringify(parsed)).byteLength > MAX_LINE_BYTES
  )
    throw new LogError(
      "record_too_large",
      "This log record exceeds the 4 MiB limit.",
      413,
    );
  return parsed;
}

export function parseTimelineEntry(value) {
  const entry = parseEnvelope(value, "timeline");
  let data;
  switch (entry.type) {
    case "record.upsert": {
      const payload = validate(
        z
          .object({
            kind: z.enum(Object.keys(schemas)),
            value: z.unknown(),
          })
          .strict(),
        entry.data,
        "timeline",
      );
      const record = validate(schemas[payload.kind], payload.value, "timeline");
      const recordId =
        record.id ?? (payload.kind === "thread" ? record.userId : undefined);
      if (recordId !== undefined && recordId !== entry.targetId)
        throw new LogError(
          "target_mismatch",
          "The timeline target must match the record identity.",
        );
      data = { kind: payload.kind, value: record };
      break;
    }
    case "record.remove":
      data = validate(z.object({}).strict(), entry.data, "timeline");
      break;
    case "source.state":
      data = validate(sourceState, entry.data, "timeline");
      break;
    case "identity.bound":
      data = validate(identityBinding, entry.data, "timeline");
      break;
    default:
      throw new LogError(
        "invalid_timeline",
        "This timeline event type is not supported.",
      );
  }
  return { ...entry, data };
}

export function parseActivityEntry(value) {
  const entry = parseEnvelope(value, "activity");
  if (Object.hasOwn(privateActivity, entry.type)) {
    const data = validate(privateActivity[entry.type], entry.data, "activity");
    if (entry.type === "profile.created" && entry.targetId !== data.profileId)
      throw new LogError(
        "target_mismatch",
        "The profile target must match its identity.",
      );
    return { ...entry, data };
  }
  // Legacy actions retain their validated shape, with an explicit conversation
  // identity for sources that expose several threads for the same actor.
  const isMessage =
    entry.type === "message.send" || entry.type === "message.read";
  const threadId =
    isMessage && entry.data && typeof entry.data === "object"
      ? entry.data.threadId
      : undefined;
  let rawData = entry.data;
  if (threadId !== undefined) {
    validate(identifier, threadId, "activity");
    const { threadId: ignored, ...rest } = entry.data;
    void ignored;
    rawData = rest;
  }
  let activity;
  try {
    [activity] = parseActivityBatch({
      events: [{ id: entry.id, at: entry.at, type: entry.type, data: rawData }],
    });
  } catch {
    throw new LogError(
      "invalid_activity",
      "This activity record does not match the supported contract.",
    );
  }
  const targetId =
    threadId ??
    activity.data.postId ??
    activity.data.itemId ??
    activity.data.userId ??
    activity.data.post?.id;
  // A queue reply includes context IDs; only its request ID is its target.
  const expectedTarget =
    entry.type === "queue.reply" ? activity.data.itemId : targetId;
  if (entry.targetId !== expectedTarget)
    throw new LogError(
      "target_mismatch",
      "The activity target must match the affected record.",
    );
  return {
    ...entry,
    data:
      threadId === undefined ? activity.data : { ...activity.data, threadId },
  };
}

/** Return the trustworthy prefix; never skip an invalid line and resume later. */
export function parseLogEntries(text, kind) {
  if (kind !== "timeline" && kind !== "activity")
    throw new LogError("invalid_log", "Choose the timeline or activity log.");
  if (typeof text !== "string")
    throw new LogError("invalid_log", "A log must be UTF-8 JSONL text.");
  const entries = [];
  const diagnostics = [];
  const seen = new Map();
  const parse = kind === "timeline" ? parseTimelineEntry : parseActivityEntry;
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const final = index === lines.length - 1;
    if (final && !lines[index]) break;
    try {
      if (final)
        throw new LogError(
          "incomplete_tail",
          "The last log record is not newline-terminated. Preserve it and repair the tail before appending.",
        );
      const line = lines[index].endsWith("\r")
        ? lines[index].slice(0, -1)
        : lines[index];
      if (new TextEncoder().encode(line).byteLength > MAX_LINE_BYTES)
        throw new LogError(
          "record_too_large",
          "A log line exceeds the 4 MiB limit.",
          413,
        );
      let value;
      try {
        value = JSON.parse(line);
      } catch {
        throw new LogError(
          "invalid_json",
          "This log line is not a complete JSON object.",
        );
      }
      const entry = parse(value);
      const canonical = JSON.stringify(entry);
      if (seen.has(entry.id)) {
        if (seen.get(entry.id) !== canonical)
          throw new LogError(
            "event_conflict",
            "An event ID was reused with different contents.",
            409,
          );
        continue;
      }
      seen.set(entry.id, canonical);
      entries.push(entry);
    } catch (error) {
      diagnostics.push({
        code: error instanceof LogError ? error.code : "invalid_record",
        message:
          error instanceof LogError
            ? error.message
            : "This log record cannot be read.",
        line: index + 1,
        log: kind,
        blocking: true,
      });
      break;
    }
  }
  return { entries, diagnostics };
}
