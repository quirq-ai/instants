"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  parseActivityEntry,
  parseTimelineEntry,
  parseLogEntries,
} from "@/engine/log-schema.mjs";
import { seedTimeline } from "@/engine/timeline.mjs";
import {
  activityEntry,
  assertActivityAllowed,
  jsonl,
  mergeEntries,
  mirrorCreatedPosts,
  prepareImport,
  projectWorkspace,
  type WorkspaceLogs,
} from "@/engine/workspace";
import type { ActivityInput } from "@/engine/types";
import type {
  ActivityEntry,
  LogDiagnostic,
  TimelineEntry,
} from "@/engine/log-types";
import type { SeedData } from "@/lib/data";

const KEYS = {
  timeline: "instants-timeline-v1",
  activity: "instants-activity-v1",
};
type Mode = "loading" | "file" | "browser" | "unavailable";
type Status = "loading" | "saved" | "saving" | "error";
const empty: WorkspaceLogs = {
  profileId: "",
  timeline: [],
  activity: [],
  diagnostics: [],
  revision: "",
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : "Your logs could not be saved. Retry or export a backup.";
function parseSnapshot(value: unknown): WorkspaceLogs {
  if (
    !isRecord(value) ||
    value.mode !== "file" ||
    typeof value.profileId !== "string" ||
    !Array.isArray(value.timeline) ||
    !Array.isArray(value.activity) ||
    !Array.isArray(value.diagnostics) ||
    typeof value.revision !== "string"
  )
    throw new Error("The local engine returned an invalid snapshot.");
  return {
    profileId: value.profileId,
    timeline: value.timeline.map(parseTimelineEntry),
    activity: value.activity.map(parseActivityEntry),
    diagnostics: value.diagnostics as LogDiagnostic[],
    revision: value.revision,
  };
}
async function responseValue(response: Response) {
  const value: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      isRecord(value) && typeof value.message === "string"
        ? value.message
        : "The local engine is unavailable. Retry or export your activity before closing this tab.",
    );
  return value;
}
function profileEntry(profileId: string): ActivityEntry {
  return parseActivityEntry({
    v: 1,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    type: "profile.created",
    targetId: profileId,
    data: { profileId },
  });
}
function browserSnapshot(): WorkspaceLogs {
  const timeline = parseLogEntries(
    localStorage.getItem(KEYS.timeline) || "",
    "timeline",
  );
  const activity = parseLogEntries(
    localStorage.getItem(KEYS.activity) || "",
    "activity",
  );
  const profile = activity.entries.find(
    (entry) => entry.type === "profile.created",
  );
  return {
    profileId:
      profile?.type === "profile.created" ? profile.data.profileId : "",
    timeline: timeline.entries,
    activity: activity.entries,
    diagnostics: [...timeline.diagnostics, ...activity.diagnostics],
    revision: "",
  };
}
function latestBrowser(base: WorkspaceLogs) {
  const latest = browserSnapshot();
  if (!latest.profileId || latest.profileId !== base.profileId)
    throw new Error(
      "Your profile changed in another tab. Export a backup, then reload.",
    );
  if (latest.diagnostics.length) throw new Error(latest.diagnostics[0].message);
  return {
    ...latest,
    timeline: mergeEntries(latest.timeline, base.timeline),
    activity: mergeEntries(latest.activity, base.activity),
  };
}
function writeBrowser(
  key: keyof typeof KEYS,
  entries: TimelineEntry[] | ActivityEntry[],
) {
  localStorage.setItem(KEYS[key], jsonl(entries));
}
function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/x-ndjson" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One client boundary: screens see replayed records and never read fixtures or files. */
export function useSession() {
  const [logs, setLogs] = useState<WorkspaceLogs>(empty);
  const [mode, setMode] = useState<Mode>("loading");
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const current = useRef<WorkspaceLogs>(empty);
  const currentMode = useRef<Mode>("loading");
  // Pending network writes exist only in memory. Durable activity lives in the two logs.
  const pending = useRef<ActivityEntry[][]>([]);
  const alive = useRef(false);
  const epoch = useRef(0);
  const writing = useRef<AbortController | null>(null);
  const reading = useRef<AbortController | null>(null);
  const importing = useRef(false);
  const importRequest = useRef<AbortController | null>(null);
  const fail = useCallback((cause: unknown) => {
    if (alive.current) {
      setError(message(cause));
      setStatus("error");
    }
  }, []);
  const publish = useCallback((next: WorkspaceLogs) => {
    current.current = next;
    if (alive.current) setLogs(next);
  }, []);
  const accept = useCallback(
    (next: WorkspaceLogs) => {
      publish(next);
      if (next.diagnostics.length)
        fail(
          new Error(
            next.diagnostics[0].message +
              " Export the original logs before repairing them.",
          ),
        );
      else if (alive.current) {
        setStatus(pending.current.length ? "saving" : "saved");
        setError("");
      }
    },
    [fail, publish],
  );
  const flush = useCallback(async () => {
    if (
      writing.current ||
      importing.current ||
      currentMode.current !== "file" ||
      !pending.current.length
    )
      return;
    const controller = new AbortController();
    writing.current = controller;
    const generation = epoch.current;
    const active = () =>
      alive.current &&
      epoch.current === generation &&
      !controller.signal.aborted;
    setStatus("saving");
    setError("");
    try {
      while (pending.current.length && active()) {
        const entries = pending.current[0];
        const value = await responseValue(
          await fetch("/api/session", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Instants-Profile": current.current.profileId,
            },
            body: JSON.stringify({ log: "activity", entries }),
            signal: controller.signal,
          }),
        );
        if (!active()) return;
        const next = parseSnapshot(value);
        if (next.profileId !== current.current.profileId)
          throw new Error(
            "Your profile changed while saving. Export your activity and reload.",
          );
        const acknowledged = new Set(next.activity.map((entry) => entry.id));
        if (!entries.every((entry) => acknowledged.has(entry.id)))
          throw new Error(
            "The engine did not acknowledge the entire action. Retry before closing this tab.",
          );
        pending.current.shift();
        next.activity = mergeEntries(next.activity, pending.current.flat());
        publish(next);
      }
      if (active()) accept(current.current);
    } catch (cause) {
      if (active()) fail(cause);
    } finally {
      if (writing.current === controller) writing.current = null;
    }
  }, [accept, fail, publish]);

  const load = useCallback(
    async (initial = false) => {
      if (
        writing.current ||
        importing.current ||
        reading.current ||
        pending.current.length
      )
        return;
      const controller = new AbortController();
      reading.current = controller;
      const generation = epoch.current;
      const active = () =>
        alive.current &&
        epoch.current === generation &&
        !controller.signal.aborted;
      try {
        if (currentMode.current === "browser") {
          const next = latestBrowser(current.current);
          const timeline = mirrorCreatedPosts(next.timeline, next.activity);
          if (jsonl(timeline) !== localStorage.getItem(KEYS.timeline))
            writeBrowser("timeline", timeline);
          if (jsonl(next.activity) !== localStorage.getItem(KEYS.activity))
            writeBrowser("activity", next.activity);
          accept({ ...next, timeline });
          return;
        }
        const query =
          !initial && current.current.revision
            ? "?since=" + encodeURIComponent(current.current.revision)
            : "";
        const value = await responseValue(
          await fetch("/api/session" + query, {
            cache: "no-store",
            signal: controller.signal,
          }),
        );
        if (!active() || pending.current.length || importing.current) return;
        if (isRecord(value) && value.unchanged === true) {
          accept(current.current);
          return;
        }
        if (isRecord(value) && value.mode === "browser") {
          if (
            localStorage.getItem(KEYS.timeline) === null &&
            localStorage.getItem(KEYS.activity) === null
          ) {
            const seed = (await import("@/data/mock.json")).default as SeedData;
            if (!active()) return;
            const profile = profileEntry(crypto.randomUUID());
            writeBrowser("timeline", seedTimeline(seed, profile.at));
            writeBrowser("activity", [profile]);
          }
          let next = browserSnapshot();
          if (!next.profileId && !next.diagnostics.length) {
            next = { ...next, profileId: crypto.randomUUID() };
            next.activity = [profileEntry(next.profileId), ...next.activity];
            writeBrowser("activity", next.activity);
          }
          currentMode.current = "browser";
          setMode("browser");
          accept(next);
        } else {
          const next = parseSnapshot(value);
          if (
            current.current.profileId &&
            next.profileId !== current.current.profileId
          )
            throw new Error("Your local profile changed. Reload to open it.");
          currentMode.current = "file";
          setMode("file");
          accept(next);
        }
      } catch (cause) {
        if (active()) {
          if (!current.current.profileId) {
            currentMode.current = "unavailable";
            setMode("unavailable");
          }
          fail(cause);
        }
      } finally {
        if (reading.current === controller) reading.current = null;
      }
    },
    [accept, fail],
  );

  useEffect(() => {
    alive.current = true;
    const generation = epoch.current;
    void load(true);
    const refresh = () => {
      if (pending.current.length) void flush();
      else void load();
    };
    const storage = (event: StorageEvent) => {
      if (
        currentMode.current === "browser" &&
        (event.key === null || Object.values(KEYS).includes(event.key))
      )
        refresh();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current.length || importing.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        currentMode.current === "file" &&
        !pending.current.length
      )
        void load();
    }, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("storage", storage);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      alive.current = false;
      epoch.current = generation + 1;
      reading.current?.abort();
      writing.current?.abort();
      importRequest.current?.abort();
      reading.current = null;
      writing.current = null;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("storage", storage);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [flush, load]);

  const append = useCallback(
    (entries: ActivityEntry[]): boolean => {
      try {
        if (
          !["file", "browser"].includes(currentMode.current) ||
          !current.current.profileId
        )
          throw new Error("Your logs are still opening. Please retry.");
        if (importing.current)
          throw new Error("Wait for the timeline import to finish.");
        if (current.current.diagnostics.length)
          throw new Error(
            "The logs need repair. Export them before making changes.",
          );
        const validated = entries.map(parseActivityEntry);
        const base =
          currentMode.current === "browser"
            ? latestBrowser(current.current)
            : current.current;
        assertActivityAllowed(base.timeline, validated);
        reading.current?.abort();
        reading.current = null;
        const next = {
          ...base,
          activity: mergeEntries(base.activity, validated),
        };
        if (currentMode.current === "browser") {
          // Write the complete action before publishing, including multi-recipient shares.
          writeBrowser("activity", next.activity);
          publish(next);
          try {
            const timeline = mirrorCreatedPosts(next.timeline, next.activity);
            if (timeline.length !== next.timeline.length)
              writeBrowser("timeline", timeline);
            accept({ ...next, timeline });
          } catch (cause) {
            fail(cause);
          } // Durable intent can recover a missing mirror on refresh.
        } else {
          pending.current.push(validated);
          publish(next);
          setStatus("saving");
          void flush();
        }
        return true;
      } catch (cause) {
        fail(cause);
        return false;
      }
    },
    [accept, fail, flush, publish],
  );
  const recordBatch = useCallback(
    (inputs: ActivityInput[]) => {
      try {
        return append(inputs.map(activityEntry));
      } catch (cause) {
        fail(cause);
        return false;
      }
    },
    [append, fail],
  );
  const record = useCallback(
    (input: ActivityInput) => recordBatch([input]),
    [recordBatch],
  );
  const markRead = useCallback(
    (targetId: string) => {
      const latest = [...current.current.activity]
        .reverse()
        .find(
          (entry) => entry.targetId === targetId && entry.type === "item.read",
        );
      if (latest?.type === "item.read" && latest.data.read !== false)
        return true;
      return append([
        {
          v: 1,
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          type: "item.read",
          targetId,
          data: { read: true },
        },
      ]);
    },
    [append],
  );
  const addNote = useCallback(
    (targetId: string, text: string) =>
      append([
        {
          v: 1,
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          type: "note.added",
          targetId,
          data: { text },
        },
      ]),
    [append],
  );
  const importTimeline = useCallback(
    async (
      text: string,
      format: "timeline" | "codex" | "claude",
      replace: boolean,
    ) => {
      if (importing.current) return false;
      const controller = new AbortController();
      const generation = epoch.current;
      const active = () =>
        alive.current &&
        generation === epoch.current &&
        !controller.signal.aborted;
      try {
        if (
          !["file", "browser"].includes(currentMode.current) ||
          !current.current.profileId
        )
          throw new Error("Open your logs before importing.");
        if (pending.current.length || writing.current)
          throw new Error(
            "Save or retry pending activity before importing a timeline.",
          );
        if (current.current.diagnostics.length)
          throw new Error(
            "Export and repair the current logs before importing.",
          );
        importing.current = true;
        importRequest.current = controller;
        reading.current?.abort();
        reading.current = null;
        setStatus("saving");
        setError("");
        const importer = await import("@/engine/importers.mjs");
        const entries = await importer.importTimeline(text, format);
        if (!active()) return false;
        if (currentMode.current === "browser") {
          const base = latestBrowser(current.current);
          const timeline = prepareImport(base.timeline, entries, replace);
          writeBrowser("timeline", timeline);
          accept({ ...base, timeline });
        } else {
          const value = await responseValue(
            await fetch("/api/session", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Instants-Profile": current.current.profileId,
              },
              body: JSON.stringify({ action: "import", entries, replace }),
              signal: controller.signal,
            }),
          );
          if (!active()) return false;
          const next = parseSnapshot(value);
          if (next.profileId !== current.current.profileId)
            throw new Error(
              "Your profile changed during import. Reload to open it.",
            );
          accept(next);
        }
        return true;
      } catch (cause) {
        if (active()) fail(cause);
        return false;
      } finally {
        importing.current = false;
        if (importRequest.current === controller) importRequest.current = null;
      }
    },
    [accept, fail],
  );
  const exportLog = useCallback(
    async (kind: "timeline" | "activity") => {
      try {
        let text: string;
        if (currentMode.current === "file" && !pending.current.length) {
          const response = await fetch("/api/session?export=" + kind, {
            cache: "no-store",
          });
          if (!response.ok)
            throw new Error(
              "The original log could not be exported. Retry when the local engine is available.",
            );
          text = await response.text();
        } else if (
          currentMode.current === "browser" ||
          currentMode.current === "unavailable"
        ) {
          text =
            localStorage.getItem(KEYS[kind]) ?? jsonl(current.current[kind]);
        } else text = jsonl(current.current[kind]);
        download(text, kind + ".jsonl");
      } catch (cause) {
        fail(cause);
      }
    },
    [fail],
  );
  const refresh = useCallback(() => {
    if (pending.current.length) void flush();
    else void load(true);
  }, [flush, load]);
  const projection = useMemo(() => projectWorkspace(logs), [logs]);
  return {
    ...projection,
    logs,
    profileId: logs.profileId,
    record,
    recordBatch,
    markRead,
    addNote,
    importTimeline,
    exportTimeline: () => void exportLog("timeline"),
    exportActivity: () => void exportLog("activity"),
    refresh,
    retry: refresh,
    mode,
    status,
    error,
    ready: mode !== "loading",
    label:
      status === "saving"
        ? "Saving activity…"
        : status === "error"
          ? "Activity needs attention"
          : mode === "file"
            ? "Saved locally"
            : mode === "browser"
              ? "Saved on this device"
              : "Opening your timeline…",
  };
}
