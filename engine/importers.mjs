import {
  LogError,
  parseLogEntries,
  parseTimelineEntry,
} from "./log-schema.mjs";

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_ENTRIES = 500;
const MAX_MESSAGE_LENGTH = 128 * 1024;
const labels = { codex: "Codex", claude: "Claude" };
const encoder = new TextEncoder();

function failure(code, message, status = 400) {
  throw new LogError(code, message, status);
}

function nativeLines(text) {
  const lines = text.replace(/^\uFEFF/, "").split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.map((line, index) => {
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      failure(
        "invalid_import",
        `Line ${index + 1} is not complete JSON. Export a complete transcript before importing it.`,
      );
    }
    if (!value || typeof value !== "object" || Array.isArray(value))
      failure(
        "invalid_import",
        `Line ${index + 1} must contain a JSON object.`,
      );
    return value;
  });
}

function nativeIdentity(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2_048)
    failure(
      "missing_identity",
      "The transcript needs a supported session identity. Export the original session JSONL, including its metadata.",
    );
  return value;
}

function timestamp(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    failure(
      "invalid_timestamp",
      "A supported transcript message contains an invalid ISO timestamp.",
    );
  return new Date(value).toISOString();
}

function contentText(content, allowed) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (block) =>
        block &&
        typeof block === "object" &&
        allowed.includes(block.type) &&
        typeof block.text === "string",
    )
    .map((block) => block.text)
    .join("\n");
}

function pushMessage(session, role, content, at, nativeId, destination) {
  if (!content.trim()) return;
  if (content.length > MAX_MESSAGE_LENGTH)
    failure(
      "import_too_large",
      "A transcript message exceeds 128 KiB. Import a smaller source export; Instants will not silently truncate its text.",
      413,
    );
  const id =
    typeof nativeId === "string" && nativeId.length <= 2_048
      ? nativeId
      : undefined;
  session[destination].push({ role, text: content, at, nativeId: id });
}

function makeSession(id) {
  return {
    id,
    cwd: "",
    at: undefined,
    responses: [],
    fallback: [],
    hasResponseMessages: false,
  };
}

function codexSessions(lines) {
  const sessions = new Map();
  let current;
  for (const line of lines) {
    const payload = line.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      continue;
    if (line.type === "session_meta") {
      const id = nativeIdentity(payload.id ?? payload.session_id);
      current = sessions.get(id) ?? makeSession(id);
      sessions.set(id, current);
      current.cwd = typeof payload.cwd === "string" ? payload.cwd : current.cwd;
      current.at ??= timestamp(payload.timestamp ?? line.timestamp);
      continue;
    }
    if (
      line.type === "response_item" &&
      payload.type === "message" &&
      ["user", "assistant"].includes(payload.role)
    ) {
      if (
        ["analysis", "reasoning"].includes(payload.channel) ||
        ["analysis", "reasoning"].includes(payload.phase)
      )
        continue;
      if (!current)
        failure(
          "missing_identity",
          "This Codex transcript has messages before its session metadata. Include the session_meta record.",
        );
      current.hasResponseMessages = true;
      pushMessage(
        current,
        payload.role,
        contentText(payload.content, ["input_text", "output_text"]),
        timestamp(line.timestamp),
        payload.id,
        "responses",
      );
    } else if (
      line.type === "event_msg" &&
      ["user_message", "agent_message"].includes(payload.type)
    ) {
      if (!current)
        failure(
          "missing_identity",
          "This Codex transcript is missing its session_meta record.",
        );
      if (
        ["analysis", "reasoning"].includes(payload.channel) ||
        ["analysis", "reasoning"].includes(payload.phase)
      )
        continue;
      pushMessage(
        current,
        payload.type === "user_message" ? "user" : "assistant",
        typeof payload.message === "string" ? payload.message : "",
        timestamp(line.timestamp),
        payload.id,
        "fallback",
      );
    }
  }
  return [...sessions.values()].map((session) => ({
    ...session,
    messages: session.hasResponseMessages
      ? session.responses
      : session.fallback,
  }));
}

function claudeSessions(lines) {
  const sessions = new Map();
  for (const line of lines) {
    if (!["user", "assistant"].includes(line.type)) continue;
    const message = line.message;
    if (!message || typeof message !== "object" || Array.isArray(message))
      continue;
    if (message.role && message.role !== line.type) continue;
    const content = contentText(message.content, ["text"]);
    if (!content.trim()) continue;
    const id = nativeIdentity(line.sessionId);
    const session = sessions.get(id) ?? makeSession(id);
    sessions.set(id, session);
    session.cwd ||= typeof line.cwd === "string" ? line.cwd : "";
    const at = timestamp(line.timestamp);
    session.at ??= at;
    pushMessage(session, line.type, content, at, line.uuid, "responses");
  }
  return [...sessions.values()].map((session) => ({
    ...session,
    messages: session.responses,
  }));
}

async function hash(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function eventId(value) {
  const hex = await hash(value);
  // UUIDv8 permits a content-derived payload; the variant remains RFC 4122.
  const variant = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const excerpt = (value, limit) =>
  value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;

async function nativeTimeline(text, format) {
  const sessions = (format === "codex" ? codexSessions : claudeSessions)(
    nativeLines(text),
  ).filter((session) => session.messages.length);
  if (!sessions.length)
    failure(
      "unsupported_import",
      `No supported ${labels[format]} user or assistant text messages were found. System prompts, reasoning, tools, and configuration files are not imported.`,
    );
  const label = labels[format];
  const sourceId = `${format}-import`;
  const actorId = `${format}-agent`;
  const entries = [];
  const emitted = new Set();
  async function add(kind, value, at) {
    const body = {
      v: 1,
      at,
      type: "record.upsert",
      targetId: value.id,
      data: { kind, value },
    };
    const id = await eventId(JSON.stringify(body));
    if (emitted.has(id)) return;
    const entry = parseTimelineEntry({ ...body, id });
    entries.push(entry);
    emitted.add(id);
    if (entries.length > MAX_IMPORT_ENTRIES)
      failure(
        "import_too_large",
        "This import produces more than 500 timeline records. Select a smaller transcript export.",
        413,
      );
  }
  // Supporting records use a source-derived timestamp so identical re-imports
  // produce identical events instead of appending fresh observation noise.
  const sourceAt = sessions
    .map(
      (session) =>
        session.at ?? session.messages.find((message) => message.at)?.at,
    )
    .find(Boolean);
  if (!sourceAt)
    failure(
      "missing_timestamp",
      "The transcript has no supported session or message timestamp. Include the original source metadata.",
    );
  await add(
    "source",
    {
      id: sourceId,
      label,
      provider: format,
      readOnly: true,
      status: "ready",
      description: `Selected ${label} transcript files. Read-only imported history.`,
    },
    sourceAt,
  );
  await add(
    "person",
    {
      id: actorId,
      username: format,
      name: label,
      avatar: "",
      verified: false,
      following: false,
      companyId: "",
      role: "Agent",
    },
    sourceAt,
  );
  for (const session of sessions) {
    const sessionAt =
      session.at ?? session.messages.find((message) => message.at)?.at;
    if (!sessionAt)
      failure(
        "missing_timestamp",
        "A conversation has no supported session or message timestamp. Include its original source metadata.",
      );
    const workspaceKey = session.cwd || "selected-exports";
    const workspaceId = `${format}-workspace-${(await hash(workspaceKey)).slice(0, 24)}`;
    const sessionKey = (await hash(`${sourceId}\n${session.id}`)).slice(0, 32);
    const threadId = `${format}-thread-${sessionKey}`;
    await add(
      "workspace",
      {
        id: workspaceId,
        name: `${label} workspace`,
        handle: `${format}_imports`,
        description: `Work observed in selected ${label} transcripts.`,
        color: format === "codex" ? "#1d9bf0" : "#d97757",
        initials: format === "codex" ? "CX" : "CL",
      },
      sessionAt,
    );
    const seenMessages = new Map();
    const messages = [];
    const stableMessages = [];
    for (const message of session.messages) {
      const identity =
        message.nativeId ??
        (await hash(
          JSON.stringify({
            role: message.role,
            text: message.text,
            at: message.at ?? null,
            position: stableMessages.length,
          }),
        ));
      // An upstream UUID denotes one message; later copies replace that message
      // rather than multiplying conversation bubbles and feed cards.
      if (message.nativeId && seenMessages.has(identity)) {
        const index = seenMessages.get(identity);
        stableMessages[index] = { ...message, identity };
      } else {
        seenMessages.set(identity, stableMessages.length);
        stableMessages.push({ ...message, identity });
      }
    }
    for (const message of stableMessages) {
      messages.push({ mine: message.role === "user", text: message.text });
      if (message.role !== "assistant") continue;
      const postId = `${format}-post-${(await hash(`${sessionKey}\n${message.identity}`)).slice(0, 32)}`;
      await add(
        "post",
        {
          id: postId,
          userId: actorId,
          companyId: workspaceId,
          workType: "Agent update",
          location: `${label} transcript`,
          time: message.at ? message.at.slice(0, 10) : "Time unknown",
          images: [],
          alt: "",
          caption: excerpt(message.text, 4_000),
          body: message.text,
          tags: "",
          likes: 0,
          commentCount: 0,
          comments: [],
          source: {
            id: sourceId,
            label,
            nativeId: message.nativeId ?? session.id,
            readOnly: true,
          },
          ...(message.at ? { occurredAt: message.at } : {}),
        },
        message.at ?? sessionAt,
      );
    }
    const last = stableMessages.at(-1);
    const title = excerpt(
      stableMessages
        .find((message) => message.role === "user")
        ?.text.replace(/\s+/g, " ") ?? `${label} conversation`,
      120,
    );
    await add(
      "thread",
      {
        id: threadId,
        userId: actorId,
        title,
        preview: excerpt(last.text, 240),
        time: last.at ? last.at.slice(0, 10) : "Time unknown",
        unread: true,
        messages,
        readOnly: true,
        sourceId,
      },
      last.at ?? sessionAt,
    );
  }
  return entries;
}

/** Read one explicitly selected export. Never scans disks or runs source actions. */
export async function importTimeline(text, format) {
  if (typeof text !== "string" || !text.trim())
    failure("empty_import", "Choose a nonempty JSONL export to import.");
  if (encoder.encode(text).byteLength > MAX_IMPORT_BYTES)
    failure(
      "import_too_large",
      "Imports are limited to 8 MiB. Select a smaller transcript export.",
      413,
    );
  if (!["timeline", "codex", "claude"].includes(format))
    failure(
      "unsupported_import",
      "Choose Instants timeline, Codex, or Claude JSONL.",
    );
  if (format === "timeline") {
    const result = parseLogEntries(text, "timeline");
    if (result.diagnostics.length) {
      const problem = result.diagnostics[0];
      failure(
        problem.code,
        `Timeline line ${problem.line}: ${problem.message}`,
      );
    }
    if (!result.entries.length)
      failure("empty_import", "This timeline contains no records.");
    if (result.entries.length > MAX_IMPORT_ENTRIES)
      failure(
        "import_too_large",
        "An import can contain at most 500 timeline records.",
        413,
      );
    return result.entries;
  }
  return nativeTimeline(text, format);
}
