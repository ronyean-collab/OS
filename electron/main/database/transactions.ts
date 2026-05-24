import type Database from "better-sqlite3";

/** Run writes inside a SQLite transaction — rolls back on throw. */
export function runInTransaction<T>(db: Database.Database, fn: () => T): T {
  const tx = db.transaction(fn);
  return tx();
}
