import type Database from "better-sqlite3";
import { reconstructThreadMessages } from "./thread-reconstruction";
import { listTimelineEvents } from "./timeline-service";
import { appendAuditEvent } from "./reliability-audit";
import {
  computeDeterministicReplayHash,
  messagesToReplayHashInput,
} from "./replay-hash";

export type ReplaySequenceReport = {
  ok: boolean;
  messageOrderValid: boolean;
  timelineOrderValid: boolean;
  replayHash: string;
  /** @deprecated alias */
  replayHashPlaceholder: string;
  warnings: string[];
  errors: string[];
};

export function validateReplaySequence(
  db: Database.Database,
  workspaceId: string,
): ReplaySequenceReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const allMessages = [];

  const threads = db
    .prepare(
      `SELECT id FROM threads WHERE workspace_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .all(workspaceId) as Array<{ id: string }>;

  let messageOrderValid = true;
  for (const { id: threadId } of threads) {
    const report = reconstructThreadMessages(db, threadId);
    allMessages.push(...report.messages);
    for (let i = 1; i < report.messages.length; i++) {
      const prev = new Date(report.messages[i - 1].createdAt).getTime();
      const cur = new Date(report.messages[i].createdAt).getTime();
      if (!Number.isNaN(prev) && !Number.isNaN(cur) && cur < prev) {
        messageOrderValid = false;
        errors.push(`replay-sequence-message:${threadId}`);
      }
    }
  }

  const timelineChronological = [...listTimelineEvents(db, workspaceId, 500)].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  let timelineOrderValid = true;
  for (let i = 1; i < timelineChronological.length; i++) {
    if (timelineChronological[i].createdAt < timelineChronological[i - 1].createdAt) {
      timelineOrderValid = false;
      errors.push("replay-sequence-timeline");
      break;
    }
  }

  const replayHash = computeDeterministicReplayHash(
    messagesToReplayHashInput(allMessages),
  );

  appendAuditEvent({
    type: "replay_audit",
    workspaceId,
    message: "Replay sequence validation",
    details: {
      replayHash,
      messageOrderValid,
      timelineOrderValid,
    },
  });

  return {
    ok: messageOrderValid && timelineOrderValid && errors.length === 0,
    messageOrderValid,
    timelineOrderValid,
    replayHash,
    replayHashPlaceholder: replayHash,
    warnings,
    errors,
  };
}

export function auditRestoreReplay(
  workspaceId: string,
  snapshotId: string,
  replayHash: string,
): void {
  appendAuditEvent({
    type: "restore_attempt",
    workspaceId,
    snapshotId,
    message: "Restore replay audit",
    details: { replayHash, phase: "post-restore-sequence" },
  });
}
