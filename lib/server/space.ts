// Space supervisor: connects the content store to a Spacehub project, keeps
// `spacehub project sync --auto` running in the clone, and watches the store's
// sources/ for incoming sources (auto-generating posts when enabled). State
// lives on globalThis so hot reloads and every route bundle share one supervisor.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { runGeneration } from "@/research/engine.mjs";
import {
  CACHE_DIR,
  LOCAL_STORE,
  PROJECT_RE,
  ensureStore,
  mergeTree,
  readSpaceConfig,
  scaffoldStore,
  sourcesDir,
  spaceDirFor,
  storeDir,
  writeSpaceConfig,
  type SpaceConfig,
} from "@/lib/research/store";
import { job } from "./job";

export type SpaceState = "off" | "connecting" | "syncing" | "idle" | "conflict" | "error";
export type SpaceStatus = {
  state: SpaceState;
  project: string | null;
  dir: string | null;
  lastPush?: string;
  lastPull?: string;
  lastError?: string;
  log: string[];
  gitStatus?: string;
  restarts: number;
};
export type PendingSource = { slug: string; name: string; addedAt: string; failedAt?: string; error?: string; attempts?: number };

const LOG_MAX = 50;
const RESCAN_MS = 10_000;
const SETTLE_MS = 5_000;
const MAX_AUTO_ATTEMPTS = 4;
const FAILURES_FILE = path.join(CACHE_DIR, "space-pending.json");
const PID_FILE = path.join(CACHE_DIR, "space-sync.pid");

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

/**
 * Kill a sync child a crashed server left behind (it would double-sync the clone).
 * Returns false when another live server process owns the running sync: then we
 * must not start a second one, nor kill theirs (two servers would fight forever).
 */
function reapOrphan(): boolean {
  let pid = 0;
  let owner = 0;
  try {
    const raw = fs.readFileSync(PID_FILE, "utf8").trim();
    if (raw.startsWith("{")) ({ pid = 0, owner = 0 } = JSON.parse(raw) as { pid?: number; owner?: number });
    else pid = Number(raw);
  } catch {
    return true;
  }
  if (owner && owner !== process.pid && alive(owner) && pid > 1 && alive(pid)) return false;
  if (pid > 1 && pid !== process.pid) {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    }
  }
  fs.rmSync(PID_FILE, { force: true });
  return true;
}

let exitHooked = false;
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  const kill = () => {
    const child = g.__instantsSpace?.child;
    if (child?.pid) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
    fs.rmSync(PID_FILE, { force: true });
  };
  process.once("exit", kill);
  // Next installs its own shutdown handlers; only add ours alongside them.
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    if (process.listenerCount(sig) > 0) process.once(sig, kill);
}

type Supervisor = {
  status: SpaceStatus;
  child: ChildProcess | null;
  stopping: boolean;
  restartTimer: NodeJS.Timeout | null;
  backoffMs: number;
  startedAt: number;
  watcher: fs.FSWatcher | null;
  watchedDir: string | null;
  rescan: NodeJS.Timeout | null;
  autoBusy: boolean;
  generating: string | null;
  busy: Promise<unknown>;
};

const g = globalThis as unknown as { __instantsSpace?: Supervisor };

function sup(): Supervisor {
  g.__instantsSpace ??= {
    status: { state: "off", project: null, dir: null, log: [], restarts: 0 },
    child: null,
    stopping: false,
    restartTimer: null,
    backoffMs: 1000,
    startedAt: 0,
    watcher: null,
    watchedDir: null,
    rescan: null,
    autoBusy: false,
    generating: null,
    busy: Promise.resolve(),
  };
  return g.__instantsSpace;
}

/** Serialize connect/disconnect/restart so they never interleave. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const s = sup();
  const next = s.busy.then(fn, fn);
  s.busy = next.catch(() => {});
  return next;
}

/** The environment child CLIs get: no Claude Code session variables leak in. */
function cliEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("CLAUDE") || key === "ANTHROPIC_BASE_URL") delete env[key];
  return env;
}

const spacehubBin = () => process.env.INSTANTS_SPACEHUB_BIN || "spacehub";

function runCli(cmd: string, args: string[], cwd?: string, timeout = 120_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(/*turbopackIgnore: true*/ cmd, args, { cwd, env: cliEnv(), timeout, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code) : 1) : 0;
      resolve({ code, out: `${stdout}${stderr}`.trim() });
    });
  });
}

function pushLog(line: string) {
  const s = sup();
  const text = line.replace(/\x1b\[[0-9;]*m/g, "").trimEnd();
  if (!text.trim()) return;
  s.status.log.push(text);
  if (s.status.log.length > LOG_MAX) s.status.log.splice(0, s.status.log.length - LOG_MAX);
}

/** Map one line of autosync output to status changes. */
function parseLine(line: string) {
  const s = sup().status;
  const text = line.replace(/^\s*\d{1,2}:\d{2}(:\d{2})?\s+/, "").trim();
  const now = new Date().toISOString();
  if (/^pushed\b/i.test(text)) {
    s.lastPush = now;
    s.state = "idle";
    s.lastError = undefined;
  } else if (/^(pulled|rebased onto)\b/i.test(text)) {
    s.lastPull = now;
    s.state = "idle";
    s.lastError = undefined;
  } else if (/^(committed|someone pushed first|rebasing)/i.test(text)) {
    s.state = "syncing";
  } else if (/^autosync\b.*committing every/i.test(text) || /^Autosync /.test(text)) {
    s.state = "idle";
  } else if (/trying again|retrying|push failed/i.test(text)) {
    s.lastError = text;
  } else if (/^autosync stopped/i.test(text)) {
    s.lastError = text;
  }
}

function syncCommand(dir: string): { cmd: string; args: string[] } {
  const override = process.env.INSTANTS_SPACE_SYNC_CMD;
  if (override) return { cmd: "/bin/sh", args: ["-c", override] };
  void dir;
  return { cmd: spacehubBin(), args: ["project", "sync", "--auto", "--interval", "5"] };
}

function startSync() {
  const s = sup();
  const dir = s.status.dir;
  if (!dir || s.child) return;
  if (s.restartTimer) clearTimeout(s.restartTimer);
  s.restartTimer = null;
  s.stopping = false;
  s.status.state = "syncing";
  s.status.gitStatus = undefined;
  s.startedAt = Date.now();
  const { cmd, args } = syncCommand(dir);
  if (!reapOrphan()) {
    s.status.state = "error";
    s.status.lastError = "another Instants server on this machine is already syncing this space; stop it first";
    return;
  }
  hookExit();
  let child: ChildProcess;
  try {
    // Its own process group, so stopping it also stops anything it spawned (git).
    child = spawn(/*turbopackIgnore: true*/ cmd, args, { cwd: dir, env: cliEnv(), stdio: ["ignore", "pipe", "pipe"], detached: true });
    if (child.pid) fs.writeFileSync(PID_FILE, JSON.stringify({ pid: child.pid, owner: process.pid }));
  } catch (error) {
    s.status.state = "error";
    s.status.lastError = `could not start sync: ${error instanceof Error ? error.message : String(error)}`;
    return;
  }
  s.child = child;
  let carry = "";
  const onData = (chunk: Buffer) => {
    const lines = (carry + chunk.toString("utf8")).split(/\r?\n/);
    carry = lines.pop() ?? "";
    for (const line of lines) {
      pushLog(line);
      parseLine(line);
    }
  };
  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
  child.on("error", (error) => {
    pushLog(`sync failed to start: ${error.message}`);
    s.status.lastError = error.message;
  });
  child.on("close", (code, signal) => {
    if (carry) {
      pushLog(carry);
      parseLine(carry);
      carry = "";
    }
    if (s.child === child) {
      s.child = null;
      fs.rmSync(PID_FILE, { force: true });
    }
    if (s.stopping) return;
    if (code === 2) {
      s.status.state = "conflict";
      s.status.lastError ??= "autosync stopped on a conflict";
      void gitStatus(dir).then((text) => (s.status.gitStatus = text));
      return;
    }
    // Unexpected exit: restart with backoff (reset after a healthy minute).
    if (Date.now() - s.startedAt > 60_000) s.backoffMs = 1000;
    s.status.state = "error";
    s.status.lastError = `sync exited (${signal ?? `code ${code}`}); restarting in ${Math.round(s.backoffMs / 1000)}s`;
    s.status.restarts++;
    const wait = s.backoffMs;
    s.backoffMs = Math.min(60_000, s.backoffMs * 2);
    s.restartTimer = setTimeout(() => {
      s.restartTimer = null;
      if (!s.stopping && readSpaceConfig().project === s.status.project) startSync();
    }, wait);
  });
}

function stopSync(): Promise<void> {
  const s = sup();
  s.stopping = true;
  if (s.restartTimer) clearTimeout(s.restartTimer);
  s.restartTimer = null;
  const child = s.child;
  if (!child) return Promise.resolve();
  return new Promise((resolve) => {
    const signal = (sig: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, sig);
        else child.kill(sig);
      } catch {
        child.kill(sig);
      }
    };
    const kill = setTimeout(() => signal("SIGKILL"), 5000);
    child.once("close", () => {
      clearTimeout(kill);
      resolve();
    });
    signal("SIGTERM");
  });
}

async function gitStatus(dir: string) {
  const { out } = await runCli("git", ["status", "--short", "--branch"], dir, 20_000);
  return out.slice(0, 4000);
}

// ---------- public supervisor API ----------

export function validProject(value: unknown): value is string {
  return typeof value === "string" && PROJECT_RE.test(value);
}

export const hubUrl = (project: string) => `https://hub.quirq.dev/${project}`;

/** Verify access, clone (or adopt), copy local content in, start autosync. */
export function connect(project: string) {
  return serial(async () => {
    if (!validProject(project)) throw new Error("Project must look like space/name.");
    const s = sup();
    await stopSync();
    const dir = spaceDirFor(project);
    s.status = { state: "connecting", project, dir, log: [], restarts: 0 };
    s.backoffMs = 1000;
    pushLog(`Checking access to ${project}`);
    const view = await runCli(spacehubBin(), ["project", "view", project], undefined, 60_000);
    if (view.code !== 0) {
      s.status.state = "error";
      s.status.lastError = view.out.split("\n").pop() || `cannot open ${project}`;
      pushLog(s.status.lastError);
      throw new Error(`No access to ${project}: ${s.status.lastError}`);
    }
    if (fs.existsSync(path.join(dir, ".git"))) {
      pushLog(`Adopting existing clone at ${dir}`);
    } else {
      if (fs.existsSync(dir) && (await fsp.readdir(dir)).length) throw new Error(`${dir} exists and is not a git clone; move it away first.`);
      await fsp.mkdir(path.dirname(dir), { recursive: true });
      pushLog(`Cloning ${project}`);
      const clone = await runCli(spacehubBin(), ["project", "clone", project, dir], undefined, 10 * 60_000);
      clone.out.split("\n").forEach(pushLog);
      if (clone.code !== 0 || !fs.existsSync(path.join(dir, ".git"))) {
        s.status.state = "error";
        s.status.lastError = clone.out.split("\n").pop() || "clone failed";
        throw new Error(`Clone failed: ${s.status.lastError}`);
      }
    }
    // Everything goes to the space: merge local content in, never delete remote files.
    await ensureStore().catch(() => {});
    const copied = await mergeTree(LOCAL_STORE, dir, "missing");
    await scaffoldStore(dir);
    pushLog(`Copied ${copied} local file(s) into the space`);
    const prev = readSpaceConfig();
    await writeSpaceConfig({ project, autoGenerate: prev.autoGenerate, connectedAt: new Date().toISOString() });
    startSync();
    watchSources();
    return status();
  });
}

/** Stop autosync and switch the store back to local, keeping a full local copy. */
export function disconnect() {
  return serial(async () => {
    const s = sup();
    await stopSync();
    const cfg = readSpaceConfig();
    if (cfg.project) {
      const dir = spaceDirFor(cfg.project);
      if (fs.existsSync(dir)) {
        const n = await mergeTree(dir, LOCAL_STORE, "newer");
        pushLog(`Copied ${n} file(s) back to the local store`);
      }
    }
    await writeSpaceConfig({ project: null, autoGenerate: cfg.autoGenerate });
    s.status = { ...s.status, state: "off", project: null, dir: null, gitStatus: undefined };
    watchSources();
    return status();
  });
}

/** Restart autosync (also the "keep both by rebasing again" resolution after a conflict). */
export function syncNow() {
  return serial(async () => {
    const cfg = readSpaceConfig();
    if (!cfg.project) throw new Error("No space connected.");
    await stopSync();
    const s = sup();
    s.status.project = cfg.project;
    s.status.dir = spaceDirFor(cfg.project);
    s.status.lastError = undefined;
    s.backoffMs = 1000;
    startSync();
    return status();
  });
}

export async function setAutoGenerate(value: boolean) {
  const cfg = readSpaceConfig();
  await writeSpaceConfig({ ...cfg, autoGenerate: value });
  if (value) void autoGenerate();
}

export function status(): SpaceStatus {
  const s = sup();
  const cfg = readSpaceConfig();
  if (!cfg.project && s.status.state !== "connecting" && s.status.state !== "error") return { ...s.status, state: "off", project: null, dir: null, log: [...s.status.log] };
  return { ...s.status, log: [...s.status.log] };
}

export function config(): SpaceConfig {
  return readSpaceConfig();
}

export function generatingSlug() {
  return sup().generating;
}

/** Called once on server boot: migrate, resume autosync if configured, watch sources. */
export async function boot() {
  await ensureStore().catch((error) => console.error("[instants] store migration failed", error));
  const cfg = readSpaceConfig();
  const s = sup();
  if (cfg.project && !s.child && s.status.state !== "conflict") {
    const dir = spaceDirFor(cfg.project);
    if (fs.existsSync(path.join(dir, ".git"))) {
      s.status = { ...s.status, project: cfg.project, dir };
      startSync();
    } else {
      s.status = { ...s.status, state: "error", project: cfg.project, dir, lastError: "the space clone is missing; connect again" };
    }
  }
  watchSources();
}

// ---------- incoming sources ----------

type Failures = Record<string, { attempts: number; failedAt: string; error: string }>;
const readFailures = () => fsp.readFile(FAILURES_FILE, "utf8").then((t) => JSON.parse(t) as Failures).catch((): Failures => ({}));
async function writeFailures(f: Failures) {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${FAILURES_FILE}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(f, null, 2));
  await fsp.rename(tmp, FAILURES_FILE);
}

/** Source folders in the store's sources/ that no post was made from. */
export async function pending(): Promise<PendingSource[]> {
  const root = storeDir();
  const src = path.join(root, "sources");
  const entries = await fsp.readdir(src, { withFileTypes: true }).catch(() => []);
  const posts = await fsp.readdir(path.join(root, "posts")).catch(() => [] as string[]);
  const made = new Set<string>();
  const uploadSlugs = new Set<string>();
  await Promise.all(
    posts
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const r = await fsp
          .readFile(path.join(root, "posts", f), "utf8")
          .then((t) => JSON.parse(t) as { slug?: string; origin?: string; sourceDir?: string; path?: string })
          .catch(() => null);
        if (!r) return;
        if (r.sourceDir) made.add(r.sourceDir);
        if (r.origin === "upload" && r.slug) uploadSlugs.add(r.slug);
      }),
  );
  const failures = await readFailures();
  const out: PendingSource[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    if (made.has(`sources/${e.name}`) || uploadSlugs.has(e.name)) continue;
    const dir = path.join(src, e.name);
    const meta = await fsp
      .readFile(path.join(dir, ".upload.json"), "utf8")
      .then((t) => JSON.parse(t) as { title?: string; at?: string })
      .catch(() => null);
    const stat = await fsp.stat(dir).catch(() => null);
    const f = failures[e.name];
    out.push({
      slug: e.name,
      name: meta?.title || e.name,
      addedAt: meta?.at || stat?.mtime.toISOString() || new Date().toISOString(),
      ...(f ? { failedAt: f.failedAt, error: f.error, attempts: f.attempts } : {}),
    });
  }
  return out.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

/** Newest file mtime under a folder (a source still arriving is left alone). */
async function newest(dir: string, depth = 0): Promise<number> {
  let m = 0;
  for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 4) m = Math.max(m, await newest(p, depth + 1));
    else m = Math.max(m, (await fsp.stat(p).catch(() => null))?.mtimeMs ?? 0);
  }
  return m;
}

/**
 * Generate posts for pending sources, one at a time under the shared job lock.
 * Returns what happened per slug. `manual` ignores the failure backoff.
 */
export async function generatePending(slugs?: string[], manual = true): Promise<Record<string, string>> {
  const s = sup();
  const results: Record<string, string> = {};
  const list = (await pending()).filter((p) => !slugs || slugs.includes(p.slug));
  const failures = await readFailures();
  for (const item of list) {
    const f = failures[item.slug];
    if (!manual && f) {
      const wait = Math.min(60 * 60_000, 60_000 * 2 ** (f.attempts - 1));
      if (f.attempts >= MAX_AUTO_ATTEMPTS || Date.now() - Date.parse(f.failedAt) < wait) {
        results[item.slug] = "backoff";
        continue;
      }
    }
    const dir = path.join(sourcesDir(), item.slug);
    if (!manual && Date.now() - (await newest(dir)) < SETTLE_MS) {
      results[item.slug] = "settling";
      continue;
    }
    const lock = job.acquire();
    if (!lock) {
      results[item.slug] = "busy";
      break;
    }
    s.generating = item.slug;
    let error = "";
    let done = false;
    try {
      await runGeneration({
        targets: [dir],
        concurrency: 1,
        signal: lock.signal,
        onEvent: (event) => {
          if (event.type === "error") error = event.message;
          if (event.type === "stage" && event.stage === "skipped") error = event.detail || "skipped";
          if (event.type === "done") done = true;
        },
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      lock.release();
      s.generating = null;
    }
    const latest = await readFailures();
    if (done && !error) {
      delete latest[item.slug];
      results[item.slug] = "posted";
    } else {
      const prev = latest[item.slug];
      latest[item.slug] = { attempts: (prev?.attempts ?? 0) + 1, failedAt: new Date().toISOString(), error: (error || "no post was written").slice(0, 300) };
      results[item.slug] = `failed: ${latest[item.slug].error}`;
    }
    await writeFailures(latest);
  }
  return results;
}

async function autoGenerate() {
  const s = sup();
  if (s.autoBusy || !readSpaceConfig().autoGenerate || job.running()) return;
  s.autoBusy = true;
  try {
    await generatePending(undefined, false);
  } catch (error) {
    console.error("[instants] auto-generate failed", error);
  } finally {
    s.autoBusy = false;
  }
}

/** Watch the current store's sources/ (fs.watch plus a 10 s rescan). */
function watchSources() {
  const s = sup();
  const dir = path.join(storeDir(), "sources");
  if (s.watchedDir !== dir) {
    s.watcher?.close();
    s.watcher = null;
    s.watchedDir = dir;
    try {
      fs.mkdirSync(dir, { recursive: true });
      let debounce: NodeJS.Timeout | null = null;
      s.watcher = fs.watch(dir, () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => void autoGenerate(), SETTLE_MS + 500);
      });
      s.watcher.on("error", () => {
        s.watcher?.close();
        s.watcher = null;
        s.watchedDir = null;
      });
    } catch {
      s.watchedDir = null;
    }
  }
  if (!s.rescan) {
    s.rescan = setInterval(() => {
      if (sup().watchedDir !== path.join(storeDir(), "sources")) watchSources();
      void autoGenerate();
    }, RESCAN_MS);
    s.rescan.unref?.();
  }
}

/** Reveal the space clone in the OS file browser. */
export async function openFolder() {
  const cfg = readSpaceConfig();
  const dir = cfg.project ? spaceDirFor(cfg.project) : storeDir();
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  await runCli(cmd, [dir], undefined, 10_000);
  return dir;
}

export async function refreshGitStatus() {
  const s = sup();
  if (s.status.dir && fs.existsSync(s.status.dir)) s.status.gitStatus = await gitStatus(s.status.dir);
  return s.status.gitStatus;
}
