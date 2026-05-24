import Database from "better-sqlite3";
import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { runMigrations } from "../electron/main/database/migrations";
import {
  createThread,
  createWorkspace,
  getActiveThreadId,
  listThreads,
  renameThread,
  setActiveThread,
} from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import {
  createManualSnapshot,
  listSnapshots,
  validateSnapshotForRestore,
  validateSnapshotMetadata,
} from "../electron/main/services/snapshot-service";
import {
  groupTimelineEvents,
  listTimelineEvents,
} from "../electron/main/services/timeline-service";

describe("thread sidebar runtime", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s;
  }

  it("lists threads by sort_order then updated_at", async () => {
    const db = session().db;
    const ws = createWorkspace(db, "Sidebar WS");
    const older = createThread(db, ws.id, "Older");
    const newer = createThread(db, ws.id, "Newer");

    db.prepare("UPDATE threads SET sort_order = 1, updated_at = ? WHERE id = ?").run(
      "2025-01-01T00:00:00.000Z",
      older.id,
    );
    db.prepare("UPDATE threads SET sort_order = 0, updated_at = ? WHERE id = ?").run(
      "2020-01-01T00:00:00.000Z",
      newer.id,
    );

    const threads = listThreads(db, ws.id);
    expect(threads[0].id).toBe(newer.id);
    expect(threads[1].id).toBe(older.id);
  });

  it("persists and restores active thread across reopen", () => {
    const first = openTestDatabase();
    const ws = createWorkspace(first.db, "Restart");
    const t1 = createThread(first.db, ws.id, "One");
    const t2 = createThread(first.db, ws.id, "Two");
    setActiveThread(first.db, t2.id);
    first.db.close();

    const reopened = new Database(first.dbPath);
    reopened.pragma("foreign_keys = ON");
    runMigrations(reopened, first.dbPath);

    expect(getActiveThreadId(reopened)).toBe(t2.id);
    expect(getActiveThreadId(reopened)).not.toBe(t1.id);

    reopened.close();
    first.cleanup();
  });

  it("renames thread and updates title", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Rename");
    const thread = createThread(db, ws.id, "Old name");
    const renamed = renameThread(db, thread.id, "New name");
    expect(renamed.title).toBe("New name");
    const listed = listThreads(db, ws.id).find((t) => t.id === thread.id);
    expect(listed?.title).toBe("New name");
    const events = listTimelineEvents(db, ws.id);
    expect(events.some((e) => e.type === "thread_renamed")).toBe(true);
  });

  it("creates manual snapshot with metadata integrity", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Snap WS");
    const thread = createThread(db, ws.id, "Chat");
    insertMessage(db, {
      threadId: thread.id,
      role: "user",
      content: "Hi",
    });

    const snap = createManualSnapshot(db, ws.id, {
      label: "Before changes",
      threadId: thread.id,
    });
    const meta = validateSnapshotMetadata(snap);
    expect(meta.valid).toBe(true);
    expect(snap.reason).toBe("manual");
    expect(snap.isAuto).toBe(false);

    const listed = listSnapshots(db, ws.id);
    expect(listed[0].id).toBe(snap.id);
  });

  it("validate restore placeholder without applying restore", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Restore");
    const snap = createManualSnapshot(db, ws.id, { label: "Checkpoint" });
    const result = validateSnapshotForRestore(db, snap.id, ws.id);
    expect(result.canRestore).toBe(true);
    expect(result.message).toContain("future release");
  });

  it("groups timeline newest first with human-readable views", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Timeline UI");
    createThread(db, ws.id, "T1");
    const events = listTimelineEvents(db, ws.id);
    expect(events[0].createdAt >= events[events.length - 1].createdAt).toBe(true);

    const groups = groupTimelineEvents(events);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0].events[0].humanLabel).toBeTruthy();
    expect(groups[0].events[0].relativeTime).toBeTruthy();
  });
});
