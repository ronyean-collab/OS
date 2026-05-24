import fs from "fs";
import os from "os";
import path from "path";
import { app } from "electron";
import { getVersionStamp } from "../../../src/shared/app-version";

export type AuditEventType =
  | "restore_attempt"
  | "restore_completed"
  | "restore_failed"
  | "restore_preview_opened"
  | "restore_confirmed"
  | "import_attempt"
  | "import_completed"
  | "import_failed"
  | "encrypted_import_attempt"
  | "encrypted_import_completed"
  | "encrypted_import_failed"
  | "validation_failed"
  | "recovery_mode_entered"
  | "integrity_failed"
  | "replay_audit"
  | "migration_dry_run"
  | "backup_reminder_shown";

export type AuditEvent = {
  id: string;
  type: AuditEventType;
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  buildNumber: string;
  releaseChannel: string;
  workspaceId?: string | null;
  snapshotId?: string | null;
  message: string;
  details?: Record<string, unknown>;
};

let auditDirOverride: string | null = null;

export function setAuditDirForTests(dir: string | null): void {
  auditDirOverride = dir;
}

function auditLogPath(): string {
  const root = auditDirOverride ?? (() => {
    try {
      return app.getPath("userData");
    } catch {
      return path.join(os.tmpdir(), "continuity-desktop-test");
    }
  })();
  return path.join(root, "reliability-audit.jsonl");
}

/** Append-only local audit log — no telemetry. */
export function appendAuditEvent(
  event: Omit<AuditEvent, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  },
): AuditEvent {
  const version = getVersionStamp();
  const entry: AuditEvent = {
    id: event.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: event.createdAt ?? new Date().toISOString(),
    appVersion: version.appVersion,
    schemaVersion: version.schemaVersion,
    buildNumber: version.buildNumber,
    releaseChannel: version.releaseChannel,
    type: event.type,
    workspaceId: event.workspaceId ?? null,
    snapshotId: event.snapshotId ?? null,
    message: event.message,
    details: {
      ...event.details,
      buildDate: version.buildDate,
    },
  };

  const line = `${JSON.stringify(entry)}\n`;
  const logPath = auditLogPath();
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(logPath, line, "utf8");
  return entry;
}

export function readAuditEvents(limit = 200): AuditEvent[] {
  const logPath = auditLogPath();
  if (!fs.existsSync(logPath)) return [];

  const lines = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
  const events: AuditEvent[] = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as AuditEvent);
    } catch {
      /* skip malformed */
    }
  }
  events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return events.slice(0, limit);
}

export function clearAuditLogForTests(): void {
  const logPath = auditLogPath();
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
}
