import type Database from "better-sqlite3";
import type { Message, MessageRole } from "../../../src/shared/types";

const VALID_ROLES = new Set<MessageRole>(["user", "assistant", "system"]);

export type ThreadReconstructionReport = {
  threadId: string;
  messages: Message[];
  skipped: number;
  warnings: string[];
};

export function reconstructThreadMessages(
  db: Database.Database,
  threadId: string,
): ThreadReconstructionReport {
  const warnings: string[] = [];
  const rows = db
    .prepare(
      `SELECT m.*, t.workspace_id
       FROM messages m
       JOIN threads t ON t.id = m.thread_id
       WHERE m.thread_id = ?
       ORDER BY m.created_at ASC, m.id ASC`,
    )
    .all(threadId) as Array<Record<string, unknown>>;

  const seenIds = new Set<string>();
  const messages: Message[] = [];
  let skipped = 0;

  for (const row of rows) {
    const id = String(row.id ?? "");
    const role = String(row.role ?? "") as MessageRole;
    const content = typeof row.content === "string" ? row.content : "";
    const createdAt = String(row.created_at ?? "");

    if (!id || seenIds.has(id)) {
      skipped++;
      warnings.push(`duplicate-or-empty-id:${id || "empty"}`);
      continue;
    }
    if (!VALID_ROLES.has(role)) {
      skipped++;
      warnings.push(`invalid-role:${id}`);
      continue;
    }
    if (!createdAt) {
      skipped++;
      warnings.push(`missing-created-at:${id}`);
      continue;
    }

    seenIds.add(id);
    messages.push({
      id,
      threadId,
      role,
      content,
      provider: row.provider != null ? String(row.provider) : null,
      model: row.model != null ? String(row.model) : null,
      rawProviderPayload:
        row.raw_provider_payload != null
          ? String(row.raw_provider_payload)
          : null,
      messageStatus: normalizeMessageStatus(row.message_status),
      createdAt,
    });
  }

  validateRoleSequence(messages, warnings);
  checkOrphanedMessages(db, threadId, warnings);

  return { threadId, messages, skipped, warnings };
}

function normalizeMessageStatus(
  raw: unknown,
): Message["messageStatus"] {
  const s = String(raw ?? "completed");
  if (
    s === "streaming" ||
    s === "completed" ||
    s === "interrupted" ||
    s === "cancelled" ||
    s === "failed"
  ) {
    return s;
  }
  return "completed";
}

function validateRoleSequence(messages: Message[], warnings: string[]): void {
  let lastRole: MessageRole | null = null;
  for (const m of messages) {
    if (lastRole === "assistant" && m.role === "assistant") {
      warnings.push(`consecutive-assistant:${m.id}`);
    }
    lastRole = m.role;
  }
}

function checkOrphanedMessages(
  db: Database.Database,
  threadId: string,
  warnings: string[],
): void {
  const thread = db
    .prepare("SELECT id FROM threads WHERE id = ?")
    .get(threadId) as { id: string } | undefined;
  if (!thread) {
    warnings.push("orphaned-thread");
    return;
  }
  const dupes = db
    .prepare(
      `SELECT id, COUNT(*) as c FROM messages WHERE thread_id = ? GROUP BY id HAVING c > 1`,
    )
    .all(threadId) as Array<{ id: string; c: number }>;
  for (const d of dupes) {
    warnings.push(`duplicate-id-in-db:${d.id}`);
  }
}

export function validateAllThreadIds(db: Database.Database): string[] {
  const issues: string[] = [];
  const orphans = db
    .prepare(
      `SELECT m.id FROM messages m
       LEFT JOIN threads t ON t.id = m.thread_id
       WHERE t.id IS NULL`,
    )
    .all() as Array<{ id: string }>;
  for (const o of orphans) {
    issues.push(`orphaned-message:${o.id}`);
  }
  return issues;
}
