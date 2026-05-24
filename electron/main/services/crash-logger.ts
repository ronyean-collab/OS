import fs from "fs";
import path from "path";
import { app } from "electron";

export type CrashLogEntry = {
  id: string;
  process: "main" | "renderer";
  createdAt: string;
  message: string;
  stack: string | null;
  context?: Record<string, unknown>;
};

export type CrashSessionSummary = {
  previousSessionCrashed: boolean;
  lastCrashAt: string | null;
  lastCrashProcess: string | null;
  recoverySnapshotPreserved: boolean;
  message: string | null;
};

const SESSION_MARKER = "session_clean_exit";
const PREVIOUS_SESSION_CLEAN = "previous_session_clean_exit";
const LAST_CRASH_AT = "last_crash_at";

let logDirOverride: string | null = null;

export function setCrashLogDirForTests(dir: string | null): void {
  logDirOverride = dir;
}

function logsRoot(): string {
  return (
    logDirOverride ??
    (() => {
      try {
        return app.getPath("userData");
      } catch {
        return path.join(process.cwd(), ".continuity-test");
      }
    })()
  );
}

function crashLogPath(): string {
  return path.join(logsRoot(), "crash-log.jsonl");
}

function metaPath(): string {
  return path.join(logsRoot(), "session-state.json");
}

function readSessionMeta(): Record<string, string> {
  const p = metaPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSessionMeta(meta: Record<string, string>): void {
  const p = metaPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(meta, null, 2), "utf8");
}

export function markSessionStart(): void {
  const meta = readSessionMeta();
  meta[PREVIOUS_SESSION_CLEAN] = meta[SESSION_MARKER] ? "yes" : "no";
  meta.session_started_at = new Date().toISOString();
  delete meta[SESSION_MARKER];
  writeSessionMeta(meta);
}

export function markSessionCleanExit(): void {
  const meta = readSessionMeta();
  meta[SESSION_MARKER] = new Date().toISOString();
  delete meta[LAST_CRASH_AT];
  delete meta.last_crash_process;
  writeSessionMeta(meta);
}

export function logCrash(input: {
  process: "main" | "renderer";
  error: unknown;
  context?: Record<string, unknown>;
}): CrashLogEntry {
  const err = input.error;
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack ?? null : null;
  const entry: CrashLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    process: input.process,
    createdAt: new Date().toISOString(),
    message: message.slice(0, 2000),
    stack: stack ? stack.slice(0, 8000) : null,
    context: input.context,
  };

  const logPath = crashLogPath();
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf8");

  const meta = readSessionMeta();
  meta[LAST_CRASH_AT] = entry.createdAt;
  meta.last_crash_process = input.process;
  writeSessionMeta(meta);

  return entry;
}

export function readCrashLogSummary(limit = 20): CrashLogEntry[] {
  const logPath = crashLogPath();
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
  const entries: CrashLogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as CrashLogEntry);
    } catch {
      /* skip */
    }
  }
  entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return entries.slice(0, limit);
}

export function getPreviousSessionCrashSummary(
  recoverySnapshotPreserved: boolean,
): CrashSessionSummary {
  const meta = readSessionMeta();
  const previousClean = meta[PREVIOUS_SESSION_CLEAN] === "yes";
  const lastCrashAt = meta[LAST_CRASH_AT] ?? null;
  const previousSessionCrashed = !previousClean && Boolean(lastCrashAt);

  let message: string | null = null;
  if (previousSessionCrashed) {
    message = recoverySnapshotPreserved
      ? "Previous session closed unexpectedly. Recovery snapshot was preserved."
      : "Previous session closed unexpectedly.";
  }

  return {
    previousSessionCrashed,
    lastCrashAt,
    lastCrashProcess: meta.last_crash_process ?? null,
    recoverySnapshotPreserved,
    message,
  };
}

export function clearCrashLogsForTests(): void {
  const logPath = crashLogPath();
  const meta = metaPath();
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  if (fs.existsSync(meta)) fs.unlinkSync(meta);
}
