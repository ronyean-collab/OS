import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { MIGRATIONS, runMigrations } from "../electron/main/database/migrations";
import { SCHEMA_VERSION } from "../electron/main/database/schema";

describe("database foundation", () => {
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `continuity-test-${Date.now()}.db`);
    db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it("runs migrations and records schema version", () => {
    const result = runMigrations(db, dbPath);
    expect(result.applied).toContain(1);
    expect(result.applied).toContain(2);
    expect(result.applied).toContain(3);
    expect(result.applied).toContain(4);
    const version = db
      .prepare("SELECT MAX(version) AS v FROM schema_migrations")
      .get() as { v: number };
    expect(version.v).toBe(SCHEMA_VERSION);

    const timelineCols = db
      .prepare("SELECT app_version FROM timeline_events LIMIT 0")
      .get();
    expect(timelineCols).toBeUndefined();

    const statusCol = db
      .prepare("SELECT message_status FROM messages LIMIT 0")
      .get();
    expect(statusCol).toBeUndefined();

    const replayCol = db
      .prepare("SELECT replay_hash FROM snapshots LIMIT 0")
      .get();
    expect(replayCol).toBeUndefined();

    const indexRow = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_messages_thread_created'",
      )
      .get() as { name: string } | undefined;
    expect(indexRow?.name).toBe("idx_messages_thread_created");
  });

  it("creates safety snapshot before migrating existing db", () => {
    db.close();
    const legacyDb = new Database(dbPath);
    legacyDb.exec("CREATE TABLE legacy_marker (id INTEGER PRIMARY KEY)");
    legacyDb.close();

    db = new Database(dbPath);
    const result = runMigrations(db, dbPath);
    expect(result.snapshotPath).toBeTruthy();
    expect(fs.existsSync(result.snapshotPath!)).toBe(true);
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    db.close();
    if (result.snapshotPath && fs.existsSync(result.snapshotPath)) {
      fs.unlinkSync(result.snapshotPath);
    }
  });

  it("persists workspace, thread, message, and timeline event", () => {
    runMigrations(db, dbPath);
    const wsId = "ws-1";
    const threadId = "th-1";
    const msgId = "msg-1";
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO workspaces (id, name, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(wsId, "Test WS", now, now, now);

    db.prepare(
      `INSERT INTO threads (id, workspace_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(threadId, wsId, "Thread A", now, now);

    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, provider, model, raw_provider_payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(msgId, threadId, "user", "Hello", null, null, JSON.stringify({ test: true }), now);

    db.prepare(
      `INSERT INTO timeline_events (id, workspace_id, thread_id, event_type, title, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("evt-1", wsId, threadId, "message_added", "Message added", "Hello", now);

    const msg = db.prepare("SELECT content FROM messages WHERE id = ?").get(msgId) as {
      content: string;
    };
    expect(msg.content).toBe("Hello");

    const events = db
      .prepare("SELECT COUNT(*) AS c FROM timeline_events WHERE workspace_id = ?")
      .get(wsId) as { c: number };
    expect(events.c).toBe(1);
  });
});
