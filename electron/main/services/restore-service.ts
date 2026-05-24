import type Database from "better-sqlite3";
import { SCHEMA_VERSION } from "../database/schema";
import { getDbPath } from "../database/connection";
import { createRecoverySnapshot } from "../database/recovery-snapshot";
import { runInTransaction } from "../database/transactions";
import {
  mapSnapshotFromRow,
  validateSnapshotMetadata,
  type SnapshotRecord,
} from "./snapshot-service";
import {
  parseCheckpointPayload,
  serializeCheckpointPayload,
  type SnapshotCheckpointPayload,
} from "./snapshot-checkpoint";
import { validateCheckpointPayload } from "./checkpoint-validator";
import { appendTimelineEvent } from "./continuity-service";
import { assertMessageThreadContext } from "./message-service";
import { recordSuccessfulPersistence } from "./reliability-metrics";
import { appendAuditEvent } from "./reliability-audit";
import { computeReplayHashPlaceholder } from "./replay-hash";
import { auditRestoreReplay, validateReplaySequence } from "./replay-sequence";
import { auditRestoreConfirmed } from "./restore-preview";

export type RestoreValidationResult = {
  canRestore: boolean;
  message: string;
  errors: string[];
  warnings: string[];
};

export type RestoreExecutionResult = {
  ok: boolean;
  message: string;
  snapshotId: string;
  preRecoverySnapshotPath: string | null;
  replayHashPlaceholder?: string;
};

function loadSnapshot(
  db: Database.Database,
  snapshotId: string,
): SnapshotRecord | null {
  const row = db
    .prepare("SELECT * FROM snapshots WHERE id = ?")
    .get(snapshotId) as Record<string, unknown> | undefined;
  return row ? mapSnapshotFromRow(row) : null;
}

export function validateSnapshotForRestoreExecution(
  db: Database.Database,
  snapshotId: string,
  workspaceId: string,
): RestoreValidationResult {
  const snapshot = loadSnapshot(db, snapshotId);
  if (!snapshot) {
    return {
      canRestore: false,
      message: "Snapshot not found.",
      errors: ["snapshot-not-found"],
      warnings: [],
    };
  }

  if (snapshot.workspaceId !== workspaceId) {
    return {
      canRestore: false,
      message: "Snapshot does not belong to this workspace.",
      errors: ["workspace-ownership-mismatch"],
      warnings: [],
    };
  }

  const meta = validateSnapshotMetadata(snapshot);
  if (!meta.valid) {
    return {
      canRestore: false,
      message: "Snapshot metadata is incomplete.",
      errors: meta.issues,
      warnings: [],
    };
  }

  if (
    snapshot.schemaVersion != null &&
    snapshot.schemaVersion > SCHEMA_VERSION
  ) {
    return {
      canRestore: false,
      message: "Snapshot requires a newer app version.",
      errors: ["schema-ahead"],
      warnings: [],
    };
  }

  const checkpoint = parseCheckpointPayload(snapshot.payloadJson);
  if (!checkpoint) {
    return {
      canRestore: false,
      message:
        "This snapshot has no restorable checkpoint data (older placeholder snapshot).",
      errors: ["missing-checkpoint"],
      warnings: [],
    };
  }

  const report = validateCheckpointPayload(checkpoint, snapshot);
  return {
    canRestore: report.valid,
    message: report.valid
      ? "Snapshot is ready to restore."
      : "Snapshot failed validation. Restore blocked.",
    errors: report.errors,
    warnings: report.warnings,
  };
}

function applyCheckpointRestore(
  db: Database.Database,
  checkpoint: SnapshotCheckpointPayload,
): void {
  for (const thread of checkpoint.threads) {
    const exists = db
      .prepare("SELECT id FROM threads WHERE id = ? AND workspace_id = ?")
      .get(thread.id, checkpoint.workspaceId) as { id: string } | undefined;
    if (!exists) {
      throw new Error(`Thread ${thread.id} missing — restore aborted.`);
    }

    db.prepare("DELETE FROM messages WHERE thread_id = ?").run(thread.id);

    db.prepare(
      "UPDATE threads SET title = ?, updated_at = ? WHERE id = ?",
    ).run(thread.title, thread.updatedAt, thread.id);
  }

  const threadMessages = checkpoint.messages.filter((m) =>
    checkpoint.threads.some((t) => t.id === m.threadId),
  );

  for (const m of threadMessages) {
    assertMessageThreadContext(db, m.threadId, checkpoint.workspaceId);
    db.prepare(
      `INSERT INTO messages (id, thread_id, role, content, provider, model, raw_provider_payload, created_at, message_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      m.id,
      m.threadId,
      m.role,
      m.content,
      m.provider,
      m.model,
      m.rawProviderPayload,
      m.createdAt,
      m.messageStatus,
    );
  }
}

function updateSnapshotRestoreHistory(
  db: Database.Database,
  snapshotId: string,
  entry: {
    restoredAt: string;
    status: "completed" | "failed";
    preRecoverySnapshotPath: string | null;
  },
): void {
  const row = db
    .prepare("SELECT payload_json FROM snapshots WHERE id = ?")
    .get(snapshotId) as { payload_json: string } | undefined;
  if (!row) return;

  const checkpoint = parseCheckpointPayload(row.payload_json);
  if (!checkpoint) return;

  const history = checkpoint.restoreHistory ?? [];
  history.push(entry);
  checkpoint.restoreHistory = history;

  db.prepare("UPDATE snapshots SET payload_json = ? WHERE id = ?").run(
    serializeCheckpointPayload(checkpoint),
    snapshotId,
  );
}

export function executeSnapshotRestore(
  db: Database.Database,
  snapshotId: string,
  workspaceId: string,
  options?: { dbPath?: string },
): RestoreExecutionResult {
  const validation = validateSnapshotForRestoreExecution(
    db,
    snapshotId,
    workspaceId,
  );
  if (!validation.canRestore) {
    appendAuditEvent({
      type: "restore_failed",
      workspaceId,
      snapshotId,
      message: validation.message,
      details: { errors: validation.errors, phase: "pre-validate" },
    });
    appendTimelineEvent(db, {
      workspaceId,
      type: "snapshot_restore_failed",
      title: "Restore could not start",
      description: validation.message,
      source: "recovery",
    });
    return {
      ok: false,
      message: validation.message,
      snapshotId,
      preRecoverySnapshotPath: null,
    };
  }

  auditRestoreConfirmed(workspaceId, snapshotId);

  const snapshot = loadSnapshot(db, snapshotId)!;
  const checkpoint = parseCheckpointPayload(snapshot.payloadJson)!;

  const dbPath = options?.dbPath ?? getDbPath();
  const preRecovery = createRecoverySnapshot(dbPath, "pre-snapshot-restore");
  const prePath = preRecovery?.filePath ?? null;

  appendAuditEvent({
    type: "restore_attempt",
    workspaceId,
    snapshotId,
    message: `Restore started for snapshot ${snapshot.label}`,
    details: { preRecoverySnapshotPath: prePath },
  });

  appendTimelineEvent(db, {
    workspaceId,
    threadId: snapshot.threadId,
    type: "snapshot_restore_started",
    title: "Restore started",
    description: `Restoring from “${snapshot.label}”. A recovery copy was saved first.`,
    source: "recovery",
  });

  const hashBefore = computeReplayHashPlaceholder([
    workspaceId,
    "pre-restore",
    snapshotId,
  ]);

  try {
    runInTransaction(db, () => {
      applyCheckpointRestore(db, checkpoint);
      updateSnapshotRestoreHistory(db, snapshotId, {
        restoredAt: new Date().toISOString(),
        status: "completed",
        preRecoverySnapshotPath: prePath,
      });
      recordSuccessfulPersistence(db);
    });

    const sequence = validateReplaySequence(db, workspaceId);
    auditRestoreReplay(workspaceId, snapshotId, sequence.replayHashPlaceholder);

    appendTimelineEvent(db, {
      workspaceId,
      threadId: snapshot.threadId,
      type: "snapshot_restore_completed",
      title: "Restore completed",
      description: `Restored from “${snapshot.label}”.`,
      source: "recovery",
    });

    appendAuditEvent({
      type: "restore_completed",
      workspaceId,
      snapshotId,
      message: "Snapshot restore completed",
      details: {
        preRecoverySnapshotPath: prePath,
        replayHashPlaceholder: sequence.replayHashPlaceholder,
        hashBefore,
      },
    });

    return {
      ok: true,
      message: "Continuity restored from snapshot.",
      snapshotId,
      preRecoverySnapshotPath: prePath,
      replayHashPlaceholder: sequence.replayHashPlaceholder,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Restore failed";

    try {
      updateSnapshotRestoreHistory(db, snapshotId, {
        restoredAt: new Date().toISOString(),
        status: "failed",
        preRecoverySnapshotPath: prePath,
      });
    } catch {
      /* ignore */
    }

    appendTimelineEvent(db, {
      workspaceId,
      type: "snapshot_restore_failed",
      title: "Restore failed",
      description: msg,
      source: "recovery",
    });

    appendAuditEvent({
      type: "restore_failed",
      workspaceId,
      snapshotId,
      message: msg,
      details: { preRecoverySnapshotPath: prePath },
    });

    return {
      ok: false,
      message: `${msg} Your previous state was preserved in a recovery snapshot.`,
      snapshotId,
      preRecoverySnapshotPath: prePath,
    };
  }
}
