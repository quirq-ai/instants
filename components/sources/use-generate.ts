"use client";

import { useCallback, useRef, useState } from "react";
import type { GenerateEvent } from "@/lib/research/types";

export type RowStatus = "queued" | "collecting" | "writing" | "rendering" | "cached" | "skipped" | "done" | "error";

export type JobRow = { name: string; status: RowStatus; detail?: string; slug?: string };

export type JobState = {
  phase: "idle" | "running" | "finished" | "failed";
  total: number;
  rows: Record<string, JobRow>;
  order: string[];
  posts: number;
  failed: number;
  error?: { status: number; message: string };
  startedAt?: number;
  finishedAt?: number;
};

const INITIAL: JobState = { phase: "idle", total: 0, rows: {}, order: [], posts: 0, failed: 0 };

function apply(state: JobState, event: GenerateEvent): JobState {
  const upsert = (name: string, row: Partial<JobRow>) => {
    const prev = state.rows[name];
    return {
      ...state,
      order: prev ? state.order : [...state.order, name],
      rows: { ...state.rows, [name]: { ...(prev ?? { name, status: "queued" as RowStatus }), ...row } },
    };
  };
  switch (event.type) {
    case "start":
      return { ...state, total: event.total };
    case "stage":
      return upsert(event.name, { status: event.stage, detail: event.detail });
    case "done":
      return upsert(event.name, { status: "done", slug: event.slug, detail: undefined });
    case "error":
      return upsert(event.name, { status: "error", detail: event.message });
    case "end":
      return { ...state, posts: event.posts, failed: event.failed };
  }
}

/** Finished rows count toward progress. */
export function finishedCount(state: JobState) {
  return state.order.filter((name) => {
    const s = state.rows[name].status;
    return s === "done" || s === "error" || s === "cached" || s === "skipped";
  }).length;
}

/** Turns raw server errors into something the owner can act on. */
export function explainError(status: number, message: string) {
  if (status === 409) return "A generation job is already running. Wait for it to finish, then try again.";
  if (/auth|login|api[_ ]?key|401|unauthori[sz]ed|credential/i.test(message)) {
    return "Claude could not authenticate. Run `claude /login` in a terminal or set ANTHROPIC_API_KEY, then restart the dev server.";
  }
  return message || "Something went wrong.";
}

/** POSTs to /api/generate and folds the NDJSON stream into state. */
export function useGenerate() {
  const [state, setState] = useState<JobState>(INITIAL);
  const running = useRef(false);

  const run = useCallback(async (body: BodyInit, json: boolean): Promise<JobState> => {
    if (running.current) return INITIAL;
    running.current = true;
    let current: JobState = { ...INITIAL, phase: "running", startedAt: Date.now() };
    setState(current);
    const commit = (next: JobState) => {
      current = next;
      setState(next);
    };
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        body,
        headers: json ? { "content-type": "application/json" } : undefined,
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        commit({
          ...current,
          phase: "failed",
          finishedAt: Date.now(),
          error: { status: response.status, message: explainError(response.status, data.error ?? response.statusText) },
        });
        return current;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        let next = current;
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            next = apply(next, JSON.parse(line) as GenerateEvent);
          } catch {}
        }
        if (next !== current) commit(next);
        if (done) break;
      }
      const jobError = current.rows.job;
      commit({
        ...current,
        phase: jobError ? "failed" : "finished",
        finishedAt: Date.now(),
        error: jobError ? { status: 500, message: explainError(500, jobError.detail ?? "") } : undefined,
      });
    } catch (error) {
      commit({
        ...current,
        phase: "failed",
        finishedAt: Date.now(),
        error: { status: 0, message: error instanceof Error ? error.message : "Network error" },
      });
    } finally {
      running.current = false;
    }
    return current;
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  return {
    state,
    reset,
    runJson: (body: { targets?: string[]; slugs?: string[]; all?: boolean; force?: boolean }) =>
      run(JSON.stringify(body), true),
    runForm: (form: FormData) => run(form, false),
  };
}
