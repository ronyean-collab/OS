import Database from "better-sqlite3";
import { describe, expect, it, afterEach } from "vitest";
import { openTestDatabase } from "../electron/main/database/test-db";
import { runMigrations } from "../electron/main/database/migrations";
import { createWorkspace } from "../electron/main/services/workspace-service";
import {
  archiveThread,
  archiveThreadAndRepair,
  listThreads,
  moveThreadDown,
  moveThreadUp,
  renameThreadWithTimeline,
  repairActiveThread,
  restoreDeletedThread,
  softDeleteThread,
  softDeleteThreadAndRepair,
  unarchiveThread,
} from "../electron/main/services/thread-management-service";
import { createThread, getActiveThreadId, setActiveThread } from "../electron/main/services/workspace-service";
import { insertMessage } from "../electron/main/services/message-service";
import { listTimelineEvents } from "../electron/main/services/timeline-service";
import { countOrphanedMessages } from "../electron/main/services/orphan-repair";

describe("thread management", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length) cleanups.pop()?.();
  });

  function session() {
    const s = openTestDatabase();
    cleanups.push(s.cleanup);
    return s;
  }

  it("rename persists and creates thread_renamed timeline event", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Rename WS");
    const thread = createThread(db, ws.id, "Old");
    const renamed = renameThreadWithTimeline(db, thread.id, "New title");
    expect(renamed.title).toBe("New title");
    const events = listTimelineEvents(db, ws.id);
    expect(events.some((e) => e.type === "thread_renamed")).toBe(true);
  });

  it("reorder persists after restart simulation", () => {
    const first = openTestDatabase();
    const ws = createWorkspace(first.db, "Reorder");
    const a = createThread(first.db, ws.id, "A");
    const b = createThread(first.db, ws.id, "B");
    const c = createThread(first.db, ws.id, "C");
    moveThreadUp(first.db, c.id);
    first.db.close();

    const reopened = new Database(first.dbPath);
    reopened.pragma("foreign_keys = ON");
    runMigrations(reopened, first.dbPath);

    const visible = listThreads(reopened, ws.id);
    expect(visible.map((t) => t.id)).toEqual([a.id, c.id, b.id]);

    reopened.close();
    first.cleanup();
  });

  it("move down swaps sort_order and logs thread_reordered", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Move");
    const a = createThread(db, ws.id, "A");
    const b = createThread(db, ws.id, "B");
    moveThreadDown(db, a.id);
    const ordered = listThreads(db, ws.id);
    expect(ordered[0].id).toBe(b.id);
    expect(ordered[1].id).toBe(a.id);
    expect(listTimelineEvents(db, ws.id).some((e) => e.type === "thread_reordered")).toBe(
      true,
    );
  });

  it("archive hides thread from default list", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Archive");
    const thread = createThread(db, ws.id, "To archive");
    archiveThread(db, thread.id);
    expect(listThreads(db, ws.id).some((t) => t.id === thread.id)).toBe(false);
    expect(
      listThreads(db, ws.id, { includeArchived: true }).some((t) => t.id === thread.id),
    ).toBe(true);
    expect(listTimelineEvents(db, ws.id).some((e) => e.type === "thread_archived")).toBe(
      true,
    );
  });

  it("unarchive restores thread to default list", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Unarchive");
    const thread = createThread(db, ws.id, "Hidden");
    archiveThread(db, thread.id);
    unarchiveThread(db, thread.id);
    expect(listThreads(db, ws.id).some((t) => t.id === thread.id)).toBe(true);
    expect(listTimelineEvents(db, ws.id).some((e) => e.type === "thread_unarchived")).toBe(
      true,
    );
  });

  it("soft delete hides thread but preserves messages", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Delete");
    const thread = createThread(db, ws.id, "Doomed");
    insertMessage(db, { threadId: thread.id, role: "user", content: "keep me" });
    softDeleteThread(db, thread.id);
    expect(listThreads(db, ws.id).some((t) => t.id === thread.id)).toBe(false);
    const count = db
      .prepare("SELECT COUNT(*) AS c FROM messages WHERE thread_id = ?")
      .get(thread.id) as { c: number };
    expect(count.c).toBe(1);
    expect(listTimelineEvents(db, ws.id).some((e) => e.type === "thread_deleted")).toBe(
      true,
    );
    expect(countOrphanedMessages(db)).toBe(0);
  });

  it("restore deleted thread", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Restore");
    const thread = createThread(db, ws.id, "Back");
    softDeleteThread(db, thread.id);
    restoreDeletedThread(db, thread.id);
    expect(listThreads(db, ws.id).some((t) => t.id === thread.id)).toBe(true);
    expect(listTimelineEvents(db, ws.id).some((e) => e.type === "thread_restored")).toBe(
      true,
    );
  });

  it("active thread repairs after archive", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Repair archive");
    const t1 = createThread(db, ws.id, "One");
    const t2 = createThread(db, ws.id, "Two");
    setActiveThread(db, t2.id);
    const { repair } = archiveThreadAndRepair(db, t2.id);
    expect(repair.activeThreadId).toBe(t1.id);
    expect(getActiveThreadId(db)).toBe(t1.id);
  });

  it("active thread repairs with new thread when last is deleted", () => {
    const db = session().db;
    const ws = createWorkspace(db, "Repair delete");
    const only = createThread(db, ws.id, "Only");
    setActiveThread(db, only.id);
    const { repair } = softDeleteThreadAndRepair(db, only.id);
    expect(repair.createdThread).toBe(true);
    expect(repair.thread).not.toBeNull();
    expect(getActiveThreadId(db)).toBe(repair.thread!.id);
    expect(listThreads(db, ws.id).length).toBe(1);
  });
});
