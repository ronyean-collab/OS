import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";
import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { runMigrations } from "../electron/main/database/migrations";
import {
  verifyDatabaseIntegrity,
  attemptLightweightRepair,
} from "../electron/main/database/integrity";
import { SCHEMA_VERSION } from "../electron/main/database/schema";
import {
  setRecoveryPathsForTests,
} from "../electron/main/database/recovery-snapshot";

describe("sqlite integrity", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    setRecoveryPathsForTests(null, null);
  });

  it("passes integrity on a freshly migrated database", () => {
    const { db, dbPath } = openTestDatabase();
    cleanups.push(() => {
      db.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    });

    const report = verifyDatabaseIntegrity(db, dbPath);
    expect(report.ok).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it("detects missing required tables", () => {
    const dbPath = path.join(os.tmpdir(), `integrity-bad-${Date.now()}.db`);
    const db = new Database(dbPath);
    db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT)");
    db.prepare("INSERT INTO schema_migrations VALUES (1, ?)").run(new Date().toISOString());

    const dir = path.join(os.tmpdir(), `integrity-log-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    setRecoveryPathsForTests(path.join(dir, "snaps"));

    const report = verifyDatabaseIntegrity(db, dbPath);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.startsWith("missing-table"))).toBe(true);
    expect(report.snapshotPath).toBeTruthy();

    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("records schema version after migrations", () => {
    const dbPath = path.join(os.tmpdir(), `integrity-ver-${Date.now()}.db`);
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    runMigrations(db, dbPath);

    const version = db
      .prepare("SELECT MAX(version) AS v FROM schema_migrations")
      .get() as { v: number };
    expect(version.v).toBe(SCHEMA_VERSION);

    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("attempts lightweight repair without throwing", () => {
    const { db } = openTestDatabase();
    cleanups.push(() => db.close());
    const result = attemptLightweightRepair(db);
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });
});
