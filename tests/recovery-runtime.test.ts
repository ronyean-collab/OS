import fs from "fs";
import path from "path";
import os from "os";
import Database from "better-sqlite3";
import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  createWorkspace,
  createThread,
} from "../electron/main/services/workspace-service";
import {
  recoverInterruptedStreams,
  markStreamingMessagesInterrupted,
} from "../electron/main/services/stream-recovery";
import { runInTransaction } from "../electron/main/database/transactions";
import { runMigrations } from "../electron/main/database/migrations";
import { MIGRATION_001 } from "../electron/main/database/schema";
import {
  createRecoverySnapshot,
  setRecoveryPathsForTests,
  validateRecoverySnapshot,
} from "../electron/main/database/recovery-snapshot";

describe("recovery runtime", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    setRecoveryPathsForTests(null, null);
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s;
  }

  it("recovers interrupted streams without duplicating rows or losing content", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Recovery WS");
    const thread = createThread(db, ws.id, "Chat");
    const now = new Date().toISOString();
    const msgId = "asst-interrupted-1";

    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, provider, model, raw_provider_payload, created_at, message_status)
       VALUES (?, ?, 'assistant', ?, 'openai', 'gpt-4o-mini', NULL, ?, 'streaming')`,
    ).run(msgId, thread.id, "Partial answer kept", now);

    const result = recoverInterruptedStreams(db);
    expect(result.recoveredCount).toBe(1);
    expect(result.messageIds).toContain(msgId);

    const row = db
      .prepare("SELECT content, message_status FROM messages WHERE id = ?")
      .get(msgId) as { content: string; message_status: string };
    expect(row.content).toBe("Partial answer kept");
    expect(row.message_status).toBe("interrupted");

    const count = db
      .prepare("SELECT COUNT(*) AS c FROM messages WHERE id = ?")
      .get(msgId) as { c: number };
    expect(count.c).toBe(1);

    const evt = db
      .prepare(
        "SELECT COUNT(*) AS c FROM timeline_events WHERE event_type = 'assistant_response_interrupted'",
      )
      .get() as { c: number };
    expect(evt.c).toBe(1);

    const second = recoverInterruptedStreams(db);
    expect(second.recoveredCount).toBe(0);
  });

  it("marks streaming messages interrupted on graceful shutdown path", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Shutdown WS");
    const thread = createThread(db, ws.id, "Chat");
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, created_at, message_status)
       VALUES ('m1', ?, 'assistant', 'Still going', ?, 'streaming')`,
    ).run(thread.id, now);

    const changes = markStreamingMessagesInterrupted(db);
    expect(changes).toBe(1);
    const row = db
      .prepare("SELECT message_status FROM messages WHERE id = 'm1'")
      .get() as { message_status: string };
    expect(row.message_status).toBe("interrupted");
  });

  it("rolls back partial message insert on transaction failure", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Tx WS");
    const thread = createThread(db, ws.id, "Chat");

    expect(() =>
      runInTransaction(db, () => {
        db.prepare(
          `INSERT INTO messages (id, thread_id, role, content, created_at, message_status)
           VALUES ('tx-msg', ?, 'user', 'Should rollback', ?, 'completed')`,
        ).run(thread.id, new Date().toISOString());
        throw new Error("simulated failure");
      }),
    ).toThrow();

    const row = db
      .prepare("SELECT id FROM messages WHERE id = 'tx-msg'")
      .get();
    expect(row).toBeUndefined();
  });

  it("creates atomic recovery snapshot with metadata", () => {
    const dir = path.join(os.tmpdir(), `recovery-snap-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    setRecoveryPathsForTests(dir);

    const s = openTestDatabase();
    cleanups.push(s.cleanup);

    const meta = createRecoverySnapshot(s.dbPath, "test-snapshot");
    expect(meta).toBeTruthy();
    expect(meta?.reason).toBe("test-snapshot");
    expect(meta?.schemaVersion).toBeGreaterThan(0);

    const validation = validateRecoverySnapshot(meta!.filePath);
    expect(validation.valid).toBe(true);

    if (meta?.filePath && fs.existsSync(meta.filePath)) fs.unlinkSync(meta.filePath);
    if (meta?.filePath && fs.existsSync(`${meta.filePath}.meta.json`)) {
      fs.unlinkSync(`${meta.filePath}.meta.json`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates migration safety snapshot before schema upgrade", () => {
    const dbPath = path.join(os.tmpdir(), `migrate-snap-${Date.now()}.db`);
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    db.exec(MIGRATION_001);
    db.prepare(
      "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)",
    ).run(new Date().toISOString());
    db.close();

    const db2 = new Database(dbPath);
    db2.pragma("foreign_keys = ON");
    const result = runMigrations(db2, dbPath);
    expect(result.applied).toContain(2);
    expect(result.snapshotPath).toBeTruthy();
    db2.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });
});
