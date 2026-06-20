import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../electron/main/database/migrations";
import { createWorkspace } from "../electron/main/services/workspace-service";
import { createThreadInWorkspace } from "../electron/main/services/thread-management-service";
import { insertMessage } from "../electron/main/services/message-service";
import { resetWorkspaceExperience } from "../electron/main/services/first-time-experience-reset-service";
import { createManualSnapshot } from "../electron/main/services/snapshot-service";

describe("first-time experience reset service", () => {
  let db: Database.Database;
  let workspaceId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    const ws = createWorkspace(db, "Test Workspace");
    workspaceId = ws.id;
    const thread = createThreadInWorkspace(db, workspaceId, "Old thread");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "hello",
    });
    createManualSnapshot(db, workspaceId, {
      threadId: thread.id,
      label: "keep-me",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("removes conversations and memory but preserves snapshots", () => {
    const snapshotsBeforeReset = db
      .prepare("SELECT COUNT(*) AS c FROM snapshots WHERE workspace_id = ?")
      .get(workspaceId) as { c: number };

    const expectedSnapshotsPreserved = Number(snapshotsBeforeReset.c);
    const result = resetWorkspaceExperience(db, workspaceId);
    expect(result.ok).toBe(true);
    expect(result.messagesRemoved).toBeGreaterThan(0);
    expect(result.snapshotsPreserved).toBe(expectedSnapshotsPreserved);

    const msgCount = db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages
         WHERE thread_id IN (SELECT id FROM threads WHERE workspace_id = ?)`,
      )
      .get(workspaceId) as { c: number };
    expect(Number(msgCount.c)).toBe(0);

    const snapCount = db
      .prepare("SELECT COUNT(*) AS c FROM snapshots WHERE workspace_id = ?")
      .get(workspaceId) as { c: number };
    expect(Number(snapCount.c)).toBe(expectedSnapshotsPreserved);

    const threadCount = db
      .prepare("SELECT COUNT(*) AS c FROM threads WHERE workspace_id = ? AND deleted_at IS NULL")
      .get(workspaceId) as { c: number };
    expect(Number(threadCount.c)).toBe(1);
  });
});
