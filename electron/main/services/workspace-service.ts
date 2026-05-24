import { v4 as uuid } from "uuid";

import type Database from "better-sqlite3";

import type { Thread, ThreadListOptions, Workspace } from "../../../src/shared/types";

import { runInTransaction } from "../database/transactions";

import { appendTimelineEvent, enqueueSyncPlaceholder } from "./continuity-service";

import { recordSuccessfulPersistence } from "./reliability-metrics";

import { MAX_CONTINUITY_SUMMARY_CHARS } from "./context-assembly";

import {

  createThreadInWorkspace,

  listThreads as listThreadsManaged,

  mapThreadRow,

  renameThreadWithTimeline,

} from "./thread-management-service";



const META_ACTIVE_WORKSPACE = "active_workspace_id";

const META_ACTIVE_THREAD = "active_thread_id";



function mapWorkspace(row: Record<string, unknown>): Workspace {

  return {

    id: String(row.id),

    name: String(row.name),

    createdAt: String(row.created_at),

    updatedAt: String(row.updated_at),

    lastOpenedAt: String(row.last_opened_at),

    continuitySummary:
      row.continuity_summary != null && String(row.continuity_summary).length > 0
        ? String(row.continuity_summary)
        : null,

  };

}



export function getMeta(db: Database.Database, key: string): string | null {

  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as

    | { value: string }

    | undefined;

  return row?.value ?? null;

}



export function setMeta(db: Database.Database, key: string, value: string): void {

  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run(

    key,

    value,

  );

}



export function listWorkspaces(db: Database.Database): Workspace[] {

  const rows = db

    .prepare("SELECT * FROM workspaces ORDER BY last_opened_at DESC")

    .all() as Record<string, unknown>[];

  return rows.map(mapWorkspace);

}



export function getWorkspaceById(
  db: Database.Database,
  workspaceId: string,
): Workspace | null {
  const row = db
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .get(workspaceId) as Record<string, unknown> | undefined;
  return row ? mapWorkspace(row) : null;
}



export function normalizeContinuitySummary(raw: string): string {
  return raw.trim().slice(0, MAX_CONTINUITY_SUMMARY_CHARS);
}



export function updateContinuitySummary(
  db: Database.Database,
  workspaceId: string,
  summary: string,
): Workspace {
  const normalized = normalizeContinuitySummary(summary);
  const now = new Date().toISOString();

  return runInTransaction(db, () => {
    const existing = db
      .prepare("SELECT id FROM workspaces WHERE id = ?")
      .get(workspaceId) as { id: string } | undefined;
    if (!existing) {
      throw new Error("Workspace not found.");
    }

    db.prepare(
      "UPDATE workspaces SET continuity_summary = ?, updated_at = ? WHERE id = ?",
    ).run(normalized.length > 0 ? normalized : null, now, workspaceId);

    appendTimelineEvent(db, {
      workspaceId,
      type: "continuity_summary_updated",
      title: "Continuity summary updated",
      description:
        normalized.length > 0
          ? `Saved ${normalized.length} characters of project context.`
          : "Cleared continuity summary.",
      source: "user",
    });

    recordSuccessfulPersistence(db);

    return mapWorkspace(
      db.prepare("SELECT * FROM workspaces WHERE id = ?").get(workspaceId) as Record<
        string,
        unknown
      >,
    );
  });
}



export function createWorkspace(db: Database.Database, name: string): Workspace {

  const id = uuid();

  const now = new Date().toISOString();



  return runInTransaction(db, () => {

    db.prepare(

      `INSERT INTO workspaces (id, user_id, name, created_at, updated_at, last_opened_at)

       VALUES (?, NULL, ?, ?, ?, ?)`,

    ).run(id, name.trim() || "Untitled workspace", now, now, now);



    appendTimelineEvent(db, {

      workspaceId: id,

      type: "workspace_created",

      title: "Workspace created",

      description: `Created workspace “${name}”.`,

    });



    enqueueSyncPlaceholder(db, id, "workspace", id, "upsert", { id, name });



    setMeta(db, META_ACTIVE_WORKSPACE, id);

    recordSuccessfulPersistence(db);

    return mapWorkspace(

      db.prepare("SELECT * FROM workspaces WHERE id = ?").get(id) as Record<

        string,

        unknown

      >,

    );

  });

}



export function getActiveWorkspaceId(db: Database.Database): string | null {

  return getMeta(db, META_ACTIVE_WORKSPACE);

}



export function setActiveWorkspace(db: Database.Database, workspaceId: string): void {

  const now = new Date().toISOString();

  db.prepare(

    "UPDATE workspaces SET last_opened_at = ?, updated_at = ? WHERE id = ?",

  ).run(now, now, workspaceId);

  setMeta(db, META_ACTIVE_WORKSPACE, workspaceId);

}



export function listThreads(

  db: Database.Database,

  workspaceId: string,

  options?: ThreadListOptions,

): Thread[] {

  return listThreadsManaged(db, workspaceId, options);

}



export function createThread(

  db: Database.Database,

  workspaceId: string,

  title: string,

): Thread {

  return createThreadInWorkspace(db, workspaceId, title);

}



export function renameThread(

  db: Database.Database,

  threadId: string,

  title: string,

): Thread {

  return renameThreadWithTimeline(db, threadId, title);

}



export function getActiveThreadId(db: Database.Database): string | null {

  return getMeta(db, META_ACTIVE_THREAD);

}



export function setActiveThread(db: Database.Database, threadId: string): void {

  runInTransaction(db, () => {

    setMeta(db, META_ACTIVE_THREAD, threadId);

    recordSuccessfulPersistence(db);

  });

}



export { mapThreadRow };


