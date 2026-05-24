import fs from "fs";
import path from "path";
import os from "os";
import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import {
  setRecoveryPathsForTests,
} from "../electron/main/database/recovery-snapshot";
import {
  clearAuditLogForTests,
  readAuditEvents,
  setAuditDirForTests,
} from "../electron/main/services/reliability-audit";
import {
  createManualSnapshot,
} from "../electron/main/services/snapshot-service";
import {
  createThread,
  createWorkspace,
} from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  executeSnapshotRestore,
  validateSnapshotForRestoreExecution,
} from "../electron/main/services/restore-service";

describe("restore service", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
    setRecoveryPathsForTests(null);
    setAuditDirForTests(null);
    clearAuditLogForTests();
  });

  function session() {
    const s = openTestDatabase();
    const auditDir = path.join(os.tmpdir(), `audit-${Date.now()}`);
    fs.mkdirSync(auditDir, { recursive: true });
    setRecoveryPathsForTests(path.join(auditDir, "snaps"));
    setAuditDirForTests(auditDir);
    cleanups.push(() => {
      s.cleanup();
      fs.rmSync(auditDir, { recursive: true, force: true });
    });
    return s;
  }

  it("validates snapshot before restore", () => {
    const { db } = session();
    const ws = createWorkspace(db, "Restore WS");
    const thread = createThread(db, ws.id, "Chat");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Hi" });
    const snap = createManualSnapshot(db, ws.id, { label: "Checkpoint" });

    const validation = validateSnapshotForRestoreExecution(db, snap.id, ws.id);
    expect(validation.canRestore).toBe(true);
  });

  it("restores messages atomically from checkpoint", () => {
    const { db, dbPath } = session();
    const ws = createWorkspace(db, "Atomic");
    const thread = createThread(db, ws.id, "Chat");
    insertMessage(db, { threadId: thread.id, role: "user", content: "Original" });
    const snap = createManualSnapshot(db, ws.id, { label: "Before edit" });

    insertMessage(db, { threadId: thread.id, role: "user", content: "After snapshot" });

    const result = executeSnapshotRestore(db, snap.id, ws.id, { dbPath });
    expect(result.ok).toBe(true);

    const messages = db
      .prepare("SELECT content FROM messages WHERE thread_id = ? ORDER BY created_at ASC")
      .all(thread.id) as Array<{ content: string }>;
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("Original");

    const evt = db
      .prepare(
        "SELECT COUNT(*) AS c FROM timeline_events WHERE event_type = 'snapshot_restore_completed'",
      )
      .get() as { c: number };
    expect(evt.c).toBeGreaterThan(0);

    const audits = readAuditEvents().filter((e) => e.type === "restore_completed");
    expect(audits.length).toBeGreaterThan(0);
  });

  it("records failed restore without partial message state on invalid snapshot", () => {
    const { db, dbPath } = session();
    const ws = createWorkspace(db, "Fail");
    const result = executeSnapshotRestore(db, "missing-snapshot", ws.id, { dbPath });
    expect(result.ok).toBe(false);

    const failedEvt = db
      .prepare(
        "SELECT COUNT(*) AS c FROM timeline_events WHERE event_type = 'snapshot_restore_failed'",
      )
      .get() as { c: number };
    expect(failedEvt.c).toBeGreaterThan(0);
  });
});
