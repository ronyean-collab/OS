import type Database from "better-sqlite3";
import { REQUIRED_TABLES, SCHEMA_VERSION } from "./schema";
import { appendRecoveryLog, createRecoverySnapshot } from "./recovery-snapshot";
import { getAppliedVersion } from "./migrations";

export type IntegrityReport = {
  ok: boolean;
  issues: string[];
  repairAttempted: boolean;
  repairSucceeded: boolean;
  snapshotPath: string | null;
};

function runIntegrityCheck(db: Database.Database): string[] {
  const issues: string[] = [];
  try {
    const rows = db.pragma("integrity_check") as Array<{ integrity_check: string }>;
    for (const row of rows) {
      const v = String(row.integrity_check ?? row).trim();
      if (v.toLowerCase() !== "ok") {
        issues.push(v);
      }
    }
  } catch (err) {
    issues.push(err instanceof Error ? err.message : "integrity_check failed");
  }
  return issues;
}

function verifyRequiredTables(db: Database.Database): string[] {
  const issues: string[] = [];
  for (const table of REQUIRED_TABLES) {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table) as { name: string } | undefined;
    if (!row) {
      issues.push(`missing-table:${table}`);
    }
  }
  return issues;
}

function verifySchemaVersion(db: Database.Database): string[] {
  const issues: string[] = [];
  const applied = getAppliedVersion(db);
  if (applied < 1) {
    issues.push("schema-not-initialized");
  }
  if (applied > SCHEMA_VERSION) {
    issues.push(`schema-ahead:db=${applied},app=${SCHEMA_VERSION}`);
  }
  return issues;
}

function verifyMessageStatusColumn(db: Database.Database): string[] {
  try {
    db.prepare("SELECT message_status FROM messages LIMIT 1").get();
    return [];
  } catch {
    return ["missing-column:messages.message_status"];
  }
}

export function attemptLightweightRepair(db: Database.Database): {
  ok: boolean;
  message: string;
} {
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
    const issues = runIntegrityCheck(db);
    if (issues.length === 0) {
      return { ok: true, message: "WAL checkpoint completed; integrity OK." };
    }
    return { ok: false, message: issues.join("; ") };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Repair failed",
    };
  }
}

export function verifyDatabaseIntegrity(
  db: Database.Database,
  dbPath: string,
): IntegrityReport {
  const issues = [
    ...runIntegrityCheck(db),
    ...verifyRequiredTables(db),
    ...verifySchemaVersion(db),
    ...verifyMessageStatusColumn(db),
  ];

  if (issues.length === 0) {
    return {
      ok: true,
      issues: [],
      repairAttempted: false,
      repairSucceeded: false,
      snapshotPath: null,
    };
  }

  appendRecoveryLog(`integrity-failed: ${issues.join(" | ")}`);
  const snapshotPath =
    createRecoverySnapshot(dbPath, "pre-repair-integrity")?.filePath ?? null;

  const repair = attemptLightweightRepair(db);
  const afterRepair = [
    ...runIntegrityCheck(db),
    ...verifyRequiredTables(db),
    ...verifyMessageStatusColumn(db),
  ];

  if (afterRepair.length === 0) {
    appendRecoveryLog("integrity-restored after lightweight repair");
    return {
      ok: true,
      issues: [],
      repairAttempted: true,
      repairSucceeded: true,
      snapshotPath,
    };
  }

  return {
    ok: false,
    issues: afterRepair,
    repairAttempted: true,
    repairSucceeded: false,
    snapshotPath,
  };
}
