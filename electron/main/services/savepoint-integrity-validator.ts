import type Database from "better-sqlite3";

export type SavepointIntegrityIssue = {
  savepointId: string;
  issue: string;
};

export type SavepointIntegrityReport = {
  ok: boolean;
  checkedCount: number;
  issues: SavepointIntegrityIssue[];
  lastKnownGoodSavepointId: string | null;
};

export function validateMemorySavepoints(
  db: Database.Database,
  workspaceId: string,
): SavepointIntegrityReport {
  const rows = db
    .prepare(
      `SELECT ms.id, ms.active_thread_id, ms.recent_message_checkpoint, ms.continuity_state_snapshot_json, ms.created_at
       FROM memory_savepoints ms
       WHERE ms.workspace_id = ?
       ORDER BY ms.created_at DESC`,
    )
    .all(workspaceId) as Array<{
    id: string;
    active_thread_id: string;
    recent_message_checkpoint: string;
    continuity_state_snapshot_json: string;
    created_at: string;
  }>;

  const issues: SavepointIntegrityIssue[] = [];
  let lastKnownGoodSavepointId: string | null = null;

  for (const row of rows) {
    const threadExists = db
      .prepare("SELECT 1 FROM threads WHERE id = ? AND workspace_id = ?")
      .get(row.active_thread_id, workspaceId) as { 1: number } | undefined;
    if (!threadExists) {
      issues.push({ savepointId: row.id, issue: "missing-active-thread" });
      continue;
    }

    const messageExists = db
      .prepare("SELECT 1 FROM messages WHERE id = ?")
      .get(row.recent_message_checkpoint) as { 1: number } | undefined;
    if (!messageExists) {
      issues.push({ savepointId: row.id, issue: "missing-checkpoint-message" });
      continue;
    }

    try {
      const parsed = JSON.parse(row.continuity_state_snapshot_json) as Record<string, unknown>;
      const required = [
        "currentGoals",
        "importantFacts",
        "decisions",
        "openLoops",
        "userPreferences",
        "recentSummary",
      ];
      if (!required.every((key) => key in parsed)) {
        issues.push({ savepointId: row.id, issue: "invalid-state-snapshot-shape" });
        continue;
      }
    } catch {
      issues.push({ savepointId: row.id, issue: "invalid-state-snapshot-json" });
      continue;
    }

    if (!lastKnownGoodSavepointId) {
      lastKnownGoodSavepointId = row.id;
    }
  }

  return {
    ok: issues.length === 0,
    checkedCount: rows.length,
    issues,
    lastKnownGoodSavepointId,
  };
}
