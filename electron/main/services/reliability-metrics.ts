import type Database from "better-sqlite3";
import { getLastSnapshotTime } from "./snapshot-service";

const META_LAST_PERSISTENCE = "last_successful_persistence_at";

export type OperationalMetrics = {
  lastSnapshotAt: string | null;
  lastSuccessfulPersistenceAt: string | null;
};

export function recordSuccessfulPersistence(db: Database.Database): void {
  db.prepare(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)",
  ).run(META_LAST_PERSISTENCE, new Date().toISOString());
}

export function getLastSuccessfulPersistence(
  db: Database.Database,
): string | null {
  const row = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get(META_LAST_PERSISTENCE) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getOperationalMetrics(
  db: Database.Database,
  workspaceId: string,
): OperationalMetrics {
  const ws = db
    .prepare("SELECT id FROM workspaces WHERE id = ?")
    .get(workspaceId) as { id: string } | undefined;
  return {
    lastSnapshotAt: ws ? getLastSnapshotTime(db, workspaceId) : null,
    lastSuccessfulPersistenceAt: getLastSuccessfulPersistence(db),
  };
}
