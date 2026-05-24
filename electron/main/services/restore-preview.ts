import type Database from "better-sqlite3";
import { SCHEMA_VERSION } from "../database/schema";
import {
  mapSnapshotFromRow,
  validateSnapshotMetadata,
  type SnapshotRecord,
} from "./snapshot-service";
import { parseCheckpointPayload } from "./snapshot-checkpoint";
import { validateCheckpointPayload } from "./checkpoint-validator";
import { validateSnapshotForRestoreExecution } from "./restore-service";
import { reconstructThreadMessages } from "./thread-reconstruction";
import {
  checkpointMessagesToReplayHashInput,
  computeDeterministicReplayHash,
  validateReplayHashMatch,
} from "./replay-hash";
import { appendAuditEvent } from "./reliability-audit";

export type RestorePreview = {
  canRestore: boolean;
  snapshotId: string;
  label: string;
  createdAt: string;
  appVersion: string | null;
  schemaVersion: number | null;
  affectedThreadCount: number;
  affectedMessageCount: number;
  messagesAddedEstimate: number;
  messagesRemovedEstimate: number;
  replayHashStatus: "verified" | "unknown" | "mismatch" | "not_available";
  warnings: string[];
  errors: string[];
  summaryMessage: string;
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

function messageFingerprint(m: {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}): string {
  return `${m.id}\t${m.role}\t${m.createdAt}\t${m.content}`;
}

export function buildRestorePreview(
  db: Database.Database,
  snapshotId: string,
  workspaceId: string,
): RestorePreview {
  const snapshot = loadSnapshot(db, snapshotId);
  const empty: RestorePreview = {
    canRestore: false,
    snapshotId,
    label: "Unknown",
    createdAt: "",
    appVersion: null,
    schemaVersion: null,
    affectedThreadCount: 0,
    affectedMessageCount: 0,
    messagesAddedEstimate: 0,
    messagesRemovedEstimate: 0,
    replayHashStatus: "not_available",
    warnings: [],
    errors: ["snapshot-not-found"],
    summaryMessage: "Snapshot not found.",
  };

  if (!snapshot) return empty;

  appendAuditEvent({
    type: "restore_preview_opened",
    workspaceId,
    snapshotId,
    message: `Restore preview for ${snapshot.label}`,
  });

  const validation = validateSnapshotForRestoreExecution(db, snapshotId, workspaceId);
  const meta = validateSnapshotMetadata(snapshot);
  const warnings = [...validation.warnings];
  const errors = [...validation.errors];
  if (!meta.valid) {
    errors.push(...meta.issues);
  }

  const checkpoint = parseCheckpointPayload(snapshot.payloadJson);
  if (!checkpoint) {
    return {
      ...empty,
      label: snapshot.label,
      createdAt: snapshot.createdAt,
      appVersion: snapshot.appVersion,
      schemaVersion: snapshot.schemaVersion,
      errors: ["missing-checkpoint"],
      summaryMessage: "This snapshot has no restorable checkpoint data.",
    };
  }

  const checkpointReport = validateCheckpointPayload(checkpoint, snapshot);
  warnings.push(...checkpointReport.warnings);
  errors.push(...checkpointReport.errors);

  const affectedThreads = checkpoint.threads;
  const checkpointMessages = checkpoint.messages.filter((m) =>
    affectedThreads.some((t) => t.id === m.threadId),
  );

  const currentFingerprints = new Set<string>();
  const checkpointFingerprints = new Set<string>();

  for (const m of checkpointMessages) {
    checkpointFingerprints.add(messageFingerprint(m));
  }

  for (const thread of affectedThreads) {
    const report = reconstructThreadMessages(db, thread.id);
    for (const m of report.messages) {
      currentFingerprints.add(messageFingerprint(m));
    }
  }

  let added = 0;
  let removed = 0;
  for (const fp of checkpointFingerprints) {
    if (!currentFingerprints.has(fp)) added++;
  }
  for (const fp of currentFingerprints) {
    if (!checkpointFingerprints.has(fp)) removed++;
  }

  const checkpointHash = computeDeterministicReplayHash(
    checkpointMessagesToReplayHashInput(checkpointMessages),
  );
  const hashCheck = validateReplayHashMatch(snapshot.replayHash, checkpointHash);
  let replayHashStatus: RestorePreview["replayHashStatus"] = "not_available";
  if (snapshot.replayHash) {
    replayHashStatus = hashCheck.matches ? "verified" : "mismatch";
    if (!hashCheck.matches) {
      warnings.push("replay-hash-mismatch");
    }
  } else {
    replayHashStatus = "unknown";
  }

  if (
    snapshot.schemaVersion != null &&
    snapshot.schemaVersion > SCHEMA_VERSION
  ) {
    errors.push("schema-ahead");
  }

  const canRestore = validation.canRestore && errors.length === 0;
  let summaryMessage = canRestore
    ? "Ready to restore. A recovery copy will be saved before any changes."
    : "Restore is blocked until validation issues are resolved.";

  if (added > 0 || removed > 0) {
    summaryMessage += ` Estimated ${added} message(s) restored, ${removed} replaced.`;
  }

  return {
    canRestore,
    snapshotId,
    label: snapshot.label,
    createdAt: snapshot.createdAt,
    appVersion: snapshot.appVersion,
    schemaVersion: snapshot.schemaVersion,
    affectedThreadCount: affectedThreads.length,
    affectedMessageCount: checkpointMessages.length,
    messagesAddedEstimate: added,
    messagesRemovedEstimate: removed,
    replayHashStatus,
    warnings,
    errors,
    summaryMessage,
  };
}

export function auditRestoreConfirmed(
  workspaceId: string,
  snapshotId: string,
): void {
  appendAuditEvent({
    type: "restore_confirmed",
    workspaceId,
    snapshotId,
    message: "User confirmed snapshot restore",
  });
}
