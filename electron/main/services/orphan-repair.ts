import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import { runInTransaction } from "../database/transactions";
import { appendTimelineEvent } from "./continuity-service";
import { getMeta, setMeta } from "./workspace-service";
import { appendAuditEvent } from "./reliability-audit";
import { recordSuccessfulPersistence } from "./reliability-metrics";

export const ORPHAN_QUARANTINE_META_KEY = "message_orphan_quarantine_v1";
const RECOVERED_THREAD_TITLE = "Recovered Messages";

export type OrphanMessageRow = {
  id: string;
  threadId: string;
  role: string;
  createdAt: string;
  contentPreview: string;
};

export type OrphanRepairRecommendation = "attach_to_recovered_thread" | "quarantine";

export type OrphanRepairPreview = {
  orphanCount: number;
  samples: OrphanMessageRow[];
  recommendations: OrphanRepairRecommendation[];
  workspaceExists: boolean;
  workspaceId: string | null;
  message: string;
};

export type OrphanRepairResult = {
  ok: boolean;
  message: string;
  repairedCount: number;
  recoveredThreadId?: string;
  quarantinedCount?: number;
};

/** Dev/diagnostic: rows with no matching thread (messages has no workspace_id column). */
export function listOrphanedMessageRows(db: Database.Database): OrphanMessageRow[] {
  const rows = db
    .prepare(
      `SELECT m.id, m.thread_id, m.role, m.created_at, substr(m.content, 1, 80) AS preview
       FROM messages m
       LEFT JOIN threads t ON t.id = m.thread_id
       WHERE t.id IS NULL
       ORDER BY m.created_at ASC
       LIMIT 200`,
    )
    .all() as Array<{
    id: string;
    thread_id: string;
    role: string;
    created_at: string;
    preview: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    threadId: r.thread_id,
    role: r.role,
    createdAt: r.created_at,
    contentPreview: r.preview ?? "",
  }));
}

export function countOrphanedMessages(db: Database.Database): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM messages m
       LEFT JOIN threads t ON t.id = m.thread_id
       WHERE t.id IS NULL`,
    )
    .get() as { c: number };
  return row.c;
}

export function buildOrphanRepairPreview(
  db: Database.Database,
  workspaceId?: string | null,
): OrphanRepairPreview {
  const orphans = listOrphanedMessageRows(db);
  const wsId = workspaceId?.trim() || null;
  const workspaceExists = wsId
    ? Boolean(
        db.prepare("SELECT id FROM workspaces WHERE id = ?").get(wsId) as
          | { id: string }
          | undefined,
      )
    : false;

  const recommendations: OrphanRepairRecommendation[] = [];
  if (orphans.length === 0) {
    return {
      orphanCount: 0,
      samples: [],
      recommendations: [],
      workspaceExists,
      workspaceId: wsId,
      message: "No orphaned messages detected.",
    };
  }

  if (workspaceExists) {
    recommendations.push("attach_to_recovered_thread");
  }
  recommendations.push("quarantine");

  const attachNote = workspaceExists
    ? `Attach ${orphans.length} message(s) to a new “${RECOVERED_THREAD_TITLE}” thread in this workspace.`
    : "Select a valid workspace before attaching orphans.";

  return {
    orphanCount: orphans.length,
    samples: orphans.slice(0, 8),
    recommendations,
    workspaceExists,
    workspaceId: wsId,
    message: `${orphans.length} orphaned message(s) block export validation. ${attachNote} Or quarantine copies into local recovery metadata (removes rows from messages after confirmation).`,
  };
}

type QuarantinedOrphanRecord = {
  messageId: string;
  originalThreadId: string;
  role: string;
  content: string;
  provider: string | null;
  model: string | null;
  rawProviderPayload: string | null;
  messageStatus: string;
  createdAt: string;
  quarantinedAt: string;
  workspaceIdHint: string | null;
};

function loadQuarantine(db: Database.Database): QuarantinedOrphanRecord[] {
  const raw = getMeta(db, ORPHAN_QUARANTINE_META_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as QuarantinedOrphanRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQuarantine(db: Database.Database, records: QuarantinedOrphanRecord[]): void {
  setMeta(db, ORPHAN_QUARANTINE_META_KEY, JSON.stringify(records));
}

export function executeAttachOrphansToRecoveredThread(
  db: Database.Database,
  workspaceId: string,
): OrphanRepairResult {
  const preview = buildOrphanRepairPreview(db, workspaceId);
  if (preview.orphanCount === 0) {
    return { ok: true, message: "No orphaned messages to repair.", repairedCount: 0 };
  }
  if (!preview.workspaceExists) {
    return { ok: false, message: "Workspace not found — repair aborted.", repairedCount: 0 };
  }

  try {
    const result = runInTransaction(db, () => {
      const recoveredThreadId = uuid();
      const now = new Date().toISOString();
      const sortRow = db
        .prepare(
          `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM threads WHERE workspace_id = ?`,
        )
        .get(workspaceId) as { next_order: number };
      db.prepare(
        `INSERT INTO threads (id, workspace_id, title, created_at, updated_at, sort_order, archived_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
      ).run(
        recoveredThreadId,
        workspaceId,
        RECOVERED_THREAD_TITLE,
        now,
        now,
        sortRow.next_order,
      );

      const orphans = listOrphanedMessageRows(db);
      const update = db.prepare("UPDATE messages SET thread_id = ? WHERE id = ?");

      for (const orphan of orphans) {
        update.run(recoveredThreadId, orphan.id);
      }

      appendTimelineEvent(db, {
        workspaceId,
        threadId: recoveredThreadId,
        type: "workspace_import_completed",
        title: "Orphaned messages recovered",
        description: `Attached ${orphans.length} orphaned message(s) to “${RECOVERED_THREAD_TITLE}”.`,
        source: "recovery",
      });

      recordSuccessfulPersistence(db);
      return { recoveredThreadId, count: orphans.length };
    });

    appendAuditEvent({
      type: "import_completed",
      workspaceId,
      message: "Orphan messages attached to recovered thread",
      details: {
        repairedCount: result.count,
        recoveredThreadId: result.recoveredThreadId,
      },
    });

    return {
      ok: true,
      message: `Attached ${result.count} orphaned message(s) to “${RECOVERED_THREAD_TITLE}”.`,
      repairedCount: result.count,
      recoveredThreadId: result.recoveredThreadId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Orphan repair failed";
    appendAuditEvent({
      type: "import_failed",
      workspaceId,
      message: msg,
      details: { action: "attach_orphans" },
    });
    return { ok: false, message: msg, repairedCount: 0 };
  }
}

export function executeQuarantineOrphanedMessages(
  db: Database.Database,
  workspaceIdHint?: string | null,
): OrphanRepairResult {
  const orphans = listOrphanedMessageRows(db);
  if (orphans.length === 0) {
    return { ok: true, message: "No orphaned messages to quarantine.", repairedCount: 0 };
  }

  try {
    const count = runInTransaction(db, () => {
      const existing = loadQuarantine(db);
      const now = new Date().toISOString();
      const select = db.prepare("SELECT * FROM messages WHERE id = ?");
      const remove = db.prepare("DELETE FROM messages WHERE id = ?");

      for (const orphan of orphans) {
        const row = select.get(orphan.id) as Record<string, unknown> | undefined;
        if (!row) continue;

        existing.push({
          messageId: orphan.id,
          originalThreadId: String(row.thread_id),
          role: String(row.role),
          content: String(row.content),
          provider: row.provider != null ? String(row.provider) : null,
          model: row.model != null ? String(row.model) : null,
          rawProviderPayload:
            row.raw_provider_payload != null
              ? String(row.raw_provider_payload)
              : null,
          messageStatus: String(row.message_status ?? "completed"),
          createdAt: String(row.created_at),
          quarantinedAt: now,
          workspaceIdHint: workspaceIdHint ?? null,
        });
        remove.run(orphan.id);
      }

      saveQuarantine(db, existing);

      if (workspaceIdHint) {
        const ws = db
          .prepare("SELECT id FROM workspaces WHERE id = ?")
          .get(workspaceIdHint) as { id: string } | undefined;
        if (ws) {
          appendTimelineEvent(db, {
            workspaceId: workspaceIdHint,
            type: "recovery_mode_entered",
            title: "Orphaned messages quarantined",
            description: `Quarantined ${orphans.length} orphaned message(s) into local recovery metadata.`,
            source: "recovery",
          });
        }
      }

      recordSuccessfulPersistence(db);
      return orphans.length;
    });

    appendAuditEvent({
      type: "import_completed",
      workspaceId: workspaceIdHint ?? null,
      message: "Orphan messages quarantined",
      details: { quarantinedCount: count },
    });

    return {
      ok: true,
      message: `Quarantined ${count} orphaned message(s). Export can proceed if no other issues remain.`,
      repairedCount: 0,
      quarantinedCount: count,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Quarantine failed";
    return { ok: false, message: msg, repairedCount: 0 };
  }
}
