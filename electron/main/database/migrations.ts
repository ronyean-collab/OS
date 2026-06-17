import fs from "fs";
import type Database from "better-sqlite3";
import {
  MIGRATION_001,
  MIGRATION_002,
  MIGRATION_003,
  MIGRATION_004,
  MIGRATION_005,
  MIGRATION_006,
  MIGRATION_007,
  MIGRATION_008,
  MIGRATION_009,
  MIGRATION_010,
  MIGRATION_011,
  MIGRATION_012,
  MIGRATION_013,
  MIGRATION_014,
  MIGRATION_015,
  MIGRATION_016,
  SCHEMA_VERSION,
} from "./schema";
import { createRecoverySnapshot } from "./recovery-snapshot";
import { runInTransaction } from "./transactions";
import { logMigrationAudit } from "../services/migration-audit";

export type Migration = {
  version: number;
  sql: string;
};

export const MIGRATIONS: Migration[] = [
  { version: 1, sql: MIGRATION_001 },
  { version: 2, sql: MIGRATION_002 },
  { version: 3, sql: MIGRATION_003 },
  { version: 4, sql: MIGRATION_004 },
  { version: 5, sql: MIGRATION_005 },
  { version: 6, sql: MIGRATION_006 },
  { version: 7, sql: MIGRATION_007 },
  { version: 8, sql: MIGRATION_008 },
  { version: 9, sql: MIGRATION_009 },
  { version: 10, sql: MIGRATION_010 },
  { version: 11, sql: MIGRATION_011 },
  { version: 12, sql: MIGRATION_012 },
  { version: 13, sql: MIGRATION_013 },
  { version: 14, sql: MIGRATION_014 },
  { version: 15, sql: MIGRATION_015 },
  { version: 16, sql: MIGRATION_016 },
];

export function getAppliedVersion(db: Database.Database): number {
  try {
    const row = db
      .prepare("SELECT MAX(version) AS v FROM schema_migrations")
      .get() as { v: number | null };
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

/** Copy DB file before applying pending migrations (fallback when recovery snapshot unavailable). */
export function createMigrationSafetySnapshot(dbPath: string): string | null {
  if (!fs.existsSync(dbPath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotPath = `${dbPath}.pre-migrate-${stamp}.bak`;
  fs.copyFileSync(dbPath, snapshotPath);
  return snapshotPath;
}

export function runMigrations(db: Database.Database, dbPath: string): {
  applied: number[];
  snapshotPath: string | null;
} {
  const current = getAppliedVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > current);
  if (pending.length === 0) {
    return { applied: [], snapshotPath: null };
  }

  const recoveryMeta = createRecoverySnapshot(dbPath, "pre-migration");
  const snapshotPath =
    recoveryMeta?.filePath ?? createMigrationSafetySnapshot(dbPath);
  const applied: number[] = [];

  runInTransaction(db, () => {
    for (const migration of pending) {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
      ).run(migration.version, new Date().toISOString());
      applied.push(migration.version);
      logMigrationAudit({
        migrationVersion: migration.version,
        snapshotPath,
        pendingCount: pending.length,
      });
    }
  });

  return { applied, snapshotPath };
}

export function ensureSchemaCurrent(db: Database.Database, dbPath: string): void {
  const version = getAppliedVersion(db);
  if (version < SCHEMA_VERSION) {
    runMigrations(db, dbPath);
  }
}
