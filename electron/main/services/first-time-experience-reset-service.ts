import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import { runInTransaction } from "../database/transactions";
import {
  DEFAULT_ASSISTANT_NAME,
  ASSISTANT_PROFILE_ROW_ID,
  ensureAssistantProfile,
} from "./assistant-profile-service";
import { removeProviderApiKey } from "./provider-service";
import { createThreadInWorkspace } from "./thread-management-service";
import {
  getActiveWorkspaceId,
  setActiveThread,
  updateContinuitySummary,
} from "./workspace-service";
import type { ExperienceResetResult } from "../../../src/shared/first-time-user-experience";

function countSnapshots(db: Database.Database, workspaceId: string): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM snapshots WHERE workspace_id = ?")
    .get(workspaceId) as { c: number };
  return Number(row?.c ?? 0);
}

function clearAiLifeForWorkspace(db: Database.Database, workspaceId: string): void {
  const tables = [
    "ai_life_goals",
    "ai_life_projects",
    "ai_life_achievements",
    "ai_life_assistant_history",
    "ai_life_interests",
    "ai_life_snapshots",
    "ai_life_health_metrics",
  ] as const;
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`).run(workspaceId);
  }
}

function clearContinuityIntelligenceForWorkspace(
  db: Database.Database,
  workspaceId: string,
): void {
  db.prepare("DELETE FROM continuity_decision_records WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM continuity_open_question_records WHERE workspace_id = ?").run(
    workspaceId,
  );
  db.prepare("DELETE FROM continuity_intelligence_snapshots WHERE workspace_id = ?").run(
    workspaceId,
  );
  db.prepare("DELETE FROM continuity_health_metrics WHERE workspace_id = ?").run(workspaceId);
}

function clearMemoryForWorkspace(db: Database.Database, workspaceId: string): void {
  db.prepare("DELETE FROM memory_fragments WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM memory_states WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM compressed_memory_states WHERE workspace_id = ?").run(workspaceId);
  db.prepare("DELETE FROM user_profile_memory WHERE workspace_id = ?").run(workspaceId);
}

function removeAllProviderConfigs(db: Database.Database, workspaceId: string): void {
  const rows = db
    .prepare("SELECT provider FROM provider_configs WHERE workspace_id = ?")
    .all(workspaceId) as Array<{ provider: string }>;
  for (const row of rows) {
    try {
      removeProviderApiKey(db, workspaceId, row.provider);
    } catch {
      // key may already be absent
    }
  }
  db.prepare("DELETE FROM provider_configs WHERE workspace_id = ?").run(workspaceId);
  const metaPrefix = `provider_base_url_${workspaceId}_`;
  db.prepare("DELETE FROM app_meta WHERE key LIKE ?").run(`${metaPrefix}%`);
}

/**
 * Reset active workspace to a first-time user state.
 * Preserves snapshot / backup records only.
 */
export function resetWorkspaceExperience(
  db: Database.Database,
  workspaceId: string,
): ExperienceResetResult {
  const snapshotsPreserved = countSnapshots(db, workspaceId);

  return runInTransaction(db, () => {
    const messageCountRow = db
      .prepare(
        `SELECT COUNT(*) AS c FROM messages
         WHERE thread_id IN (SELECT id FROM threads WHERE workspace_id = ?)`,
      )
      .get(workspaceId) as { c: number };
    const threadCountRow = db
      .prepare("SELECT COUNT(*) AS c FROM threads WHERE workspace_id = ?")
      .get(workspaceId) as { c: number };
    const messagesRemoved = Number(messageCountRow?.c ?? 0);
    const threadsRemoved = Number(threadCountRow?.c ?? 0);

    db.prepare(
      `DELETE FROM messages
       WHERE thread_id IN (SELECT id FROM threads WHERE workspace_id = ?)`,
    ).run(workspaceId);
    db.prepare("DELETE FROM threads WHERE workspace_id = ?").run(workspaceId);
    db.prepare("DELETE FROM timeline_events WHERE workspace_id = ?").run(workspaceId);
    db.prepare("DELETE FROM continuity_records WHERE workspace_id = ?").run(workspaceId);

    clearMemoryForWorkspace(db, workspaceId);
    clearAiLifeForWorkspace(db, workspaceId);
    clearContinuityIntelligenceForWorkspace(db, workspaceId);
    removeAllProviderConfigs(db, workspaceId);

    updateContinuitySummary(db, workspaceId, "");
    db.prepare(
      "UPDATE workspaces SET description = NULL, updated_at = ? WHERE id = ?",
    ).run(new Date().toISOString(), workspaceId);

    ensureAssistantProfile(db);
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE assistant_profile SET
        assistant_name = ?, assistant_created_at = ?, preferred_tone = 'friendly',
        web_enabled = 1, memory_enabled = 1, continuity_enabled = 1, updated_at = ?
       WHERE id = ?`,
    ).run(DEFAULT_ASSISTANT_NAME, now, now, ASSISTANT_PROFILE_ROW_ID);

    const thread = createThreadInWorkspace(db, workspaceId, "Main");
    const activeId = getActiveWorkspaceId(db);
    if (activeId === workspaceId) {
      setActiveThread(db, thread.id);
    }

    return {
      ok: true,
      workspaceId,
      threadsRemoved,
      messagesRemoved,
      snapshotsPreserved,
      message:
        "Experience reset complete. Backups preserved; conversations and onboarding flags cleared.",
    };
  });
}

/** Reset every workspace (dev testing — full machine fresh feel). */
export function resetAllWorkspacesExperience(db: Database.Database): ExperienceResetResult[] {
  const rows = db.prepare("SELECT id FROM workspaces").all() as Array<{ id: string }>;
  return rows.map((row) => resetWorkspaceExperience(db, row.id));
}
