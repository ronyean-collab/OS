import type Database from "better-sqlite3";
import { appendAuditEvent } from "./reliability-audit";

export const DEFAULT_BACKUP_REMINDER_INTERVAL_MS = Number(
  process.env.CONTINUITY_BACKUP_REMINDER_MS ?? 7 * 24 * 60 * 60 * 1000,
);

/** Minimum gap between banner displays — avoids nagging. */
export const BACKUP_REMINDER_SNOOZE_MS = 24 * 60 * 60 * 1000;

const META_INTERVAL = "backup_reminder_interval_ms";
const META_LAST_SHOWN = "backup_reminder_last_shown_at";
const META_DISMISSED_UNTIL = "backup_reminder_dismissed_until";
const META_LAST_EXPORT = "last_export_at";

export type BackupReminderStatus = {
  shouldShow: boolean;
  message: string | null;
  lastExportAt: string | null;
  lastShownAt: string | null;
  dismissedUntil: string | null;
  intervalMs: number;
  daysSinceExport: number | null;
};

function readMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function writeMeta(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
}

export function getBackupReminderIntervalMs(db: Database.Database): number {
  const raw = readMeta(db, META_INTERVAL);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_BACKUP_REMINDER_INTERVAL_MS;
}

export function setBackupReminderIntervalMs(
  db: Database.Database,
  intervalMs: number,
): void {
  if (!Number.isFinite(intervalMs) || intervalMs < 60_000) {
    throw new Error("Reminder interval must be at least one minute.");
  }
  writeMeta(db, META_INTERVAL, String(intervalMs));
}

export function getBackupReminderStatus(db: Database.Database): BackupReminderStatus {
  const now = Date.now();
  const intervalMs = getBackupReminderIntervalMs(db);
  const lastExportAt = readMeta(db, META_LAST_EXPORT);
  const lastShownAt = readMeta(db, META_LAST_SHOWN);
  const dismissedUntil = readMeta(db, META_DISMISSED_UNTIL);

  if (dismissedUntil) {
    const until = new Date(dismissedUntil).getTime();
    if (!Number.isNaN(until) && now < until) {
      return {
        shouldShow: false,
        message: null,
        lastExportAt,
        lastShownAt,
        dismissedUntil,
        intervalMs,
        daysSinceExport: lastExportAt
          ? Math.floor((now - new Date(lastExportAt).getTime()) / 86400000)
          : null,
      };
    }
  }

  if (lastShownAt) {
    const shownMs = new Date(lastShownAt).getTime();
    if (!Number.isNaN(shownMs) && now - shownMs < BACKUP_REMINDER_SNOOZE_MS) {
      return {
        shouldShow: false,
        message: null,
        lastExportAt,
        lastShownAt,
        dismissedUntil,
        intervalMs,
        daysSinceExport: lastExportAt
          ? Math.floor((now - new Date(lastExportAt).getTime()) / 86400000)
          : null,
      };
    }
  }

  const lastExportMs = lastExportAt ? new Date(lastExportAt).getTime() : 0;
  const due =
    !lastExportAt ||
    Number.isNaN(lastExportMs) ||
    now - lastExportMs >= intervalMs;

  const daysSinceExport = lastExportAt
    ? Math.floor((now - lastExportMs) / 86400000)
    : null;

  const message = due
    ? lastExportAt
      ? `It has been ${daysSinceExport ?? "several"} day(s) since your last local backup export.`
      : "You have not exported a local backup yet."
    : null;

  return {
    shouldShow: due,
    message,
    lastExportAt,
    lastShownAt,
    dismissedUntil,
    intervalMs,
    daysSinceExport,
  };
}

export function recordBackupReminderShown(db: Database.Database): void {
  writeMeta(db, META_LAST_SHOWN, new Date().toISOString());
  appendAuditEvent({
    type: "backup_reminder_shown",
    message: "Local backup reminder displayed",
  });
}

export function dismissBackupReminder(
  db: Database.Database,
  snoozeMs: number = BACKUP_REMINDER_SNOOZE_MS,
): void {
  const until = new Date(Date.now() + snoozeMs).toISOString();
  writeMeta(db, META_DISMISSED_UNTIL, until);
}
