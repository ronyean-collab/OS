import type Database from "better-sqlite3";
import type { Message, MessageRole, MessageStatus } from "../../../src/shared/types";
import { getVersionStamp, type VersionStamp } from "../../../src/shared/app-version";
import { reconstructThreadMessages } from "./thread-reconstruction";

export const CHECKPOINT_VERSION = 1;

export type CheckpointThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type CheckpointMessage = {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  provider: string | null;
  model: string | null;
  rawProviderPayload: string | null;
  messageStatus: MessageStatus;
  createdAt: string;
};

export type SnapshotCheckpointPayload = {
  checkpointVersion: number;
  scope: "thread" | "workspace";
  workspaceId: string;
  capturedAt: string;
  capturedWith?: VersionStamp;
  workspaceName?: string;
  continuitySummary?: string | null;
  threads: CheckpointThread[];
  messages: CheckpointMessage[];
  restoreHistory?: Array<{
    restoredAt: string;
    status: "completed" | "failed";
    preRecoverySnapshotPath?: string | null;
  }>;
};

export function captureWorkspaceCheckpoint(
  db: Database.Database,
  workspaceId: string,
  threadId?: string | null,
): SnapshotCheckpointPayload {
  const capturedAt = new Date().toISOString();
  const scope = threadId ? "thread" : "workspace";

  const threadRows = threadId
    ? (db
        .prepare("SELECT * FROM threads WHERE id = ? AND workspace_id = ?")
        .all(threadId, workspaceId) as Record<string, unknown>[])
    : (db
        .prepare(
          `SELECT * FROM threads WHERE workspace_id = ?
           ORDER BY created_at ASC, id ASC`,
        )
        .all(workspaceId) as Record<string, unknown>[]);

  const threads: CheckpointThread[] = threadRows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));

  const messages: CheckpointMessage[] = [];
  for (const thread of threads) {
    const report = reconstructThreadMessages(db, thread.id);
    for (const m of report.messages) {
      messages.push({
        id: m.id,
        threadId: m.threadId,
        role: m.role,
        content: m.content,
        provider: m.provider,
        model: m.model,
        rawProviderPayload: m.rawProviderPayload,
        messageStatus: m.messageStatus,
        createdAt: m.createdAt,
      });
    }
  }

  messages.sort((a, b) => {
    const t = a.createdAt.localeCompare(b.createdAt);
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });

  const wsRow = db
    .prepare("SELECT name, continuity_summary FROM workspaces WHERE id = ?")
    .get(workspaceId) as { name: string; continuity_summary: string | null } | undefined;

  return {
    checkpointVersion: CHECKPOINT_VERSION,
    scope,
    workspaceId,
    capturedAt,
    capturedWith: getVersionStamp(),
    workspaceName: wsRow?.name ?? undefined,
    continuitySummary:
      wsRow?.continuity_summary != null && String(wsRow.continuity_summary).length > 0
        ? String(wsRow.continuity_summary)
        : null,
    threads,
    messages,
  };
}

export function parseCheckpointPayload(
  payloadJson: string,
): SnapshotCheckpointPayload | null {
  try {
    const raw = JSON.parse(payloadJson) as Record<string, unknown>;
    if (raw.checkpointVersion !== CHECKPOINT_VERSION) return null;
    if (!Array.isArray(raw.threads) || !Array.isArray(raw.messages)) return null;
    return raw as unknown as SnapshotCheckpointPayload;
  } catch {
    return null;
  }
}

export function serializeCheckpointPayload(
  payload: SnapshotCheckpointPayload,
): string {
  return JSON.stringify(payload);
}

export function messageToCheckpoint(m: Message): CheckpointMessage {
  return {
    id: m.id,
    threadId: m.threadId,
    role: m.role,
    content: m.content,
    provider: m.provider,
    model: m.model,
    rawProviderPayload: m.rawProviderPayload,
    messageStatus: m.messageStatus,
    createdAt: m.createdAt,
  };
}
