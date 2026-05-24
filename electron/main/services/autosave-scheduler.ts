import type Database from "better-sqlite3";
import type { TimelineEventType } from "../../../src/shared/types";
import { runInTransaction } from "../database/transactions";
import { captureWorkspaceCheckpoint, serializeCheckpointPayload } from "./snapshot-checkpoint";
import {
  checkpointMessagesToReplayHashInput,
  computeDeterministicReplayHash,
} from "./replay-hash";
import { getVersionStamp } from "../../../src/shared/app-version";
import { v4 as uuid } from "uuid";
import { appendTimelineEvent } from "./continuity-service";
import { recordSuccessfulPersistence } from "./reliability-metrics";

const META_LAST_AUTOSAVE = "autosave_last_at";
const META_LAST_AUTOSAVE_WS = "autosave_last_workspace_id";

export const AUTOSAVE_MIN_INTERVAL_MS = Number(
  process.env.CONTINUITY_AUTOSAVE_INTERVAL_MS ?? 5 * 60 * 1000,
);

const MEANINGFUL_EVENT_TYPES = new Set<TimelineEventType>([
  "message_added",
  "assistant_response_completed",
  "assistant_response_interrupted",
  "assistant_response_failed",
  "thread_created",
  "workspace_import_completed",
  "snapshot_restore_completed",
]);

export type AutosaveStatus = {
  lastAutosaveAt: string | null;
  nextEligibleAt: string | null;
  cooldownActive: boolean;
  minIntervalMs: number;
};

function readMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function writeMeta(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)").run(
    key,
    value,
  );
}

export function getAutosaveStatus(db: Database.Database): AutosaveStatus {
  const last = readMeta(db, META_LAST_AUTOSAVE);
  const lastMs = last ? new Date(last).getTime() : 0;
  const nextMs = lastMs > 0 ? lastMs + AUTOSAVE_MIN_INTERVAL_MS : 0;
  const now = Date.now();
  return {
    lastAutosaveAt: last,
    nextEligibleAt:
      nextMs > 0 ? new Date(nextMs).toISOString() : null,
    cooldownActive: lastMs > 0 && now < nextMs,
    minIntervalMs: AUTOSAVE_MIN_INTERVAL_MS,
  };
}

export type AutosaveScheduleResult = {
  created: boolean;
  skippedReason?: string;
  snapshotId?: string;
};

export function maybeScheduleAutosave(
  db: Database.Database,
  input: {
    workspaceId: string;
    threadId?: string | null;
    eventType: TimelineEventType;
    reason: string;
  },
): AutosaveScheduleResult {
  if (!MEANINGFUL_EVENT_TYPES.has(input.eventType)) {
    return { created: false, skippedReason: "not-meaningful-event" };
  }

  const status = getAutosaveStatus(db);
  if (status.cooldownActive) {
    return { created: false, skippedReason: "cooldown-active" };
  }

  const lastWs = readMeta(db, META_LAST_AUTOSAVE_WS);
  const duplicateWindow = readMeta(db, META_LAST_AUTOSAVE);
  if (
    lastWs === input.workspaceId &&
    duplicateWindow &&
    Date.now() - new Date(duplicateWindow).getTime() < 2000
  ) {
    return { created: false, skippedReason: "duplicate-burst" };
  }

  return runInTransaction(db, () => {
    const id = uuid();
    const now = new Date().toISOString();
    const version = getVersionStamp();
    const checkpoint = captureWorkspaceCheckpoint(
      db,
      input.workspaceId,
      input.threadId ?? null,
    );
    const replayHash = computeDeterministicReplayHash(
      checkpointMessagesToReplayHashInput(checkpoint.messages),
    );

    db.prepare(
      `INSERT INTO snapshots (id, workspace_id, thread_id, label, payload_json, created_at, snapshot_reason, app_version, schema_version, replay_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.workspaceId,
      input.threadId ?? null,
      `Autosave — ${input.reason}`,
      serializeCheckpointPayload(checkpoint),
      now,
      `autosave:${input.reason}`,
      version.appVersion,
      version.schemaVersion,
      replayHash,
    );

    appendTimelineEvent(db, {
      workspaceId: input.workspaceId,
      threadId: input.threadId ?? null,
      type: "snapshot_created",
      title: "Autosave snapshot",
      description: input.reason,
      source: "system",
    });

    writeMeta(db, META_LAST_AUTOSAVE, now);
    writeMeta(db, META_LAST_AUTOSAVE_WS, input.workspaceId);
    recordSuccessfulPersistence(db);

    return { created: true, snapshotId: id };
  });
}
