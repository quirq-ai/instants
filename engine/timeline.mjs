import { LogError, parseTimelineEntry } from "./log-schema.mjs";

const emptyViewer = () => ({
  id: "you",
  username: "you",
  name: "You",
  avatar: "",
  companyId: "",
  role: "",
  bio: "Your private agent workspace.",
  followers: "0",
  following: 0,
  companyIds: [],
});

/** Physical log order wins; timestamps never decide which revision is current. */
export function replayTimeline(entries) {
  const records = new Map();
  const seen = new Map();
  const sourceStates = Object.create(null);
  const identityBindings = Object.create(null);
  for (const raw of entries) {
    const entry = parseTimelineEntry(raw);
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
    switch (entry.type) {
      case "record.upsert":
        records.set(entry.targetId, entry.data);
        break;
      case "record.remove":
        records.delete(entry.targetId);
        break;
      case "source.state":
        sourceStates[entry.targetId] = { ...entry.data };
        break;
      case "identity.bound":
        identityBindings[entry.targetId] = { ...entry.data };
        break;
    }
  }
  const state = {
    currentUser: emptyViewer(),
    companies: [],
    users: [],
    posts: [],
    messages: [],
    attention: [],
    explore: [],
    sources: [],
    sourceStates,
    identityBindings,
  };
  const collections = {
    workspace: "companies",
    person: "users",
    post: "posts",
    thread: "messages",
    attention: "attention",
    explore: "explore",
    source: "sources",
  };
  for (const { kind, value } of records.values()) {
    // Validation returns fresh nested objects, so screen changes cannot mutate
    // a caller's journal entries or a later replay of the same log.
    if (kind === "viewer") state.currentUser = value;
    else state[collections[kind]].push(value);
  }
  state.sources = state.sources.map((source) => ({
    ...source,
    ...(sourceStates[source.id]
      ? { status: sourceStates[source.id].status }
      : {}),
  }));
  // A source-level capability restriction applies to every child surface.
  // Explicit record restrictions are also retained, so a permissive registry
  // entry cannot make an imported read-only card writable.
  const readOnlySources = new Set(
    state.sources
      .filter((source) => source.readOnly)
      .map((source) => source.id),
  );
  state.posts = state.posts.map((post) =>
    post.source && readOnlySources.has(post.source.id)
      ? { ...post, source: { ...post.source, readOnly: true } }
      : post,
  );
  const readOnlyPosts = new Set(
    state.posts.filter((post) => post.source?.readOnly).map((post) => post.id),
  );
  state.messages = state.messages.map((thread) =>
    readOnlySources.has(thread.sourceId)
      ? { ...thread, readOnly: true }
      : thread,
  );
  state.attention = state.attention.map((item) =>
    readOnlySources.has(item.sourceId) || readOnlyPosts.has(item.postId)
      ? { ...item, readOnly: true }
      : item,
  );
  return state;
}

/** Explicit demo/import bootstrap. This module never imports fixture data. */
export function seedTimeline(
  seed,
  at = new Date().toISOString(),
  uuidFactory = () => globalThis.crypto.randomUUID(),
) {
  const entries = [];
  const identities = new Set();
  function add(kind, value, targetId = value.id) {
    if (identities.has(targetId))
      throw new LogError(
        "identity_conflict",
        "Timeline records need distinct identities across record kinds.",
        409,
      );
    identities.add(targetId);
    entries.push(
      parseTimelineEntry({
        v: 1,
        id: uuidFactory(),
        at,
        type: "record.upsert",
        targetId,
        data: { kind, value },
      }),
    );
  }
  if (seed.currentUser) add("viewer", seed.currentUser);
  for (const value of seed.sources ?? []) add("source", value);
  for (const value of seed.companies ?? []) add("workspace", value);
  for (const value of seed.users ?? []) add("person", value);
  for (const value of seed.posts ?? []) add("post", value);
  for (const value of seed.messages ?? []) {
    const id = value.id ?? `thread-${value.userId}`;
    add("thread", { ...value, id }, id);
  }
  for (const value of seed.attention ?? []) add("attention", value);
  for (const [index, value] of (seed.explore ?? []).entries())
    add("explore", value, `explore-${index + 1}`);
  return entries;
}
