import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import type { Thread, ThreadListOptions } from "../../../src/shared/types";
import { runInTransaction } from "../database/transactions";
import { appendTimelineEvent, enqueueSyncPlaceholder } from "./continuity-service";
import { recordSuccessfulPersistence } from "./reliability-metrics";
const META_ACTIVE_THREAD = "active_thread_id";

function getActiveThreadId(db: Database.Database): string | null {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(META_ACTIVE_THREAD) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setActiveThreadId(db: Database.Database, threadId: string): void {
  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run(
    META_ACTIVE_THREAD,
    threadId,
  );
}

export function mapThreadRow(row: Record<string, unknown>): Thread {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    title: String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    sortOrder: row.sort_order != null ? Number(row.sort_order) : null,
    archivedAt: row.archived_at != null ? String(row.archived_at) : null,
    deletedAt: row.deleted_at != null ? String(row.deleted_at) : null,
  };
}

function threadListWhere(options: ThreadListOptions): string {
  const clauses = ["workspace_id = ?"];
  if (!options.includeDeleted) {
    clauses.push("deleted_at IS NULL");
  }
  if (!options.includeArchived) {
    clauses.push("archived_at IS NULL");
  }
  return clauses.join(" AND ");
}

export function listThreads(
  db: Database.Database,
  workspaceId: string,
  options: ThreadListOptions = {},
): Thread[] {
  const where = threadListWhere(options);
  const rows = db
    .prepare(
      `SELECT * FROM threads WHERE ${where}
       ORDER BY sort_order IS NULL, sort_order ASC, updated_at DESC`,
    )
    .all(workspaceId) as Record<string, unknown>[];
  return rows.map(mapThreadRow);
}

function getThreadRow(
  db: Database.Database,
  threadId: string,
): Record<string, unknown> | undefined {
  return db.prepare("SELECT * FROM threads WHERE id = ?").get(threadId) as
    | Record<string, unknown>
    | undefined;
}

function requireThread(db: Database.Database, threadId: string): Thread {
  const row = getThreadRow(db, threadId);
  if (!row) throw new Error("Thread not found.");
  return mapThreadRow(row);
}

function nextSortOrder(db: Database.Database, workspaceId: string): number {
  const row = db
    .prepare(
      `SELECT MAX(sort_order) AS max_order FROM threads
       WHERE workspace_id = ? AND deleted_at IS NULL`,
    )
    .get(workspaceId) as { max_order: number | null } | undefined;
  return (row?.max_order ?? -1) + 1;
}

export function assignSortOrderOnCreate(
  db: Database.Database,
  workspaceId: string,
): number {
  return nextSortOrder(db, workspaceId);
}

export function renameThreadWithTimeline(
  db: Database.Database,
  threadId: string,
  title: string,
): Thread {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Thread title cannot be empty.");
  if (trimmed.length > 200) {
    throw new Error("Thread title must be 200 characters or fewer.");
  }

  return runInTransaction(db, () => {
    const existing = requireThread(db, threadId);
    if (existing.deletedAt) throw new Error("Cannot rename a deleted thread.");

    const now = new Date().toISOString();
    db.prepare("UPDATE threads SET title = ?, updated_at = ? WHERE id = ?").run(
      trimmed,
      now,
      threadId,
    );

    appendTimelineEvent(db, {
      workspaceId: existing.workspaceId,
      threadId,
      type: "thread_renamed",
      title: "Thread renamed",
      description: `Renamed to “${trimmed}”.`,
      source: "user",
    });

    recordSuccessfulPersistence(db);
    return requireThread(db, threadId);
  });
}

function listOrderedVisibleThreads(
  db: Database.Database,
  workspaceId: string,
): Thread[] {
  return listThreads(db, workspaceId, {
    includeArchived: false,
    includeDeleted: false,
  });
}

function swapSortOrder(
  db: Database.Database,
  a: Thread,
  b: Thread,
  workspaceId: string,
): void {
  const orderA = a.sortOrder ?? 0;
  const orderB = b.sortOrder ?? 0;
  db.prepare("UPDATE threads SET sort_order = ?, updated_at = ? WHERE id = ?").run(
    orderB,
    new Date().toISOString(),
    a.id,
  );
  db.prepare("UPDATE threads SET sort_order = ?, updated_at = ? WHERE id = ?").run(
    orderA,
    new Date().toISOString(),
    b.id,
  );

  appendTimelineEvent(db, {
    workspaceId,
    threadId: a.id,
    type: "thread_reordered",
    title: "Thread reordered",
    description: `Moved “${a.title}”.`,
    source: "user",
  });
}

export function moveThreadUp(
  db: Database.Database,
  threadId: string,
): Thread {
  return runInTransaction(db, () => {
    const thread = requireThread(db, threadId);
    if (thread.deletedAt || thread.archivedAt) {
      throw new Error("Cannot reorder a hidden thread.");
    }
    const visible = listOrderedVisibleThreads(db, thread.workspaceId);
    const idx = visible.findIndex((t) => t.id === threadId);
    if (idx <= 0) return thread;
    swapSortOrder(db, visible[idx], visible[idx - 1], thread.workspaceId);
    recordSuccessfulPersistence(db);
    return requireThread(db, threadId);
  });
}

export function moveThreadDown(
  db: Database.Database,
  threadId: string,
): Thread {
  return runInTransaction(db, () => {
    const thread = requireThread(db, threadId);
    if (thread.deletedAt || thread.archivedAt) {
      throw new Error("Cannot reorder a hidden thread.");
    }
    const visible = listOrderedVisibleThreads(db, thread.workspaceId);
    const idx = visible.findIndex((t) => t.id === threadId);
    if (idx < 0 || idx >= visible.length - 1) return thread;
    swapSortOrder(db, visible[idx], visible[idx + 1], thread.workspaceId);
    recordSuccessfulPersistence(db);
    return requireThread(db, threadId);
  });
}

export function archiveThread(
  db: Database.Database,
  threadId: string,
): Thread {
  return runInTransaction(db, () => {
    const thread = requireThread(db, threadId);
    if (thread.deletedAt) throw new Error("Cannot archive a deleted thread.");
    if (thread.archivedAt) return thread;

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE threads SET archived_at = ?, updated_at = ? WHERE id = ?",
    ).run(now, now, threadId);

    appendTimelineEvent(db, {
      workspaceId: thread.workspaceId,
      threadId,
      type: "thread_archived",
      title: "Thread archived",
      description: `Archived “${thread.title}”.`,
      source: "user",
    });

    recordSuccessfulPersistence(db);
    return requireThread(db, threadId);
  });
}

export function unarchiveThread(
  db: Database.Database,
  threadId: string,
): Thread {
  return runInTransaction(db, () => {
    const thread = requireThread(db, threadId);
    if (thread.deletedAt) throw new Error("Cannot unarchive a deleted thread.");
    if (!thread.archivedAt) return thread;

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE threads SET archived_at = NULL, updated_at = ? WHERE id = ?",
    ).run(now, threadId);

    appendTimelineEvent(db, {
      workspaceId: thread.workspaceId,
      threadId,
      type: "thread_unarchived",
      title: "Thread restored",
      description: `Unarchived “${thread.title}”.`,
      source: "user",
    });

    recordSuccessfulPersistence(db);
    return requireThread(db, threadId);
  });
}

export function softDeleteThread(
  db: Database.Database,
  threadId: string,
): Thread {
  return runInTransaction(db, () => {
    const thread = requireThread(db, threadId);
    if (thread.deletedAt) return thread;

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE threads SET deleted_at = ?, archived_at = NULL, updated_at = ? WHERE id = ?",
    ).run(now, now, threadId);

    appendTimelineEvent(db, {
      workspaceId: thread.workspaceId,
      threadId,
      type: "thread_deleted",
      title: "Thread deleted",
      description: `Soft-deleted “${thread.title}”. Messages preserved.`,
      source: "user",
    });

    recordSuccessfulPersistence(db);
    return requireThread(db, threadId);
  });
}

export function restoreDeletedThread(
  db: Database.Database,
  threadId: string,
): Thread {
  return runInTransaction(db, () => {
    const thread = requireThread(db, threadId);
    if (!thread.deletedAt) return thread;

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE threads SET deleted_at = NULL, updated_at = ? WHERE id = ?",
    ).run(now, threadId);

    appendTimelineEvent(db, {
      workspaceId: thread.workspaceId,
      threadId,
      type: "thread_restored",
      title: "Thread restored",
      description: `Restored “${thread.title}”.`,
      source: "user",
    });

    recordSuccessfulPersistence(db);
    return requireThread(db, threadId);
  });
}

export function createThreadInWorkspace(
  db: Database.Database,
  workspaceId: string,
  title: string,
): Thread {
  const id = uuid();
  const now = new Date().toISOString();
  const sortOrder = nextSortOrder(db, workspaceId);

  return runInTransaction(db, () => {
    db.prepare(
      `INSERT INTO threads (id, workspace_id, title, created_at, updated_at, sort_order, archived_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
    ).run(id, workspaceId, title.trim() || "New thread", now, now, sortOrder);

    appendTimelineEvent(db, {
      workspaceId,
      threadId: id,
      type: "thread_created",
      title: "Thread created",
      description: title,
    });

    enqueueSyncPlaceholder(db, workspaceId, "thread", id, "upsert", { id, title });

    setActiveThreadId(db, id);
    recordSuccessfulPersistence(db);
    return requireThread(db, id);
  });
}

export function repairActiveThread(
  db: Database.Database,
  workspaceId: string,
): { thread: Thread | null; activeThreadId: string | null; createdThread: boolean } {
  return runInTransaction(db, () => {
    const visible = listOrderedVisibleThreads(db, workspaceId);
    const activeId = getActiveThreadId(db);

    if (activeId) {
      const active = visible.find((t) => t.id === activeId);
      if (active) {
        return { thread: active, activeThreadId: active.id, createdThread: false };
      }
    }

    if (visible.length > 0) {
      const next = visible[0];
      setActiveThreadId(db, next.id);
      return { thread: next, activeThreadId: next.id, createdThread: false };
    }

    const created = createThreadInWorkspace(db, workspaceId, "New thread");
    return {
      thread: created,
      activeThreadId: created.id,
      createdThread: true,
    };
  });
}

export function archiveThreadAndRepair(
  db: Database.Database,
  threadId: string,
): { thread: Thread; repair: ReturnType<typeof repairActiveThread> } {
  const thread = archiveThread(db, threadId);
  const repair = repairActiveThread(db, thread.workspaceId);
  return { thread, repair };
}

export function softDeleteThreadAndRepair(
  db: Database.Database,
  threadId: string,
): { thread: Thread; repair: ReturnType<typeof repairActiveThread> } {
  const thread = softDeleteThread(db, threadId);
  const repair = repairActiveThread(db, thread.workspaceId);
  return { thread, repair };
}
