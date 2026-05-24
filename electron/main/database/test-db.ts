import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";
import { runMigrations } from "./migrations";

/** Opens an isolated SQLite DB for Vitest (no Electron app required). */
export function openTestDatabase(): {
  db: Database.Database;
  dbPath: string;
  cleanup: () => void;
} {
  const dbPath = path.join(
    os.tmpdir(),
    `continuity-desktop-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db, dbPath);

  return {
    db,
    dbPath,
    cleanup: () => {
      db.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    },
  };
}
