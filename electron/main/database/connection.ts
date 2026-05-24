import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { app } from "electron";
import { ensureSchemaCurrent, runMigrations } from "./migrations";
import { SCHEMA_VERSION } from "./schema";
import { verifyDatabaseIntegrity } from "./integrity";
import { appendRecoveryLog, createRecoverySnapshot } from "./recovery-snapshot";
import { runInTransaction } from "./transactions";
import {
  markStreamingMessagesInterrupted,
  recoverInterruptedStreams,
} from "../services/stream-recovery";
import { appendTimelineEventValidated } from "../services/timeline-events";
import { validateAllThreadIds } from "../services/thread-reconstruction";
import {
  evaluateStartupCompatibility,
  writeStartupVersionMarkers,
  type StartupCompatibilityReport,
} from "../services/compatibility";
import {
  getPreviousSessionCrashSummary,
  markSessionStart,
  type CrashSessionSummary,
} from "../services/crash-logger";

export type DbConnectionResult =
  | { ok: true; db: Database.Database; dbPath: string }
  | { ok: false; error: string };

export type ReliabilityState = {
  continuityHealthy: boolean;
  interruptedResponsesRecovered: number;
  sqliteRepairAttempted: boolean;
  sqliteIntegrityRestored: boolean;
  recoverySnapshotCreated: boolean;
  reliabilityMessage: string | null;
};

let sharedDb: Database.Database | null = null;
let recoveryMode = false;
let recoveryMessage: string | null = null;
let lastMigrationApplied: number[] = [];
let startupCompatibility: StartupCompatibilityReport | null = null;
let crashSessionSummary: CrashSessionSummary | null = null;

let reliabilityState: ReliabilityState = {
  continuityHealthy: true,
  interruptedResponsesRecovered: 0,
  sqliteRepairAttempted: false,
  sqliteIntegrityRestored: false,
  recoverySnapshotCreated: false,
  reliabilityMessage: null,
};

export function isRecoveryMode(): boolean {
  return recoveryMode;
}

export function getRecoveryMessage(): string | null {
  return recoveryMessage;
}

export function getReliabilityState(): ReliabilityState {
  return { ...reliabilityState };
}

export function getStartupCrashSummary(): CrashSessionSummary | null {
  return crashSessionSummary;
}

export function getStartupCompatibilityReport(): StartupCompatibilityReport | null {
  return startupCompatibility;
}

export function getLastMigrationApplied(): number[] {
  return [...lastMigrationApplied];
}

export function enterRecoveryMode(message: string): void {
  recoveryMode = true;
  recoveryMessage = message;
  reliabilityState.continuityHealthy = false;
  if (sharedDb) {
    try {
      sharedDb.close();
    } catch {
      /* ignore */
    }
    sharedDb = null;
  }
}

/** Resolves userData for Electron runtime or isolated Vitest runs. */
export function getUserDataPath(): string {
  const testPath = process.env.CONTINUITY_TEST_USER_DATA?.trim();
  if (testPath) {
    fs.mkdirSync(testPath, { recursive: true });
    return testPath;
  }
  try {
    if (app && typeof app.isReady === "function" && typeof app.getPath === "function") {
      return app.getPath("userData");
    }
  } catch {
    /* Electron not available in unit tests */
  }
  const fallback = path.join(os.tmpdir(), "continuity-desktop-userdata");
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

export function getDbPath(): string {
  const userData = getUserDataPath();
  const dir = path.join(userData, "data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "continuity.db");
}

function recordRecoveryTimeline(
  db: Database.Database,
  workspaceId: string | null,
  type:
    | "recovery_mode_entered"
    | "sqlite_integrity_failed"
    | "sqlite_integrity_restored"
    | "recovery_snapshot_created",
  title: string,
  description: string,
): void {
  if (!workspaceId) return;
  appendTimelineEventValidated(db, {
    workspaceId,
    type,
    title,
    description,
    source: "recovery",
  });
}

function getDefaultWorkspaceId(db: Database.Database): string | null {
  const row = db
    .prepare("SELECT id FROM workspaces ORDER BY last_opened_at DESC LIMIT 1")
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

function runStartupRecovery(db: Database.Database, dbPath: string): void {
  if (fs.existsSync(dbPath)) {
    const snap = createRecoverySnapshot(dbPath, "startup-check");
    if (snap) {
      reliabilityState.recoverySnapshotCreated = true;
      const wsId = getDefaultWorkspaceId(db);
      recordRecoveryTimeline(
        db,
        wsId,
        "recovery_snapshot_created",
        "Recovery snapshot saved",
        `Snapshot created before integrity verification.`,
      );
    }
  }

  const integrity = verifyDatabaseIntegrity(db, dbPath);
  const wsId = getDefaultWorkspaceId(db);

  if (integrity.repairAttempted) {
    reliabilityState.sqliteRepairAttempted = true;
  }

  if (!integrity.ok) {
    appendRecoveryLog(`startup integrity failed: ${integrity.issues.join(" | ")}`);
    if (wsId) {
      recordRecoveryTimeline(
        db,
        wsId,
        "sqlite_integrity_failed",
        "Local continuity needs attention",
        "SQLite integrity check reported issues. Your data has been preserved.",
      );
      recordRecoveryTimeline(
        db,
        wsId,
        "recovery_mode_entered",
        "Recovery-safe mode",
        "The app is operating in recovery-safe mode until the database is healthy.",
      );
    }
    enterRecoveryMode(
      "Local continuity database needs attention. Data preserved — no automatic wipe.",
    );
    return;
  }

  if (integrity.repairSucceeded && wsId) {
    reliabilityState.sqliteIntegrityRestored = true;
    reliabilityState.reliabilityMessage = "Continuity restored successfully.";
    recordRecoveryTimeline(
      db,
      wsId,
      "sqlite_integrity_restored",
      "Continuity restored",
      "SQLite integrity check passed after a lightweight repair.",
    );
  }

  const streamRecovery = recoverInterruptedStreams(db);
  if (streamRecovery.recoveredCount > 0) {
    reliabilityState.interruptedResponsesRecovered = streamRecovery.recoveredCount;
    reliabilityState.reliabilityMessage =
      "Previous response was interrupted and safely preserved.";
  }

  const threadIssues = validateAllThreadIds(db);
  if (threadIssues.length > 0) {
    appendRecoveryLog(`thread-validation: ${threadIssues.join(" | ")}`);
  }

  reliabilityState.continuityHealthy = true;
}

export function openDatabase(): DbConnectionResult {
  if (recoveryMode) {
    return { ok: false, error: recoveryMessage ?? "Database in recovery mode" };
  }

  if (sharedDb) {
    return { ok: true, db: sharedDb, dbPath: getDbPath() };
  }

  const dbPath = getDbPath();
  try {
    markSessionStart();
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    const applied = runMigrations(db, dbPath);
    lastMigrationApplied = applied.applied;
    ensureSchemaCurrent(db, dbPath);

    const migrationVersion = db
      .prepare("SELECT MAX(version) AS v FROM schema_migrations")
      .get() as { v: number | null };
    startupCompatibility = evaluateStartupCompatibility(
      db,
      migrationVersion?.v ?? 0,
    );

    if (startupCompatibility.downgradeDetected) {
      appendRecoveryLog(
        `startup downgrade: ${startupCompatibility.errors.join(" | ")}`,
      );
      reliabilityState.reliabilityMessage =
        "This database was opened with a newer app version. Upgrade ContinuityOS before continuing.";
    } else if (startupCompatibility.warnings.length > 0) {
      reliabilityState.reliabilityMessage = startupCompatibility.warnings[0];
    }

    runInTransaction(db, () => {
      db.prepare(
        "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('schema_version', ?)",
      ).run(String(SCHEMA_VERSION));

      if (applied.applied.length > 0) {
        db.prepare(
          "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('last_migration_snapshot', ?)",
        ).run(applied.snapshotPath ?? "");
      }
    });

    runStartupRecovery(db, dbPath);
    crashSessionSummary = getPreviousSessionCrashSummary(
      reliabilityState.recoverySnapshotCreated || Boolean(applied.snapshotPath),
    );
    if (crashSessionSummary.message && !recoveryMode) {
      reliabilityState.reliabilityMessage = crashSessionSummary.message;
    }

    writeStartupVersionMarkers(db);

    if (recoveryMode) {
      return { ok: false, error: recoveryMessage ?? "Recovery mode" };
    }

    if (
      startupCompatibility.downgradeDetected &&
      startupCompatibility.errors.includes("database-newer-than-app")
    ) {
      enterRecoveryMode(
        "Database schema is newer than this app build. Update ContinuityOS to continue.",
      );
      return { ok: false, error: recoveryMessage ?? "Schema mismatch" };
    }

    sharedDb = db;
    return { ok: true, db, dbPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SQLite open failed";
    appendRecoveryLog(`open-failed: ${msg}`);
    enterRecoveryMode(msg);
    return { ok: false, error: msg };
  }
}

export function getDatabase(): Database.Database {
  const result = openDatabase();
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.db;
}

export function closeDatabase(): void {
  if (sharedDb) {
    try {
      markStreamingMessagesInterrupted(sharedDb);
    } catch {
      /* ignore during shutdown */
    }
    sharedDb.close();
    sharedDb = null;
  }
}

/** For tests — reset singleton. */
export function resetDatabaseForTests(): void {
  closeDatabase();
  recoveryMode = false;
  recoveryMessage = null;
  reliabilityState = {
    continuityHealthy: true,
    interruptedResponsesRecovered: 0,
    sqliteRepairAttempted: false,
    sqliteIntegrityRestored: false,
    recoverySnapshotCreated: false,
    reliabilityMessage: null,
  };
  lastMigrationApplied = [];
  startupCompatibility = null;
  crashSessionSummary = null;
}
