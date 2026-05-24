import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import { getVersionStamp, SCHEMA_VERSION } from "../../../src/shared/app-version";
import { runInTransaction } from "../database/transactions";
import { appendTimelineEvent } from "./continuity-service";
import { recordSuccessfulPersistence } from "./reliability-metrics";
import {
  captureWorkspaceCheckpoint,
  parseCheckpointPayload,
  serializeCheckpointPayload,
} from "./snapshot-checkpoint";
import {
  checkpointMessagesToReplayHashInput,
  computeDeterministicReplayHash,
} from "./replay-hash";

export type SnapshotRecord = {
  id: string;
  workspaceId: string;
  threadId: string | null;
  label: string;
  reason: string | null;
  appVersion: string | null;
  schemaVersion: number | null;
  isAuto: boolean;
  replayHash: string | null;
  createdAt: string;
  payloadJson: string;
};

export type SnapshotMetadataValidation = {
  valid: boolean;
  issues: string[];
};

export type SnapshotRestorePlaceholder = {
  canRestore: boolean;
  message: string;
  snapshotId: string;
};

export function mapSnapshotFromRow(row: Record<string, unknown>): SnapshotRecord {
  const label = String(row.label ?? "");
  const reason = row.snapshot_reason != null ? String(row.snapshot_reason) : null;
  const reasonLower = (reason ?? "").toLowerCase();
  const isAuto =
    label.toLowerCase().includes("autosave") ||
    label.toLowerCase().includes("auto snapshot") ||
    reasonLower.startsWith("autosave:");
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    threadId: row.thread_id != null ? String(row.thread_id) : null,
    label,
    reason,
    appVersion: row.app_version != null ? String(row.app_version) : null,
    schemaVersion:
      row.schema_version != null ? Number(row.schema_version) : null,
    isAuto,
    replayHash: row.replay_hash != null ? String(row.replay_hash) : null,
    createdAt: String(row.created_at),
    payloadJson: String(row.payload_json ?? "{}"),
  };
}

export function validateSnapshotMetadata(
  snapshot: SnapshotRecord,
): SnapshotMetadataValidation {
  const issues: string[] = [];
  if (!snapshot.id?.trim()) issues.push("missing-id");
  if (!snapshot.workspaceId?.trim()) issues.push("missing-workspace-id");
  if (!snapshot.createdAt?.trim()) issues.push("missing-created-at");
  if (!snapshot.label?.trim()) issues.push("missing-label");
  try {
    JSON.parse(snapshot.payloadJson);
  } catch {
    issues.push("invalid-payload-json");
  }
  return { valid: issues.length === 0, issues };
}

export function listSnapshots(
  db: Database.Database,
  workspaceId: string,
): SnapshotRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM snapshots WHERE workspace_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .all(workspaceId) as Record<string, unknown>[];
  return rows.map(mapSnapshotFromRow);
}

export function getSnapshotRestoreInfo(snapshot: SnapshotRecord): {
  lastRestoredAt: string | null;
  restoreStatus: "never" | "completed" | "failed" | null;
  restoredFromLabel: boolean;
} {
  try {
    const raw = JSON.parse(snapshot.payloadJson) as {
      restoreHistory?: Array<{ restoredAt: string; status: string }>;
      checkpointVersion?: number;
    };
    const history = raw.restoreHistory ?? [];
    if (history.length === 0) {
      return { lastRestoredAt: null, restoreStatus: null, restoredFromLabel: false };
    }
    const last = history[history.length - 1];
    return {
      lastRestoredAt: last.restoredAt,
      restoreStatus: last.status === "completed" ? "completed" : "failed",
      restoredFromLabel: last.status === "completed",
    };
  } catch {
    return { lastRestoredAt: null, restoreStatus: null, restoredFromLabel: false };
  }
}

function fallbackLabel(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `Snapshot ${stamp}`;
}

export function createManualSnapshot(
  db: Database.Database,
  workspaceId: string,
  options?: { threadId?: string | null; label?: string },
): SnapshotRecord {
  const label = options?.label?.trim() || fallbackLabel();
  if (label.length > 200) {
    throw new Error("Snapshot label must be 200 characters or fewer.");
  }

  const ws = db
    .prepare("SELECT id FROM workspaces WHERE id = ?")
    .get(workspaceId) as { id: string } | undefined;
  if (!ws) {
    throw new Error("Workspace not found.");
  }

  if (options?.threadId) {
    const thread = db
      .prepare("SELECT id FROM threads WHERE id = ? AND workspace_id = ?")
      .get(options.threadId, workspaceId) as { id: string } | undefined;
    if (!thread) {
      throw new Error("Thread not found in workspace.");
    }
  }

  const id = uuid();
  const now = new Date().toISOString();
  const reason = "manual";

  return runInTransaction(db, () => {
    const existing = db.prepare("SELECT id FROM snapshots WHERE id = ?").get(id);
    if (existing) {
      throw new Error("Snapshot ID collision — retry.");
    }

    const checkpoint = captureWorkspaceCheckpoint(
      db,
      workspaceId,
      options?.threadId ?? null,
    );
    const version = getVersionStamp();
    const replayHash = computeDeterministicReplayHash(
      checkpointMessagesToReplayHashInput(checkpoint.messages),
    );

    db.prepare(
      `INSERT INTO snapshots (id, workspace_id, thread_id, label, payload_json, created_at, snapshot_reason, app_version, schema_version, replay_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      workspaceId,
      options?.threadId ?? null,
      label,
      serializeCheckpointPayload(checkpoint),
      now,
      reason,
      version.appVersion,
      version.schemaVersion,
      replayHash,
    );

    appendTimelineEvent(db, {
      workspaceId,
      threadId: options?.threadId ?? null,
      type: "snapshot_created",
      title: "Manual snapshot saved",
      description: label,
      source: "user",
    });

    recordSuccessfulPersistence(db);

    return mapSnapshotFromRow(
      db.prepare("SELECT * FROM snapshots WHERE id = ?").get(id) as Record<
        string,
        unknown
      >,
    );
  });
}

export function validateSnapshotForRestore(
  db: Database.Database,
  snapshotId: string,
  workspaceId?: string,
): SnapshotRestorePlaceholder {
  const row = db
    .prepare("SELECT * FROM snapshots WHERE id = ?")
    .get(snapshotId) as Record<string, unknown> | undefined;

  if (!row) {
    return {
      canRestore: false,
      message: "Snapshot not found. Nothing was changed.",
      snapshotId,
    };
  }

  const snapshot = mapSnapshotFromRow(row);
  const meta = validateSnapshotMetadata(snapshot);
  if (!meta.valid) {
    return {
      canRestore: false,
      message: `Snapshot metadata is incomplete (${meta.issues.join(", ")}).`,
      snapshotId,
    };
  }

  if (workspaceId && snapshot.workspaceId !== workspaceId) {
    return {
      canRestore: false,
      message: "Snapshot does not belong to this workspace.",
      snapshotId,
    };
  }

  if (!parseCheckpointPayload(snapshot.payloadJson)) {
    return {
      canRestore: false,
      message: "This snapshot has no checkpoint data and cannot be restored.",
      snapshotId,
    };
  }

  if (
    snapshot.schemaVersion != null &&
    snapshot.schemaVersion > SCHEMA_VERSION
  ) {
    return {
      canRestore: false,
      message:
        "This snapshot was created with a newer ContinuityOS build. Restore will be available in a future release after you update the app.",
      snapshotId,
    };
  }

  return {
    canRestore: true,
    message:
      "Snapshot is valid. Automated restore execution will be available in a future release; use export or manual recovery until then.",
    snapshotId,
  };
}

export function getLastSnapshotTime(
  db: Database.Database,
  workspaceId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT created_at FROM snapshots WHERE workspace_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(workspaceId) as { created_at: string } | undefined;
  return row?.created_at ?? null;
}
