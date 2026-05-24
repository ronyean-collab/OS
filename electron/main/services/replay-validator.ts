import type Database from "better-sqlite3";
import { reconstructThreadMessages, validateAllThreadIds } from "./thread-reconstruction";
import { listSnapshots, validateSnapshotMetadata } from "./snapshot-service";
import { listTimelineEvents } from "./timeline-service";

export type ReplayValidationReport = {
  ok: boolean;
  warnings: string[];
  errors: string[];
  repairRecommendations: string[];
};

function checkChronologicalMessages(
  messages: Array<{ id: string; createdAt: string }>,
  threadId: string,
  warnings: string[],
  errors: string[],
): void {
  let lastTime = 0;
  for (const m of messages) {
    const t = new Date(m.createdAt).getTime();
    if (Number.isNaN(t)) {
      warnings.push(`message-${m.id}:invalid-timestamp`);
      continue;
    }
    if (t < lastTime) {
      errors.push(`thread-${threadId}:non-chronological-message-${m.id}`);
    }
    lastTime = t;
  }
}

export function validateWorkspaceReplay(
  db: Database.Database,
  workspaceId: string,
): ReplayValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const repairRecommendations: string[] = [];

  const ws = db
    .prepare("SELECT id FROM workspaces WHERE id = ?")
    .get(workspaceId) as { id: string } | undefined;
  if (!ws) {
    return {
      ok: false,
      warnings,
      errors: ["workspace-not-found"],
      repairRecommendations: ["Verify workspace exists before replay validation."],
    };
  }

  const globalOrphans = validateAllThreadIds(db).filter((i) =>
    i.startsWith("orphaned-message"),
  );
  for (const o of globalOrphans) {
    errors.push(o);
    repairRecommendations.push(
      "Review orphaned messages — do not delete without export backup.",
    );
  }

  const threads = db
    .prepare("SELECT id FROM threads WHERE workspace_id = ? ORDER BY created_at ASC")
    .all(workspaceId) as Array<{ id: string }>;

  const seenMessageIds = new Set<string>();

  for (const { id: threadId } of threads) {
    const report = reconstructThreadMessages(db, threadId);
    warnings.push(...report.warnings.map((w) => `thread-${threadId}:${w}`));

    for (const m of report.messages) {
      if (seenMessageIds.has(m.id)) {
        errors.push(`duplicate-message-id:${m.id}`);
      }
      seenMessageIds.add(m.id);
    }

    checkChronologicalMessages(report.messages, threadId, warnings, errors);
  }

  const timeline = listTimelineEvents(db, workspaceId, 500);
  const timelineIds = new Set<string>();
  for (const evt of timeline) {
    if (timelineIds.has(evt.id)) {
      errors.push(`duplicate-timeline-id:${evt.id}`);
    }
    timelineIds.add(evt.id);

    if (evt.threadId) {
      const thread = db
        .prepare("SELECT id FROM threads WHERE id = ? AND workspace_id = ?")
        .get(evt.threadId, workspaceId) as { id: string } | undefined;
      if (!thread) {
        warnings.push(`timeline-${evt.id}:orphaned-thread-reference`);
      }
    }
  }

  const snapshots = listSnapshots(db, workspaceId);
  const snapshotIds = new Set<string>();
  for (const snap of snapshots) {
    if (snapshotIds.has(snap.id)) {
      errors.push(`duplicate-snapshot-id:${snap.id}`);
    }
    snapshotIds.add(snap.id);

    const meta = validateSnapshotMetadata(snap);
    if (!meta.valid) {
      warnings.push(`snapshot-${snap.id}:${meta.issues.join(",")}`);
    }

    if (snap.threadId) {
      const thread = db
        .prepare("SELECT id FROM threads WHERE id = ?")
        .get(snap.threadId) as { id: string } | undefined;
      if (!thread) {
        warnings.push(`snapshot-${snap.id}:orphaned-thread-reference`);
      }
    }
  }

  if (errors.some((e) => e.includes("orphaned"))) {
    repairRecommendations.push(
      "Export workspace package before any manual repair.",
    );
  }
  if (errors.some((e) => e.includes("duplicate"))) {
    repairRecommendations.push(
      "Inspect duplicate IDs — canonical history may need manual review.",
    );
  }
  if (warnings.length > 0 && errors.length === 0) {
    repairRecommendations.push(
      "Warnings only — continuity is readable; review before replay.",
    );
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
    repairRecommendations,
  };
}
