import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import type { TimelineEventType } from "../../../src/shared/types";
import { getVersionStamp } from "../../../src/shared/app-version";
import { runInTransaction } from "../database/transactions";
import { recordSuccessfulPersistence } from "./reliability-metrics";
import {
  appendTimelineEventValidated,
  type TimelineEventSource,
} from "./timeline-events";
import {
  captureWorkspaceCheckpoint,
  serializeCheckpointPayload,
} from "./snapshot-checkpoint";

export function appendTimelineEvent(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId?: string | null;
    type: TimelineEventType;
    title: string;
    description: string;
    source?: TimelineEventSource;
  },
): void {
  appendTimelineEventValidated(db, {
    ...input,
    source: input.source ?? "system",
  });
}

export function createAutoSnapshotPlaceholder(
  db: Database.Database,
  workspaceId: string,
  threadId: string | null,
  reason: string,
): void {
  runInTransaction(db, () => {
    const id = uuid();
    const now = new Date().toISOString();
    const version = getVersionStamp();
    db.prepare(
      `INSERT INTO snapshots (id, workspace_id, thread_id, label, payload_json, created_at, snapshot_reason, app_version, schema_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      workspaceId,
      threadId,
      `Auto snapshot — ${reason}`,
      serializeCheckpointPayload(
        captureWorkspaceCheckpoint(db, workspaceId, threadId),
      ),
      now,
      reason,
      version.appVersion,
      version.schemaVersion,
    );

    appendTimelineEvent(db, {
      workspaceId,
      threadId,
      type: "snapshot_created",
      title: "Snapshot placeholder",
      description: reason,
    });
    recordSuccessfulPersistence(db);
  });
}

export function enqueueSyncPlaceholder(
  db: Database.Database,
  workspaceId: string,
  entityType: string,
  entityId: string,
  operation: string,
  payload: Record<string, unknown>,
): void {
  runInTransaction(db, () => {
    db.prepare(
      `INSERT INTO sync_queue (id, workspace_id, entity_type, entity_id, operation, payload_json, created_at, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    ).run(
      uuid(),
      workspaceId,
      entityType,
      entityId,
      operation,
      JSON.stringify(payload),
      new Date().toISOString(),
    );

    db.prepare(
      `INSERT INTO sync_status (workspace_id, last_sync_at, status, error_message)
       VALUES (?, NULL, 'local_only', NULL)
       ON CONFLICT(workspace_id) DO UPDATE SET status = 'local_only'`,
    ).run(workspaceId);
  });
}
